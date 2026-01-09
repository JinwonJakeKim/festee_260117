import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 스케줄 태스크 목록 조회
    const tasks = await base44.asServiceRole.scheduledTasks.list();

    return Response.json({
      success: true,
      tasks: tasks || []
    });

  } catch (error) {
    console.error('[listScheduledTasks] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});