import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { taskId } = await req.json();
    
    if (!taskId) {
      return Response.json({ success: false, error: 'taskId is required' }, { status: 400 });
    }

    await base44.asServiceRole.scheduledTasks.delete(taskId);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting scheduled task:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});