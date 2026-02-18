import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const VERSION = "ENABLE-AUTOMATION-V1";
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

    // 다음 날 자정 계산 (사용자 타임존: Asia/Seoul)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    
    const endsOnDate = tomorrow.toISOString();
    
    console.log(`[${VERSION}] Setting automation ${automationId} to end on ${endsOnDate}`);

    // 자동화 활성화 및 종료 날짜 설정 - API 직접 호출
    const appId = Deno.env.get('BASE44_APP_ID');
    const apiUrl = `https://api.base44.com/api/scheduled-tasks/${automationId}`;

    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'Authorization': req.headers.get('Authorization')
      },
      body: JSON.stringify({
        is_active: true,
        ends_type: 'on',
        ends_on_date: endsOnDate,
        ends_after_count: null
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to update automation: ${response.status}`);
    }

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