import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    // 모든 YoutubeRawdata 레코드 가져오기 (페이지네이션)
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

    console.log(`[FixRawShortsViewsTotal] Total records: ${allRecords.length}`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const record of allRecords) {
      // shorts1~5 중 score >= 2인 것의 views 합산
      let newTotal = 0;
      for (let i = 1; i <= 5; i++) {
        const score = record[`shorts${i}_score`] || 0;
        const views = record[`shorts${i}_views`] || 0;
        if (score >= 2) {
          newTotal += views;
        }
      }

      if (record.raw_shorts_views_5_total !== newTotal) {
        await base44.asServiceRole.entities.YoutubeRawdata.update(record.id, {
          raw_shorts_views_5_total: newTotal
        });
        updatedCount++;
        console.log(`[FixRawShortsViewsTotal] Updated ${record.id}: ${record.raw_shorts_views_5_total} -> ${newTotal}`);
        // Rate limit 방지 딜레이
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
    console.error('[FixRawShortsViewsTotal] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});