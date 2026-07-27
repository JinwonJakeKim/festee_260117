import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 워크플로우(스케줄러) 호출은 Authorization 헤더가 없고
    // base44.auth.me()가 null을 반환합니다. 이 경우 관리자 검사를 건너뛰고
    // 서비스 역할로 처리를 진행합니다. 앱 사용자가 직접 호출한 경우에만
    // 관리자 권한을 검사합니다.
    const authHeader = req.headers.get('Authorization');
    let user = null;
    if (authHeader) {
      try { user = await base44.auth.me(); } catch (e) { user = null; }
    }
    if (authHeader && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const AUTOMATION_NAME = 'japantravel_extract';
    const { batchSize = 1, linkIds } = await req.json();

    // 자동 일괄 추출이 활성화되어 있는지 확인 (linkIds가 명시된 수동 호출은 검사 생략)
    if (!linkIds || !Array.isArray(linkIds) || linkIds.length === 0) {
      const settings = await base44.asServiceRole.entities.AutomationSetting.filter(
        { automation_name: AUTOMATION_NAME },
        '-updated_date',
        5
      );
      const setting = settings[0];
      const isActive = setting?.is_active === true &&
        !!setting.active_until &&
        new Date(setting.active_until).getTime() > Date.now();

      if (!isActive) {
        return Response.json({
          success: true,
          skipped: true,
          message: 'Automation inactive - skipped',
          processed: 0,
          succeededCount: 0,
          failedCount: 0
        });
      }
    }

    console.log(`[Japantravel] ⏰ Starting to process pending links (batch size: ${batchSize})`);

    let pendingLinks;

    // linkIds가 제공되면 해당 링크들만 처리, 없으면 pending/failed 상태 링크 조회
    if (linkIds && Array.isArray(linkIds) && linkIds.length > 0) {
      console.log(`[Japantravel] Processing specific link IDs: ${linkIds.length} links`);
      pendingLinks = [];
      for (const id of linkIds.slice(0, batchSize)) {
        const link = await base44.asServiceRole.entities.JapantravelLinks.get(id);
        if (link) {
          pendingLinks.push(link);
        }
      }
    } else {
      // 30분(이 간격) 이상 processing 상태로 멈춰있는 링크를 먼저 failed로 리셋
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const stuckLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({
        processing_status: 'processing'
      }, '-updated_date', 20);

      for (const stuckLink of stuckLinks) {
        if (stuckLink.updated_date && new Date(stuckLink.updated_date) < new Date(thirtyMinutesAgo)) {
          console.log(`[Japantravel] Resetting stuck processing link: ${stuckLink.url}`);
          await base44.asServiceRole.entities.JapantravelLinks.update(stuckLink.id, {
            processing_status: 'failed',
            error_message: 'Stuck in processing state - auto reset',
            update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
          });
        }
      }

      // pending 또는 failed 상태의 링크 조회
      pendingLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({
        processing_status: { $in: ['pending', 'failed'] }
      }, '-created_date', batchSize);
    }

    if (!pendingLinks || pendingLinks.length === 0) {
      // 처리할 링크가 일시적으로 없더라도 자동화 상태는 유지
      // (TTL active_until로 만료 관리 → 이후 새로 pending이 유입되면 자동으로 이어서 처리)
      console.log('[Japantravel] No pending links right now - automation stays active (TTL-managed)');
      return Response.json({
        success: true,
        message: 'No pending links to process',
        processed: 0,
        succeededCount: 0,
        failedCount: 0
      });
    }

    console.log(`[Japantravel] Found ${pendingLinks.length} pending links to process`);

    let succeeded = 0;
    let failed = 0;

    for (const link of pendingLinks) {
      console.log(`[Japantravel] Processing: ${link.url}`);

      try {
        // processing 상태로 업데이트
        await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
          processing_status: 'processing',
          update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
        });

        // extractJapantravelFestivalFromUrl 함수 호출
        const { data: extractResult } = await base44.asServiceRole.functions.invoke('extractJapantravelFestivalFromUrl', {
          url: link.url
        });

        if (extractResult?.success && extractResult?.raw_data_id) {
          // 성공: processed 상태로 업데이트하고 raw_data_id 저장
          const rawDataRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({
            source_url: link.url
          }, '-created_date', 1);

          await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
            processing_status: 'processed',
            raw_data_id: rawDataRecords.length > 0 ? rawDataRecords[0].id : null,
            error_message: null,
            update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
          });
          succeeded++;
          console.log(`[Japantravel] ✅ Successfully processed: ${link.url}`);
        } else {
          // 실패: 구체적인 실패 이유 구성
          let failureReason = extractResult?.error || 'Unknown error';

          // extractResult가 없거나 success가 false인 경우 상세 분석
          if (!extractResult) {
            failureReason = 'No response from extraction function';
          } else if (!extractResult.success) {
            failureReason = extractResult.error || 'Extraction returned success=false (unknown cause)';
          } else if (!extractResult.raw_data_id) {
            failureReason = 'Extraction succeeded but no raw_data_id returned (DB save may have failed)';
          }

          // 추출 품질 정보가 있으면 어떤 필드가 실패했는지 추가
          if (extractResult?.extraction_quality) {
            const q = extractResult.extraction_quality;
            const missing = [];
            if (!q.name_extracted) missing.push('name');
            if (!q.dates_extracted) missing.push('dates');
            if (!q.city_extracted) missing.push('city');
            if (q.description_length === 0) missing.push('description');
            if (missing.length > 0) {
              failureReason += ` | Missing fields: ${missing.join(', ')}`;
            }
          }

          await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
            processing_status: 'failed',
            error_message: failureReason,
            update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
          });
          failed++;
          console.log(`[Japantravel] ❌ Failed to process: ${link.url} - ${failureReason}`);
        }
      } catch (error) {
        // 예외 발생: failed 상태로 업데이트
        try {
          await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
            processing_status: 'failed',
            error_message: error.message || 'Unknown error',
            update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
          });
        } catch (updateError) {
          console.error(`[Japantravel] ⚠️ Failed to update error status for ${link.url}:`, updateError);
        }
        failed++;
        console.error(`[Japantravel] ❌ Error processing ${link.url}:`, error);
      }

      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 처리 완료 - 자동화는 TTL(active_until)로 자동 만료되므로 여기서 비활성화하지 않음
    return Response.json({
      success: true,
      message: `Processed ${pendingLinks.length} links`,
      processed: pendingLinks.length,
      succeededCount: succeeded,
      failedCount: failed
    });

  } catch (error) {
    console.error('[Japantravel] Processing error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Unknown error',
      details: error.toString()
    }, { status: 500 });
  }
});