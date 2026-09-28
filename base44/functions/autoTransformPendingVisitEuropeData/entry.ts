import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// JapanTravel의 autoTransformPendingRawData와 동일한 운영 패턴을 VisitEuropeRawData에 적용.
// - 5분 간격 워크플로우(VisitEurope_RawData_Transform_Auto)에서 호출됨
// - 배치 크기 1건 고정 (CPU 시간 제한 회피, JapanTravel과 동일)
// - AutomationSetting(automation_name='visiteurope_transform')의 is_active/active_until로 활성 여부 제어
// - YouTube API 일일 한도(95) 초과 시 다음 날 19:00 KST까지 일시정지 (resume_at)
// - 대상: extract_status='processed' AND processing_status='pending' (상세추출 완료 + 변환 미완료)
Deno.serve(async (req) => {
  const VERSION = "AUTO-TRANSFORM-VISITEUROPE-V1";
  console.log(`[${VERSION}] Starting auto transform for pending VisitEuropeRawData...`);

  try {
    const base44 = createClientFromRequest(req);

    // 워크플로우(스케줄러) 호출은 Authorization 헤더가 없습니다. 앱 사용자가 직접 호출한 경우에만 관리자 권한을 검사합니다.
    const authHeader = req.headers.get('Authorization');
    let user = null;
    if (authHeader) {
      try { user = await base44.auth.me(); } catch (e) { user = null; }
    }
    if (authHeader && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const AUTOMATION_NAME = 'visiteurope_transform';

    // 스케줄러 호출 시 AutomationSetting 확인
    let settingId: string | null = null;
    if (!authHeader) {
      const settings = await base44.asServiceRole.entities.AutomationSetting.filter(
        { automation_name: AUTOMATION_NAME },
        '-updated_date',
        5
      );
      const setting = settings[0];
      settingId = setting?.id || null;

      const isActive = setting?.is_active === true &&
        !!setting.active_until &&
        new Date(setting.active_until).getTime() > Date.now();
      if (!isActive) {
        console.log(`[${VERSION}] Automation inactive - skipped`);
        return Response.json({
          success: true,
          skipped: true,
          message: 'Automation inactive - skipped',
          processed: 0,
          remaining: 0
        });
      }

      if (setting?.resume_at && new Date(setting.resume_at).getTime() > Date.now()) {
        console.log(`[${VERSION}] Paused until ${setting.resume_at} - skipped`);
        return Response.json({
          success: true,
          skipped: true,
          message: `YouTube API 제한으로 일시정지 중. ${setting.resume_at}에 재개됩니다.`,
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
      const kstMs = Date.now() + 9 * 60 * 60 * 1000;
      const kstDate = new Date(kstMs);
      const tomorrowKst19 = new Date(Date.UTC(
        kstDate.getUTCFullYear(),
        kstDate.getUTCMonth(),
        kstDate.getUTCDate() + 1,
        19, 0, 0, 0
      ));
      const nextRunIso = new Date(tomorrowKst19.getTime() - 9 * 60 * 60 * 1000).toISOString();

      if (settingId) {
        await base44.asServiceRole.entities.AutomationSetting.update(settingId, {
          resume_at: nextRunIso
        });
      }

      return Response.json({
        success: false,
        error: 'YOUTUBE_API_LIMIT_REACHED',
        message: `YouTube API 일일 한도 초과 (${ytCount}/95). 다음 날 한국시간 19시에 자동으로 재개됩니다.`,
        next_run_iso: nextRunIso
      }, { status: 200 });
    }

    // 변환 대상: 상세추출 완료(extract_status=processed) AND 변환 미완료(processing_status=pending)
    const pendingRawData = await base44.asServiceRole.entities.VisitEuropeRawData.filter({
      extract_status: 'processed',
      processing_status: 'pending'
    }, '-created_date', 1);

    console.log(`[${VERSION}] Found ${pendingRawData.length} pending items to transform`);

    if (pendingRawData.length === 0) {
      console.log(`[${VERSION}] No pending data - deactivating automation`);
      if (settingId) {
        await base44.asServiceRole.entities.AutomationSetting.update(settingId, {
          is_active: false
        });
      }
      return Response.json({
        success: true,
        message: '변환할 대기중인 RawData가 없습니다. 자동화를 비활성화합니다.',
        processed: 0,
        remaining: 0
      });
    }

    const rawDataIds = [pendingRawData[0].id];

    console.log(`[${VERSION}] Calling transformVisitEuropeRawData for 1 item (batch size fixed to 1)`);

    const { data: transformResult } = await base44.asServiceRole.functions.invoke(
      'transformVisitEuropeRawData',
      { rawDataIds }
    );

    console.log(`[${VERSION}] Transform result:`, transformResult);

    if (settingId) {
      await base44.asServiceRole.entities.AutomationSetting.update(settingId, {
        resume_at: null
      });
    }

    const allRemaining = await base44.asServiceRole.entities.VisitEuropeRawData.filter({
      extract_status: 'processed',
      processing_status: 'pending'
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