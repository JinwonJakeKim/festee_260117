import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
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

    const { automation_name, ttl_days = 7 } = await req.json();

    if (!automation_name || typeof automation_name !== 'string') {
      return Response.json({ error: 'automation_name is required' }, { status: 400 });
    }

    // active_until = now + ttl_days
    const activeUntil = new Date(Date.now() + ttl_days * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[ActivateAutomation] Activating ${automation_name} until ${activeUntil} (TTL: ${ttl_days} days)`);

    // 기존 설정 조회
    const existing = await base44.asServiceRole.entities.AutomationSetting.filter({
      automation_name
    }, '-updated_date', 5);

    const payloadUpdate = {
      is_active: true,
      active_until: activeUntil,
      resume_at: null, // 이전 YouTube API 제한으로 인한 일시정지 초기화
      last_started_by: user?.email || 'system'
    };

    let record;
    if (existing.length > 0 && existing[0].id) {
      record = await base44.asServiceRole.entities.AutomationSetting.update(
        existing[0].id,
        payloadUpdate
      );
    } else {
      record = await base44.asServiceRole.entities.AutomationSetting.create({
        automation_name,
        ...payloadUpdate
      });
    }

    return Response.json({
      success: true,
      automation_name,
      is_active: true,
      active_until: activeUntil,
      record_id: record?.id
    });
  } catch (error) {
    console.error('ActivateAutomation error:', error);
    return Response.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
});