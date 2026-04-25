import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { action, email_confirm } = await req.json();

    // 이메일 인증 확인
    if (!email_confirm || email_confirm.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json({ error: '이메일이 일치하지 않습니다. 다시 확인해주세요.' }, { status: 400 });
    }

    if (!['deactivate', 'delete'].includes(action)) {
      return Response.json({ error: '올바르지 않은 요청입니다.' }, { status: 400 });
    }

    const newStatus = action === 'delete' ? 'deleted' : 'deactivated';

    await base44.auth.updateMe({
      account_status: newStatus,
      account_status_updated_at: new Date().toISOString(),
    });

    return Response.json({ success: true, status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});