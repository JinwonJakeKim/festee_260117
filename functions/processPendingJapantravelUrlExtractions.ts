import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { batchSize = 5, linkIds } = await req.json();

    console.log(`[Japantravel] Starting to process pending links (batch size: ${batchSize})`);

    let pendingLinks;
    
    // linkIds가 제공되면 해당 링크들만 처리, 없으면 pending 상태 링크 조회
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
      // 기존 방식: pending 상태의 링크 조회
      pendingLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({
        processing_status: 'pending'
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

      // processing 상태로 업데이트
      await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
        processing_status: 'processing'
      });

      try {
        // extractJapantravelFestivalFromUrl 함수 호출
        const { data: extractResult } = await base44.asServiceRole.functions.invoke('extractJapantravelFestivalFromUrl', {
          url: link.url
        });

        if (extractResult?.success && extractResult?.raw_records_saved > 0) {
          // 성공: processed 상태로 업데이트하고 raw_data_id 저장
          const rawDataRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
            source_url: link.url
          }, '-created_date', 1);
          
          await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
            processing_status: 'processed',
            raw_data_id: rawDataRecords.length > 0 ? rawDataRecords[0].id : null,
            error_message: null
          });
          succeeded++;
          console.log(`[Japantravel] ✅ Successfully processed: ${link.url}`);
        } else {
          // 실패: failed 상태로 업데이트
          await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
            processing_status: 'failed',
            error_message: extractResult?.error || 'No data extracted'
          });
          failed++;
          console.log(`[Japantravel] ❌ Failed to process: ${link.url} - ${extractResult?.error || 'No data extracted'}`);
        }
      } catch (error) {
        // 예외 발생: failed 상태로 업데이트
        await base44.asServiceRole.entities.JapantravelLinks.update(link.id, {
          processing_status: 'failed',
          error_message: error.message || 'Unknown error'
        });
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