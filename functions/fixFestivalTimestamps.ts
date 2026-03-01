import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[FixTimestamps] Fetching all festivals...');
    const festivals = await base44.asServiceRole.entities.Festival.list('-created_date', 500);

    const toFix = festivals.filter(f => !f.create_time || !f.update_time);
    console.log(`[FixTimestamps] Found ${toFix.length} festivals missing create_time/update_time`);

    let fixed = 0;
    for (const festival of toFix) {
      const createTime = festival.created_date
        ? new Date(festival.created_date).toISOString().replace('T', ' ').substring(0, 19)
        : null;
      const updateTime = festival.updated_date
        ? new Date(festival.updated_date).toISOString().replace('T', ' ').substring(0, 19)
        : createTime;

      if (!createTime) continue;

      await base44.asServiceRole.entities.Festival.update(festival.id, {
        create_time: createTime,
        update_time: updateTime
      });
      fixed++;
    }

    console.log(`[FixTimestamps] Fixed ${fixed} festivals`);
    return Response.json({ success: true, fixed, total: toFix.length });

  } catch (error) {
    console.error('[FixTimestamps] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});