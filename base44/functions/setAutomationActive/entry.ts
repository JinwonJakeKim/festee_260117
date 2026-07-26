import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { automation_name, active_until } = await req.json();

    if (!automation_name || typeof automation_name !== 'string') {
      return Response.json({ error: 'automation_name is required' }, { status: 400 });
    }

    // 동일 이름의 설정 레코드 조회 (없으면 생성, 있으면 업데이트)
    const existing = await base44.asServiceRole.entities.AutomationSetting.filter({
      automation_name
    }, '-updated_date', 5);

    const isActive = !!active_until; // active_until이 제공되면 활성화, 없으면 비활성화
    const payloadUpdate = {
      is_active: isActive,
      active_until: isActive ? (typeof active_until === 'string' ? active_until : new Date(active_until).toISOString()) : null,
      last_started_by: isActive ? user.email : (existing[0]?.last_started_by || null)
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
      is_active: record?.is_active ?? isActive,
      active_until: record?.active_until ?? payloadUpdate.active_until,
      record_id: record?.id
    });
  } catch (error) {
    console.error('SetAutomationActive error:', error);
    return Response.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
});