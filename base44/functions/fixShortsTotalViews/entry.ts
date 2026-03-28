import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.YoutubeRawdata.list('-created_date', 1000);
    console.log(`[fixShortsTotalViews] Total records: ${all.length}`);

    let updated = 0;
    let skipped = 0;

    for (const stat of all) {
      const correct = (stat.shorts1_views || 0) + (stat.shorts2_views || 0) +
                      (stat.shorts3_views || 0) + (stat.shorts4_views || 0) +
                      (stat.shorts5_views || 0);

      if (stat.total_views !== correct) {
        await base44.asServiceRole.entities.YoutubeRawdata.update(stat.id, { total_views: correct });
        console.log(`Updated ${stat.id}: ${stat.total_views} → ${correct}`);
        updated++;
      } else {
        skipped++;
      }
    }

    return Response.json({ success: true, total: all.length, updated, skipped });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});