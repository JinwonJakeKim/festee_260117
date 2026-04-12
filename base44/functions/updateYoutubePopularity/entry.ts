import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    let allRecords = [];
    let skip = 0;
    const pageSize = 100;
    while (true) {
      const batch = await base44.asServiceRole.entities.YoutubeRawdata.list('-created_date', pageSize, skip);
      if (!batch || batch.length === 0) break;
      allRecords = allRecords.concat(batch);
      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    console.log(`[UpdateYoutubePopularity] Total records: ${allRecords.length}`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const record of allRecords) {
      const shortsViews = record.raw_shorts_views_5_total || 0;
      const highlightViews = record.selected_highlight_views || 0;
      const popularity = shortsViews + highlightViews;

      if (record.popularity !== popularity) {
        await base44.asServiceRole.entities.YoutubeRawdata.update(record.id, { popularity });
        updatedCount++;
        console.log(`[UpdateYoutubePopularity] Updated ${record.id}: ${record.popularity} -> ${popularity} (shorts=${shortsViews}, highlight=${highlightViews})`);
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        skippedCount++;
      }
    }

    return Response.json({
      success: true,
      total: allRecords.length,
      updated: updatedCount,
      skipped: skippedCount,
      message: `완료: 전체 ${allRecords.length}개 중 ${updatedCount}개 업데이트, ${skippedCount}개 변경없음`
    });

  } catch (error) {
    console.error('[UpdateYoutubePopularity] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});