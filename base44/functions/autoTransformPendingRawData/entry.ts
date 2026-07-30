import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "AUTO-TRANSFORM-V1";
  console.log(`[${VERSION}] Starting auto transform for pending RawData...`);

  try {
    const base44 = createClientFromRequest(req);

    // 워크플로우(스케줄러) 호출은 Authorization 헤더가 없고 base44.auth.me()가 null을 반환합니다.
    // 앱 사용자가 직접 호출한 경우에만 관리자 권한을 검사합니다.
    const authHeader = req.headers.get('Authorization');
    let user = null;
    if (authHeader) {
      try { user = await base44.auth.me(); } catch (e) { user = null; }
    }
    if (authHeader && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    // 자동화(스케줄러) 호출 시 AutomationSetting(japantravel_transform) 활성 상태 확인
    // — 버튼 클릭(admin) 호출은 항상 즉시 처리, 워크플로우 호출은 활성화된 기간에만 처리
    const AUTOMATION_NAME = 'japantravel_transform';
    if (!authHeader) {
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
        console.log(`[AUTO-TRANSFORM-V1] Automation inactive - skipped`);
        return Response.json({
          success: true,
          skipped: true,
          message: 'Automation inactive - skipped',
          processed: 0,
          remaining: 0
        });
      }
    }

    // YouTube API 일일 한도 사전 체크
    const today = new Date().toISOString().split('T')[0];
    const ytLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({
      api_name: 'youtube_data_api',
      date: today
    }).catch(() => []);
    const ytCount = ytLogs[0]?.count || 0;
    if (ytCount >= 95) {
      console.warn(`[${VERSION}] ⛔ YouTube API 일일 한도 초과 (${ytCount}/95) - 자동 변환 중단`);
      return Response.json({
        success: false,
        error: 'YOUTUBE_API_LIMIT_REACHED',
        message: `YouTube API 일일 한도 초과 (${ytCount}/95). 날짜가 바뀌면 자동으로 재개됩니다.`
      }, { status: 429 });
    }

    // pending 상태의 RawData 1개만 조회 (CPU 시간 제한 초과 방지)
    const pendingRawData = await base44.asServiceRole.entities.JapantravelRawData.filter({
      processing_status: 'pending',
      name_original: { $exists: true, $ne: "" }
    }, '-created_date', 1);

    console.log(`[${VERSION}] Found ${pendingRawData.length} pending items to transform`);

    if (pendingRawData.length === 0) {
      return Response.json({
        success: true,
        message: '변환할 대기중인 RawData가 없습니다',
        processed: 0,
        remaining: 0
      });
    }

    const rawDataIds = [pendingRawData[0].id];

    // transformJapantravelRawData 함수 호출
    console.log(`[${VERSION}] Calling transformJapantravelRawData for 1 item (batch size fixed to 1)`);
    
    const { data: transformResult } = await base44.asServiceRole.functions.invoke(
      'transformJapantravelRawData',
      { 
        rawDataIds,
        retransform: false 
      }
    );

    console.log(`[${VERSION}] Transform result:`, transformResult);

    // 남은 pending 개수 확인
    const allRemaining = await base44.asServiceRole.entities.JapantravelRawData.filter({
      processing_status: 'pending',
      name_original: { $exists: true, $ne: "" }
    });

    return Response.json({
      success: true,
      message: transformResult.success ? transformResult.message : `일부 변환 실패: ${transformResult.error || 'Unknown error'}`,
      processed: rawDataIds.length,
      remaining: allRemaining.length,
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