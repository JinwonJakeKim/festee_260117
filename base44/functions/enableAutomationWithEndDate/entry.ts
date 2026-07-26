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

    // 오늘 23:59 (KST = UTC+9) 기준 → UTC로 변환
    const now = new Date();
    const today = new Date(now);
    today.setHours(14, 59, 0, 0); // KST 23:59 = UTC 14:59
    const endsOnDate = today.toISOString();

    console.log(`Enabling automation ${automationId}, ends_on_date: ${endsOnDate}`);

    const appId = Deno.env.get('BASE44_APP_ID');

    // 1) 현재 상태 조회
    const listResp = await fetch(`https://api.base44.com/api/apps/${appId}/scheduled-tasks`, {
      headers: {
        'Authorization': req.headers.get('Authorization'),
        'x-app-id': appId
      }
    });
    const tasks = await listResp.json();
    const task = Array.isArray(tasks) ? tasks.find(t => t.id === automationId) : null;

    if (!task) {
      return Response.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    console.log(`Current is_active: ${task.is_active}`);

    // 2) is_active + ends_type + ends_on_date를 한 번의 PUT으로 업데이트
    const updateResp = await fetch(`https://api.base44.com/api/apps/${appId}/scheduled-tasks/${automationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization'),
        'x-app-id': appId
      },
      body: JSON.stringify({
        is_active: true,
        ends_type: 'on',
        ends_on_date: endsOnDate,
        ends_after_count: null
      })
    });

    if (!updateResp.ok) {
      const errData = await updateResp.text();
      throw new Error(`PUT failed (${updateResp.status}): ${errData}`);
    }

    const updated = await updateResp.json();
    console.log(`✅ Updated: is_active=${updated.is_active}, ends_on_date=${updated.ends_on_date}`);

    return Response.json({
      success: true,
      message: `자동화 활성화 완료. 종료 예정: 오늘 23:59 (KST)`,
      is_active: updated.is_active,
      ends_on_date: updated.ends_on_date
    });

  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});