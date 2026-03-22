import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const task = await base44.asServiceRole.scheduledTasks.create({
      name: 'TourAPI 월간 자동 동기화',
      function_name: 'syncTourApiData',
      description: '매월 1일 00:00에 모든 지역의 TourAPI 데이터를 자동으로 수집하고 Festival로 변환합니다.',
      schedule_type: 'simple',
      repeat_unit: 'months',
      repeat_on_day_of_month: 1,
      start_time: '00:00',
      is_active: true,
    });

    return Response.json({ success: true, task });
  } catch (error) {
    console.error('Create scheduled task error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});