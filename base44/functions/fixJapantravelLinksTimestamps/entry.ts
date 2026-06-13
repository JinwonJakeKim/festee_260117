import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const startPage = body.page || 0;
    const pageSize = 50;

    const toKoreaTime = (timeStr) => {
      if (!timeStr) return null;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;
      return new Date(date.getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);
    };

    const isUTCFormat = (timeStr) => {
      if (!timeStr) return false;
      return timeStr.includes('T') || timeStr.includes('Z');
    };

    const records = await base44.asServiceRole.entities.JapantravelLinks.list(
      'created_date', pageSize, startPage * pageSize
    );

    let totalUpdated = 0;
    let totalSkipped = 0;

    if (records && records.length > 0) {
      for (const record of records) {
        const needsUpdate = isUTCFormat(record.create_time) || isUTCFormat(record.update_time);

        if (!needsUpdate) {
          totalSkipped++;
          continue;
        }

        const updatePayload = {};
        if (isUTCFormat(record.create_time)) {
          updatePayload.create_time = toKoreaTime(record.create_time);
        }
        if (isUTCFormat(record.update_time)) {
          updatePayload.update_time = toKoreaTime(record.update_time);
        }

        await base44.asServiceRole.entities.JapantravelLinks.update(record.id, updatePayload);
        totalUpdated++;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const hasMore = records && records.length === pageSize;

    return Response.json({
      success: true,
      page: startPage,
      processed: records ? records.length : 0,
      updated: totalUpdated,
      skipped: totalSkipped,
      has_more: hasMore,
      next_page: hasMore ? startPage + 1 : null,
      message: hasMore
        ? `페이지 ${startPage} 완료 (updated: ${totalUpdated}, skipped: ${totalSkipped}). 다음: page: ${startPage + 1}`
        : `모든 데이터 처리 완료 (updated: ${totalUpdated}, skipped: ${totalSkipped})`
    });

  } catch (error) {
    console.error('[FixLinksTimestamps] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});