import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { batchSize = 5 } = await req.json();

    console.log(`[Japantravel] Starting to process pending URL extractions (batch size: ${batchSize})`);

    // pending 상태의 레코드 조회
    const pendingRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      processing_status: 'pending'
    }, '-created_date', batchSize);

    if (!pendingRecords || pendingRecords.length === 0) {
      return Response.json({
        success: true,
        message: 'No pending extractions to process',
        processed: 0,
        succeeded: 0,
        failed: 0
      });
    }

    console.log(`[Japantravel] Found ${pendingRecords.length} pending records to process`);

    let succeeded = 0;
    let failed = 0;

    for (const record of pendingRecords) {
      console.log(`[Japantravel] Processing: ${record.source_url}`);

      // processing 상태로 업데이트
      await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(record.id, {
        processing_status: 'processing'
      });

      try {
        // extractJapantravelFestivalFromUrl 함수 호출
        const extractResult = await base44.asServiceRole.functions.invoke('extractJapantravelFestivalFromUrl', {
          url: record.source_url
        });

        if (extractResult.success) {
          // 성공: processed 상태로 업데이트
          await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(record.id, {
            processing_status: 'processed',
            error_message: null
          });
          succeeded++;
          console.log(`[Japantravel] ✅ Successfully processed: ${record.source_url}`);
        } else {
          // 실패: failed 상태로 업데이트
          await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(record.id, {
            processing_status: 'failed',
            error_message: extractResult.error || 'Unknown error'
          });
          failed++;
          console.log(`[Japantravel] ❌ Failed to process: ${record.source_url} - ${extractResult.error}`);
        }
      } catch (error) {
        // 예외 발생: failed 상태로 업데이트
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(record.id, {
          processing_status: 'failed',
          error_message: error.message || 'Unknown error'
        });
        failed++;
        console.error(`[Japantravel] ❌ Error processing ${record.source_url}:`, error);
      }

      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return Response.json({
      success: true,
      message: `Processed ${pendingRecords.length} pending extractions`,
      processed: pendingRecords.length,
      succeeded,
      failed
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