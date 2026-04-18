import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}${mm}${dd}`; // YYYYMMDD 형식

    console.log(`[RevertToPending] Today: ${todayStr}`);

    // 모든 processed 상태 레코드를 페이징으로 가져오기
    let allRecords = [];
    let skip = 0;
    const batchSize = 100;

    while (true) {
      const batch = await base44.asServiceRole.entities.TourApiRawData.list('-created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;
      allRecords = allRecords.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    console.log(`[RevertToPending] Total records fetched: ${allRecords.length}`);

    // 조건: processing_status === 'processed' AND eventenddate >= todayStr
    const targetRecords = allRecords.filter(r => 
      r.processing_status === 'processed' &&
      r.eventenddate &&
      r.eventenddate >= todayStr
    );

    console.log(`[RevertToPending] Target records (processed + end >= today): ${targetRecords.length}`);

    const updatedIds = [];
    const errors = [];

    for (const record of targetRecords) {
      try {
        await base44.asServiceRole.entities.TourApiRawData.update(record.id, {
          processing_status: 'pending',
          error_message: ''
        });
        updatedIds.push({ id: record.id, title: record.title, eventenddate: record.eventenddate });
        console.log(`[RevertToPending] ✓ ${record.title} (${record.eventenddate}) → pending`);
      } catch (e) {
        console.error(`[RevertToPending] ✗ Failed: ${record.title}`, e.message);
        errors.push({ id: record.id, title: record.title, error: e.message });
      }
    }

    return Response.json({
      success: true,
      today: todayStr,
      total_checked: allRecords.length,
      total_updated: updatedIds.length,
      updated: updatedIds,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[RevertToPending] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});