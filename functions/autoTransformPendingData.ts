import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[AutoTransform] ========== AUTO TRANSFORM STARTED ==========');
    
    // pending 상태의 원본 데이터 조회 (1개씩 처리 - 타임아웃 방지)
    const pendingData = await base44.asServiceRole.entities.TourApiRawData.filter(
      { processing_status: 'pending' },
      '-created_date',
      1
    );

    if (pendingData.length === 0) {
      console.log('[AutoTransform] No pending data to process');
      return Response.json({
        success: true,
        message: '처리할 대기 중인 데이터가 없습니다.',
        processed: 0
      });
    }

    console.log(`[AutoTransform] Found ${pendingData.length} pending records`);
    
    // transformTourApiData 함수 호출
    const rawDataIds = pendingData.map(r => r.id);
    
    console.log(`[AutoTransform] Calling transformTourApiData with ${rawDataIds.length} IDs...`);
    const transformResult = await base44.asServiceRole.functions.invoke('transformTourApiData', {
      rawDataIds: rawDataIds,
      retransform: false
    });

    console.log('[AutoTransform] ========== AUTO TRANSFORM COMPLETED ==========');
    console.log(`[AutoTransform] Result:`, transformResult?.data);

    // transformResult.data에서 필요한 정보만 추출
    const resultData = transformResult?.data || {};
    
    return Response.json({
      success: true,
      message: `${resultData.festivals_created || 0}개의 축제가 자동 변환되었습니다.`,
      processed: resultData.festivals_created || 0,
      festivals_count: resultData.festivals_created || 0
    });

  } catch (error) {
    console.error('[AutoTransform] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});