import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const festivals = await base44.asServiceRole.entities.Festival.filter({ country: '대한민국' });
    const needsUpdate = festivals.filter(f => f.city && !f.city_ko);

    console.log(`[CopyCityKo] Total KR festivals: ${festivals.length}, needs update: ${needsUpdate.length}`);

    let updated = 0;
    for (const festival of needsUpdate) {
      await base44.asServiceRole.entities.Festival.update(festival.id, { city_ko: festival.city });
      updated++;
    }

    return Response.json({ success: true, updated, total: festivals.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});