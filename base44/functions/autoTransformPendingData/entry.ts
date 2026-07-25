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
    
    // 10분 이상 processing에 머문 카드는 런타임 취소로 멈춘 것으로 간주 → pending으로 복구
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stale = await base44.asServiceRole.entities.TourApiRawData.filter(
      { processing_status: 'processing' },
      'updated_date',
      50
    ).catch(() => []);
    const staleIds = stale.filter(r => {
      const t = r.updated_date ? new Date(r.updated_date).getTime() : 0;
      return t > 0 && t < Date.parse(tenMinAgo);
    }).map(r => r.id);
    if (staleIds.length > 0) {
      console.log(`[AutoTransform] Recovering ${staleIds.length} stuck processing records -> pending`);
      for (const id of staleIds) {
        await base44.asServiceRole.entities.TourApiRawData.update(id, { processing_status: 'pending' });
      }
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

    // transformTourApiData를 await로 실행 (워크플로우 런타임은 반환 시 백그라운드 작업을 취소하므로
    // fire-and-forget 대신 반드시 완료를 기다려야 함)
    console.log(`[AutoTransform] Awaiting transformTourApiData (rawDataIds: ${rawDataIds.join(',')})...`);
    try {
      const result = await base44.asServiceRole.functions.invoke('transformTourApiData', {
        rawDataIds: rawDataIds,
        retransform: false
      });
      console.log('[AutoTransform] transformTourApiData completed:', JSON.stringify(result).slice(0, 300));
    } catch (err) {
      console.error('[AutoTransform] transformTourApiData error:', err.message);
      // 실패 시 해당 레코드를 다시 pending으로 되돌려 재시도 대상으로 유지
      for (const id of rawDataIds) {
        await base44.asServiceRole.entities.TourApiRawData.update(id, { processing_status: 'pending' });
      }
      return Response.json({
        success: false,
        error: err.message,
        ids: rawDataIds
      }, { status: 500 });
    }

    console.log('[AutoTransform] ========== COMPLETED ==========');

    return Response.json({
      success: true,
      message: `${rawDataIds.length}개의 축제 변환을 완료했습니다.`,
      processed: rawDataIds.length,
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