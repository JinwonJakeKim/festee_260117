import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[AutoTransform] ========== AUTO TRANSFORM STARTED ==========');

    // YouTube API 일일 한도 사전 체크
    const today = new Date().toISOString().split('T')[0];
    const ytLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({
      api_name: 'youtube_data_api',
      date: today
    }).catch(() => []);
    const ytCount = ytLogs[0]?.count || 0;
    if (ytCount >= 95) {
      console.warn(`[AutoTransform] ⛔ YouTube API 일일 한도 초과 (${ytCount}/95) - 자동 변환 중단`);
      return Response.json({
        success: false,
        error: 'YOUTUBE_API_LIMIT_REACHED',
        message: `YouTube API 일일 한도 초과 (${ytCount}/95). 날짜가 바뀌면 자동으로 재개됩니다.`
      }, { status: 429 });
    }
    
    // pending 상태의 원본 데이터 조회 (1개씩 처리 - 타임아웃 방지)
    const pendingData = await base44.asServiceRole.entities.TourApiRawData.filter(
      { processing_status: 'pending' },
      'created_date',
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

    const rawDataIds = pendingData.map(r => r.id);
    console.log(`[AutoTransform] Found ${pendingData.length} pending records: ${rawDataIds}`);

    // 즉시 processing 상태로 변경하여 중복 처리 방지
    for (const id of rawDataIds) {
      await base44.asServiceRole.entities.TourApiRawData.update(id, {
        processing_status: 'processing'
      });
    }

    // transformTourApiData를 fire-and-forget으로 백그라운드 실행
    // (await 없이 호출 - 응답을 기다리지 않음)
    console.log(`[AutoTransform] Firing transformTourApiData in background (no await)...`);
    base44.asServiceRole.functions.invoke('transformTourApiData', {
      rawDataIds: rawDataIds,
      retransform: false
    }).catch(err => {
      console.error('[AutoTransform] Background transform error:', err.message);
    });

    console.log('[AutoTransform] ========== DISPATCHED - returning immediately ==========');

    return Response.json({
      success: true,
      message: `${rawDataIds.length}개의 축제 변환을 백그라운드에서 시작했습니다.`,
      dispatched: rawDataIds.length,
      ids: rawDataIds
    });

  } catch (error) {
    console.error('[AutoTransform] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});