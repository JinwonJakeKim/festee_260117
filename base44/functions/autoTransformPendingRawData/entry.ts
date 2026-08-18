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

    const AUTOMATION_NAME = 'japantravel_transform';

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

      // 1. 활성 상태 확인
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

      // 2. YouTube API 제한으로 인한 일시정지 확인
      if (setting?.resume_at && new Date(setting.resume_at).getTime() > Date.now()) {
        console.log(`[AUTO-TRANSFORM-V1] Paused until ${setting.resume_at} - skipped`);
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
      // 다음 날 한국시간 19시 (KST = UTC+9) ISO 계산
      const kstMs = Date.now() + 9 * 60 * 60 * 1000;
      const kstDate = new Date(kstMs);
      const tomorrowKst19 = new Date(Date.UTC(
        kstDate.getUTCFullYear(),
        kstDate.getUTCMonth(),
        kstDate.getUTCDate() + 1,
        19, 0, 0, 0
      ));
      const nextRunIso = new Date(tomorrowKst19.getTime() - 9 * 60 * 60 * 1000).toISOString();

      // AutomationSetting에 resume_at 설정 (스케줄러 호출 시에만)
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

    // pending 상태의 RawData 1개만 조회 (CPU 시간 제한 초과 방지)
    const pendingRawData = await base44.asServiceRole.entities.JapantravelRawData.filter({
      processing_status: 'pending',
      name_original: { $exists: true, $ne: "" }
    }, '-created_date', 1);

    console.log(`[${VERSION}] Found ${pendingRawData.length} pending items to transform`);

    if (pendingRawData.length === 0) {
      console.log(`[${VERSION}] No pending data - deactivating automation`);
      // pending이 0이면 자동화 비활성화 (스케줄러 호출 시에만)
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

    // 처리 성공 시 resume_at 초기화 (이전에 YouTube 제한으로 설정된 값清除)
    if (settingId) {
      await base44.asServiceRole.entities.AutomationSetting.update(settingId, {
        resume_at: null
      });
    }

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