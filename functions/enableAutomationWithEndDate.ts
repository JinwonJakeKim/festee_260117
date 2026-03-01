import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V7";
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

    // listScheduledTasks 함수로 현재 상태 확인
    const listResult = await base44.asServiceRole.functions.invoke('listScheduledTasks', {});
    const tasks = listResult?.data?.tasks || [];
    const task = tasks.find(t => t.id === automationId);

    if (!task) {
      return Response.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    console.log(`[${VERSION}] Current is_active: ${task.is_active}`);

    // 비활성 상태이면 toggleScheduledTask로 활성화
    if (!task.is_active) {
      const toggleResult = await base44.asServiceRole.functions.invoke('toggleScheduledTask', { taskId: automationId });
      console.log(`[${VERSION}] Toggle result:`, JSON.stringify(toggleResult?.data));
    } else {
      console.log(`[${VERSION}] Already active, skipping toggle.`);
    }

    // ends_on_date 업데이트 (다음 날 23:59)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    const endsOnDate = tomorrow.toISOString();

    const updateResult = await base44.asServiceRole.functions.invoke('updateScheduledTask', {
      taskId: automationId,
      ends_type: 'on',
      ends_on_date: endsOnDate,
      ends_after_count: null
    });

    console.log(`[${VERSION}] Update result:`, JSON.stringify(updateResult?.data));
    console.log(`[${VERSION}] ✅ Done. ends_on_date: ${endsOnDate}`);

    return Response.json({
      success: true,
      message: `자동화 활성화 완료. 종료 예정: ${tomorrow.toLocaleDateString('ko-KR')} 23:59`,
      ends_on_date: endsOnDate
    });

  } catch (error) {
    console.error(`[${VERSION}] Error:`, error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});