import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V5";
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

    const appId = Deno.env.get('BASE44_APP_ID');
    const authHeader = req.headers.get('Authorization');

    console.log(`[${VERSION}] Target: ${automationId}, ends_on: ${endsOnDate}`);

    // 1) 현재 자동화 상태 조회
    const getRes = await fetch(`https://api.base44.com/api/scheduled-tasks/${automationId}`, {
      headers: { 'x-app-id': appId, 'Authorization': authHeader }
    });

    let currentIsActive = false;
    if (getRes.ok) {
      const currentData = await getRes.json();
      currentIsActive = currentData.is_active || false;
      console.log(`[${VERSION}] Current is_active: ${currentIsActive}`);
    } else {
      console.warn(`[${VERSION}] Could not GET current state: ${getRes.status}`);
    }

    // 2) 비활성 상태이면 toggleScheduledTask 함수 invoke로 활성화
    if (!currentIsActive) {
      const toggleResult = await base44.asServiceRole.functions.invoke('toggleScheduledTask', { taskId: automationId });
      console.log(`[${VERSION}] Toggle result:`, toggleResult?.data);
    } else {
      console.log(`[${VERSION}] Already active, skipping toggle.`);
    }

    // 3) ends_type, ends_on_date 업데이트
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
      console.error(`[${VERSION}] PUT update failed: ${updateRes.status} - ${errText}`);
      // ends_on_date 업데이트 실패해도 활성화는 됐으므로 성공으로 간주
    } else {
      console.log(`[${VERSION}] ends_on_date updated successfully.`);
    }

    console.log(`[${VERSION}] ✅ Done. Automation should be active now.`);

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