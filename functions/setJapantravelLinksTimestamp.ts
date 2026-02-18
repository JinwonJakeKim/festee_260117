import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data } = payload;
    const entityId = event?.entity_id;

    if (!entityId) {
      return Response.json({ success: false, error: 'No entity_id' }, { status: 400 });
    }

    const now = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ

    if (event.type === 'create') {
      await base44.asServiceRole.entities.JapantravelLinks.update(entityId, {
        create_time: now,
        update_time: now
      });
    } else if (event.type === 'update') {
      // create_time이 이미 있으면 건드리지 않음
      const updates = { update_time: now };
      if (!data?.create_time) {
        updates.create_time = now;
      }
      await base44.asServiceRole.entities.JapantravelLinks.update(entityId, updates);
    }

    return Response.json({ success: true, timestamp: now });

  } catch (error) {
    console.error('Error setting timestamp:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});