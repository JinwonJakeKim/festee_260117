import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');

    const listResp = await fetch(`https://api.base44.com/api/apps/${appId}/scheduled-tasks`, {
      headers: {
        'Authorization': req.headers.get('Authorization'),
        'x-app-id': appId
      }
    });

    if (!listResp.ok) {
      const errText = await listResp.text();
      throw new Error(`GET scheduled-tasks failed (${listResp.status}): ${errText}`);
    }

    const tasks = await listResp.json();

    return Response.json({ success: true, tasks: Array.isArray(tasks) ? tasks : [] });
  } catch (error) {
    console.error('List scheduled tasks error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});