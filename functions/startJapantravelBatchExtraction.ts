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

    console.log(`[Batch Extraction] Processing ${linkIds.length} links - first 3 immediately, rest via automation.`);

    // 모든 링크를 pending 상태로 설정
    let successfullyUpdated = 0;
    for (const linkId of linkIds) {
      try {
        await base44.asServiceRole.entities.JapantravelLinks.update(linkId, {
          processing_status: 'pending',
          error_message: null
        });
        successfullyUpdated++;
      } catch (updateError) {
        console.error(`[Batch Extraction] Failed to update link ${linkId}:`, updateError);
      }
    }

    // 첫 3개 즉시 처리
    const firstBatch = linkIds.slice(0, 3);
    console.log(`[Batch Extraction] Immediately processing first ${firstBatch.length} links...`);
    
    const { data: processResult } = await base44.asServiceRole.functions.invoke('processPendingJapantravelUrlExtractions', {
      linkIds: firstBatch,
      batchSize: 3
    });

    console.log(`[Batch Extraction] First batch result:`, processResult);

    const remaining = linkIds.length - firstBatch.length;
    const message = remaining > 0 
      ? `✅ 첫 ${processResult?.processed || firstBatch.length}개 처리 시작!\n\n남은 ${remaining}개는 5분마다 자동으로 처리됩니다.`
      : `✅ 모든 ${linkIds.length}개 링크 처리 시작!`;

    return Response.json({
      success: true,
      message: message,
      processed: processResult?.processed || firstBatch.length,
      succeeded: processResult?.succeededCount || 0,
      failed: processResult?.failedCount || 0,
      remaining: remaining
    });

  } catch (error) {
    console.error('[Batch Extraction] Unexpected error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
});