import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    // Google Maps JavaScript API 키는 브라우저에 노출되도록 설계된 공개 키이며
    // Google Cloud Console의 도메인 제한(Website restrictions)으로 보호한다.
    // 로그인 여부와 관계없이 지도가 표시되어야 하므로 인증 체크를 하지 않는다.
    const apiKey = secrets.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'Maps API key not configured' });
    }

    return Response.json({ success: true, apiKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}