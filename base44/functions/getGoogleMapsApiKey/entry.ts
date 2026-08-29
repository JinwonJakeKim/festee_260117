import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = secrets.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'Maps API key not configured' });
    }

    return Response.json({ success: true, apiKey });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}