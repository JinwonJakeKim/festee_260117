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

    // 자동화 활성화 + ends_on_date 업데이트 (단일 PUT)
    const updateRes = await fetch(`https://api.base44.com/api/apps/${appId}/automations/${automationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        is_active: true,
        ends_type: 'on',
        ends_on_date: endsOnDate,
        ends_after_count: null
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error(`[${VERSION}] PATCH failed: ${updateRes.status} - ${errText}`);
      return Response.json({ success: false, error: `API update failed: ${updateRes.status}` }, { status: 500 });
    }

    console.log(`[${VERSION}] ✅ 자동화 활성화 + ends_on_date 업데이트 완료`);

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