import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tasks = await base44.asServiceRole.scheduledTasks.list();
    const syncTasks = tasks.filter(t => t.function_name === 'syncTourApiData');

    return Response.json({ success: true, tasks: syncTasks });
  } catch (error) {
    console.error('List scheduled tasks error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});