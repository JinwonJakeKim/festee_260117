import { secrets } from 'base44:runtime';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    // 로그인한 앱 사용자에게만 키를 제공한다.
    // (키는 Google Cloud Console의 도메인 제한으로 추가 보호되어야 한다.)
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = secrets.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'Maps API key not configured' });
    }

    return Response.json({ success: true, apiKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}