import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { batchSize = 1, linkIds } = await req.json();

    console.log(`[Japantravel] Starting to process pending links (batch size: ${batchSize})`);

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
      // 30분 이상 processing 상태로 멈춰있는 링크를 먼저 failed로 리셋
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
            update_time: new Date().toISOString()
          });
        }
      }

      // pending 또는 failed 상태의 링크 조회
      pendingLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({
        processing_status: { $in: ['pending', 'failed'] }
      }, '-created_date', batchSize);
    }

    if (!pendingLinks || pendingLinks.length === 0) {
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
          update_time: new Date().toISOString()
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
            update_time: new Date().toISOString()
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
            update_time: new Date().toISOString()
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
            update_time: new Date().toISOString()
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