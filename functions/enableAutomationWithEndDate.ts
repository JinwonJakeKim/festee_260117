import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V2";
  console.log(`[${VERSION}] Enabling automation with end date...`);

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

    // 다음 날 23:59 계산 (KST 기준)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    const endsOnDate = tomorrow.toISOString();

    console.log(`[${VERSION}] Setting automation ${automationId} to active=true, ends_on=${endsOnDate}`);

    // toggleScheduledTask (activate) → 현재 비활성이면 활성화
    // updateScheduledTask 로 ends_type, ends_on_date 설정
    const appId = Deno.env.get('BASE44_APP_ID');

    // 1) 자동화 토글 (비활성 → 활성)
    const toggleUrl = `https://api.base44.com/api/scheduled-tasks/${automationId}/toggle`;
    const toggleRes = await fetch(toggleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'Authorization': req.headers.get('Authorization')
      }
    });

    let toggleData = null;
    if (toggleRes.ok) {
      toggleData = await toggleRes.json();
      // 만약 toggle 결과 비활성화됐으면 다시 토글
      if (toggleData && toggleData.is_active === false) {
        await fetch(toggleUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': appId,
            'Authorization': req.headers.get('Authorization')
          }
        });
      }
      console.log(`[${VERSION}] Toggle result: is_active=${toggleData?.is_active}`);
    } else {
      console.warn(`[${VERSION}] Toggle failed: ${toggleRes.status}`);
    }

    // 2) ends_type, ends_on_date 업데이트
    const updateUrl = `https://api.base44.com/api/scheduled-tasks/${automationId}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'Authorization': req.headers.get('Authorization')
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
      throw new Error(`Failed to update automation ends_on_date: ${updateRes.status}`);
    }

    console.log(`[${VERSION}] ✅ Automation enabled, ends on ${endsOnDate}`);

    return Response.json({
      success: true,
      message: `자동화가 활성화되었습니다. 종료 예정: ${tomorrow.toLocaleDateString('ko-KR')} 23:59`,
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