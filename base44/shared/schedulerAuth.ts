// 스케줄러(워크플로우)가 Authorization 헤더 없이 호출하는 함수용 검증.
// 요청 본문의 scheduler_token이 AutomationSetting(scheduler_auth) 레코드의 토큰과 일치해야 한다.
export async function denyUnlessScheduler(req: Request, base44: any): Promise<Response | null> {
  let token: unknown = null;
  try {
    const body = await req.clone().json();
    token = body?.scheduler_token;
  } catch (_e) {
    token = null;
  }
  if (typeof token !== 'string' || token.length < 20) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const recs = await base44.asServiceRole.entities.AutomationSetting.filter(
    { automation_name: 'scheduler_auth' },
    '-updated_date',
    1
  );
  if (!recs[0] || recs[0].scheduler_token !== token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}