import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "AUTO-TRANSFORM-V1";
  console.log(`[${VERSION}] Starting auto transform for pending RawData...`);

  try {
    const base44 = createClientFromRequest(req);
    
    // Admin 권한 확인
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    // pending 상태의 RawData 3개 조회 (name_original이 있는 것만)
    const pendingRawData = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      processing_status: 'pending',
      name_original: { $exists: true, $ne: "" }
    }, '-created_date', 3);

    console.log(`[${VERSION}] Found ${pendingRawData.length} pending items to transform`);

    if (pendingRawData.length === 0) {
      return Response.json({
        success: true,
        message: '변환할 대기중인 RawData가 없습니다',
        processed: 0,
        remaining: 0
      });
    }

    const rawDataIds = pendingRawData.map(r => r.id);

    // transformJapantravelUrlExtractionData 함수 호출
    console.log(`[${VERSION}] Calling transformJapantravelUrlExtractionData for ${rawDataIds.length} items`);
    
    const { data: transformResult } = await base44.asServiceRole.functions.invoke(
      'transformJapantravelUrlExtractionData',
      { 
        rawDataIds,
        retransform: false 
      }
    );

    console.log(`[${VERSION}] Transform result:`, transformResult);

    // 남은 pending 개수 확인
    const remainingPending = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      processing_status: 'pending',
      name_original: { $exists: true, $ne: "" }
    }, '-created_date', 1);

    const remainingCount = remainingPending.length > 0 ? 
      (await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
        processing_status: 'pending',
        name_original: { $exists: true, $ne: "" }
      })).length : 0;

    return Response.json({
      success: true,
      message: transformResult.success ? transformResult.message : `일부 변환 실패: ${transformResult.error || 'Unknown error'}`,
      processed: rawDataIds.length,
      remaining: remainingCount,
      transform_result: transformResult
    });

  } catch (error) {
    console.error(`[${VERSION}] Error:`, error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});