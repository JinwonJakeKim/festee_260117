import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[SyncPopularity] ========== START ==========');

    // 1. popularity가 0인 Festival 전체 조회 (페이지네이션)
    let allZeroFestivals = [];
    let skip = 0;
    const pageSize = 100;
    while (true) {
      const page = await base44.asServiceRole.entities.Festival.filter(
        { popularity: 0 },
        'created_date',
        pageSize,
        skip
      );
      allZeroFestivals = allZeroFestivals.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    console.log(`[SyncPopularity] Found ${allZeroFestivals.length} festivals with popularity=0`);

    if (allZeroFestivals.length === 0) {
      return Response.json({
        success: true,
        message: 'popularity가 0인 축제가 없습니다.',
        updated: 0,
        still_zero: []
      });
    }

    // 2. YoutubeRawdata에서 각 festival_id에 해당하는 최신 레코드 조회 및 업데이트
    const updated = [];
    const stillZero = [];

    for (const festival of allZeroFestivals) {
      try {
        const youtubeRecords = await base44.asServiceRole.entities.YoutubeRawdata.filter(
          { festival_id: festival.id },
          '-update_time',
          1
        );

        if (youtubeRecords.length === 0) {
          console.log(`[SyncPopularity] No YoutubeRawdata for festival: ${festival.name_ko || festival.name_en || festival.id}`);
          stillZero.push({
            id: festival.id,
            name: festival.name_ko || festival.name_en || festival.id,
            reason: 'YoutubeRawdata 없음'
          });
          continue;
        }

        const ytRecord = youtubeRecords[0];
        const ytPopularity = ytRecord.popularity || 0;

        if (ytPopularity > 0) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            popularity: ytPopularity,
            shorts_views_5_total: ytRecord.raw_shorts_views_5_total || 0
          });
          console.log(`[SyncPopularity] ✓ Updated: ${festival.name_ko || festival.id} → popularity=${ytPopularity}`);
          updated.push({
            id: festival.id,
            name: festival.name_ko || festival.name_en || festival.id,
            new_popularity: ytPopularity
          });
        } else {
          console.log(`[SyncPopularity] Still 0: ${festival.name_ko || festival.id} (YoutubeRawdata.popularity=0)`);
          stillZero.push({
            id: festival.id,
            name: festival.name_ko || festival.name_en || festival.id,
            reason: 'YoutubeRawdata.popularity도 0'
          });
        }
      } catch (err) {
        console.error(`[SyncPopularity] Error for festival ${festival.id}:`, err.message);
        stillZero.push({
          id: festival.id,
          name: festival.name_ko || festival.name_en || festival.id,
          reason: `오류: ${err.message}`
        });
      }
    }

    console.log(`[SyncPopularity] ========== DONE ==========`);
    console.log(`[SyncPopularity] Updated: ${updated.length}, Still zero: ${stillZero.length}`);

    return Response.json({
      success: true,
      message: `${updated.length}개 축제의 popularity가 업데이트되었습니다.`,
      updated_count: updated.length,
      still_zero_count: stillZero.length,
      updated,
      still_zero: stillZero
    });

  } catch (error) {
    console.error('[SyncPopularity] Error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});