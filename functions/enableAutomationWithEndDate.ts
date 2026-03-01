import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V8";
  console.log(`[${VERSION}] Starting...`);

  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { automationId } = await req.json();
    
    if (!automationId) {
      return Response.json({ success: false, error: 'automationId required' }, { status: 400 });
    }

    console.log(`[${VERSION}] Activating automation: ${automationId}`);

    // 현재 상태 확인
    const tasks = await base44.asServiceRole.scheduledTasks.list();
    const task = tasks.find(t => t.id === automationId);

    if (!task) {
      return Response.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    console.log(`[${VERSION}] Current is_active: ${task.is_active}`);

    // 종료 날짜 (다음 날 23:59 UTC+9 기준)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    const endsOnDate = tomorrow.toISOString();

    // 비활성 상태이면 토글로 활성화
    if (!task.is_active) {
      await base44.asServiceRole.scheduledTasks.toggle(automationId);
      console.log(`[${VERSION}] ✅ Toggled to active`);
    } else {
      console.log(`[${VERSION}] Already active`);
    }

    // ends_on_date 업데이트
    await base44.asServiceRole.scheduledTasks.update(automationId, {
      ends_type: 'on',
      ends_on_date: endsOnDate,
      ends_after_count: null
    });

    console.log(`[${VERSION}] ✅ Done. ends_on_date: ${endsOnDate}`);

    return Response.json({
      success: true,
      message: `자동화 활성화 완료. 종료 예정: ${tomorrow.toLocaleDateString('ko-KR')} 23:59`,
      ends_on_date: endsOnDate
    });

  } catch (error) {
    console.error(`[${VERSION}] Error:`, error.message);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});