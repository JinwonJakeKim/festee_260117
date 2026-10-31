import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULT_EMAIL = 'kjwcap59@gmail.com';

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, content } = await req.json();
    const t = String(title || '').trim().slice(0, 100);
    const c = String(content || '').trim().slice(0, 2000);
    if (!t || !c) return Response.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });

    const settings = await base44.asServiceRole.entities.SiteSetting.filter({ key: 'inquiry_email' });
    const to = (settings[0]?.value || '').trim() || DEFAULT_EMAIL;

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #00a8cc;">새로운 Festee 문의가 도착했습니다</h2>
  <p><b>보낸 사람:</b> ${esc(user.full_name)} (${esc(user.email)})</p>
  <p><b>제목:</b> ${esc(t)}</p>
  <div style="white-space: pre-wrap; background: #f5f5f5; padding: 15px; border-radius: 6px;">${esc(c)}</div>
</div>`;

    const result = await base44.asServiceRole.integrations.Core.SendEmail({
      from_name: 'Festee 문의',
      to,
      subject: `[Festee 문의] ${t}`,
      body: html,
      category: 'transactional',
    });
    console.log('SendEmail result', JSON.stringify(result));
    if (result && result.success === false) {
      return Response.json({ error: `메일 발송 실패: ${result.reason || ''} ${result.message || ''}` }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}