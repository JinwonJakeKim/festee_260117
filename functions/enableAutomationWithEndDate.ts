import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V4";
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

    // 다음 날 23:59 계산
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    const endsOnDate = tomorrow.toISOString();

    console.log(`[${VERSION}] Target: ${automationId}, ends_on: ${endsOnDate}`);

    // 1) 현재 자동화 상태 조회
    const appId = Deno.env.get('BASE44_APP_ID');
    const authHeader = req.headers.get('Authorization');

    const getRes = await fetch(`https://api.base44.com/api/scheduled-tasks/${automationId}`, {
      headers: { 'x-app-id': appId, 'Authorization': authHeader }
    });

    let currentIsActive = false;
    if (getRes.ok) {
      const currentData = await getRes.json();
      currentIsActive = currentData.is_active || false;
      console.log(`[${VERSION}] Current is_active: ${currentIsActive}`);
    }

    // 2) 비활성 상태이면 SDK로 토글하여 활성화
    if (!currentIsActive) {
      await base44.asServiceRole.scheduledTasks.toggle(automationId);
      console.log(`[${VERSION}] Toggled via SDK.`);
    } else {
      console.log(`[${VERSION}] Already active.`);
    }

    // 3) ends_type, ends_on_date 업데이트 (updateScheduledTask 함수 호출)
    const updateRes = await fetch(`https://api.base44.com/api/scheduled-tasks/${automationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'Authorization': authHeader
      },
      body: JSON.stringify({
        ends_type: 'on',
        ends_on_date: endsOnDate,
        ends_after_count: null
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error(`[${VERSION}] Update failed: ${updateRes.status} - ${errText}`);
      throw new Error(`Update ends_on_date failed: ${updateRes.status}`);
    }

    console.log(`[${VERSION}] ✅ Done. Active, ends on ${endsOnDate}`);

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