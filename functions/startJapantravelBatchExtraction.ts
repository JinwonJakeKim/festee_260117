import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { linkIds } = await req.json();

    if (!linkIds || !Array.isArray(linkIds) || linkIds.length === 0) {
      return Response.json({ 
        success: false,
        error: 'linkIds array is required and must not be empty' 
      }, { status: 400 });
    }

    console.log(`[Batch Extraction] Starting batch extraction for ${linkIds.length} links`);

    // 첫 3개 링크 처리
    const batchSize = 3;
    const currentBatch = linkIds.slice(0, batchSize);
    const remainingLinks = linkIds.slice(batchSize);

    console.log(`[Batch Extraction] Processing first ${currentBatch.length} links`);
    console.log(`[Batch Extraction] Remaining links: ${remainingLinks.length}`);

    // processPendingJapantravelUrlExtractions 함수 호출
    try {
      const result = await base44.asServiceRole.functions.invoke('processPendingJapantravelUrlExtractions', {
        batchSize: batchSize,
        linkIds: currentBatch
      });

      console.log(`[Batch Extraction] First batch processed:`, result);
    } catch (processingError) {
      console.error('[Batch Extraction] Error processing first batch:', processingError);
      return Response.json({
        success: false,
        error: 'Failed to process first batch',
        details: processingError.message
      }, { status: 500 });
    }

    // 남은 링크가 있으면 5분 후에 다음 배치 예약
    if (remainingLinks.length > 0) {
      const nextRunTime = new Date();
      nextRunTime.setMinutes(nextRunTime.getMinutes() + 5);

      console.log(`[Batch Extraction] Scheduling next batch of ${Math.min(batchSize, remainingLinks.length)} links at ${nextRunTime.toISOString()}`);

      // 자동화 생성 (one-time)
      const automationName = `Japantravel Batch ${nextRunTime.getTime()}`;
      
      try {
        await base44.asServiceRole.automations.create({
          automation_type: 'scheduled',
          name: automationName,
          description: `Auto-scheduled batch extraction for remaining ${remainingLinks.length} links`,
          function_name: 'startJapantravelBatchExtraction',
          function_args: {
            linkIds: remainingLinks
          },
          schedule_mode: 'one-time',
          one_time_date: nextRunTime.toISOString(),
          is_active: true
        });

        console.log(`[Batch Extraction] Successfully scheduled next batch`);

        return Response.json({
          success: true,
          message: `첫 ${currentBatch.length}개 링크 처리 완료. 남은 ${remainingLinks.length}개 링크는 5분 후 자동 처리됩니다.`,
          processed: currentBatch.length,
          remaining: remainingLinks.length,
          next_run: nextRunTime.toISOString()
        });
      } catch (automationError) {
        console.error('[Batch Extraction] Error creating automation:', automationError);
        return Response.json({
          success: false,
          error: 'Failed to schedule next batch',
          details: automationError.message,
          processed: currentBatch.length,
          remaining: remainingLinks.length
        }, { status: 500 });
      }
    } else {
      console.log(`[Batch Extraction] All links processed, no more batches to schedule`);
      
      return Response.json({
        success: true,
        message: `모든 ${currentBatch.length}개 링크 처리 완료!`,
        processed: currentBatch.length,
        remaining: 0
      });
    }

  } catch (error) {
    console.error('[Batch Extraction] Unexpected error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
});