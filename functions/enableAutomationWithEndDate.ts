import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
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

    // toggleScheduledTask 함수를 이용해 활성화
    // (이미 활성화되어 있으면 비활성화되므로 현재 상태 먼저 확인)
    const listResult = await base44.functions.invoke('listScheduledTasks', {});
    const tasks = listResult?.data?.tasks || [];
    const task = tasks.find(t => t.id === automationId);

    if (!task) {
      return Response.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    console.log(`Current is_active: ${task.is_active}`);

    // 비활성 상태이면 토글로 활성화
    if (!task.is_active) {
      await base44.functions.invoke('toggleScheduledTask', { taskId: automationId });
      console.log('Toggled to active');
    } else {
      console.log('Already active, skipping toggle');
    }

    return Response.json({
      success: true,
      message: '자동화 활성화 완료'
    });

  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});