import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    let skip = 0;
    const limit = 100;
    let totalUpdated = 0;

    while (true) {
      const festivals = await base44.asServiceRole.entities.Festival.list('-created_date', limit, skip);
      if (!festivals || festivals.length === 0) break;

      const koreanFestivals = festivals.filter(f => f.country === '대한민국');

      for (const festival of koreanFestivals) {
        if (!festival.create_time && festival.created_date) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            create_time: festival.created_date,
            update_time: festival.updated_date || festival.created_date
          });
          totalUpdated++;
        }
      }

      if (festivals.length < limit) break;
      skip += limit;
    }

    return Response.json({ success: true, updated: totalUpdated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});