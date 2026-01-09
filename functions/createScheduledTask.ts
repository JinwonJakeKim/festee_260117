import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const {
      name,
      function_name,
      description,
      schedule_type,
      repeat_unit,
      repeat_on_day_of_month,
      start_time,
      function_args
    } = payload;

    const task = await base44.asServiceRole.scheduledTasks.create({
      name,
      function_name,
      description,
      schedule_mode: 'recurring',
      schedule_type: schedule_type || 'simple',
      repeat_unit,
      repeat_on_day_of_month,
      start_time,
      function_args: function_args || {},
      is_active: true
    });

    return Response.json({
      success: true,
      task
    });

  } catch (error) {
    console.error('[createScheduledTask] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});