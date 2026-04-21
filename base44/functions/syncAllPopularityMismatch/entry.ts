import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Festival.popularity와 YoutubeRawdata 최신 popularity 값이 다른 축제를 찾아 동기화
// payload: { skip: 0, limit: 50 } 로 배치 처리 가능
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const skip = body.skip || 0;
    const limit = body.limit || 50;

    console.log(`[SyncMismatch] ========== START skip=${skip} limit=${limit} ==========`);

    // 1. Festival 레코드 배치 조회
    const allFestivals = await base44.asServiceRole.entities.Festival.list('created_date', limit, skip);

    console.log(`[SyncMismatch] Batch festivals: ${allFestivals.length}`);

    const updated = [];
    const mismatchNotFixed = [];
    const noYtData = [];
    const alreadySynced = [];

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 2. 각 Festival에 대해 최신 YoutubeRawdata 조회 후 비교
    for (const festival of allFestivals) {
      await sleep(200); // rate limit 방지
      const ytRecords = await base44.asServiceRole.entities.YoutubeRawdata.filter(
        { festival_id: festival.id }, '-update_time', 1
      );

      if (ytRecords.length === 0) {
        noYtData.push({ id: festival.id, name: festival.name_ko || festival.name_original || festival.id });
        continue;
      }

      const latestYt = ytRecords[0];
      const ytPopularity = latestYt.popularity || 0;
      const festivalPopularity = festival.popularity || 0;

      // 값이 같으면 스킵
      if (ytPopularity === festivalPopularity) {
        alreadySynced.push(festival.id);
        continue;
      }

      // 값이 다르면 업데이트
      console.log(`[SyncMismatch] Mismatch: ${festival.name_ko || festival.id} | Festival=${festivalPopularity} → YT=${ytPopularity}`);

      if (ytPopularity > 0) {
        await sleep(200); // rate limit 방지
        await base44.asServiceRole.entities.Festival.update(festival.id, {
          popularity: ytPopularity,
          shorts_views_5_total: latestYt.raw_shorts_views_5_total || 0
        });
        updated.push({
          id: festival.id,
          name: festival.name_ko || festival.name_original || festival.id,
          old_popularity: festivalPopularity,
          new_popularity: ytPopularity,
          yt_update_time: latestYt.update_time
        });
      } else {
        // YT popularity = 0인데 Festival은 다른 값 → 0으로 덮어쓰지 않고 기록만
        mismatchNotFixed.push({
          id: festival.id,
          name: festival.name_ko || festival.name_original || festival.id,
          festival_popularity: festivalPopularity,
          yt_popularity: ytPopularity,
          reason: 'YT popularity=0이므로 덮어쓰지 않음'
        });
      }
    }

    console.log(`[SyncMismatch] ========== DONE: Updated=${updated.length}, AlreadySynced=${alreadySynced.length}, NoYtData=${noYtData.length}, MismatchNotFixed=${mismatchNotFixed.length} ==========`);

    return Response.json({
      success: true,
      message: `${updated.length}개 축제 popularity 동기화 완료`,
      batch_size: allFestivals.length,
      current_skip: skip,
      next_skip: skip + limit,
      has_more: allFestivals.length === limit,
      updated_count: updated.length,
      already_synced_count: alreadySynced.length,
      no_yt_data_count: noYtData.length,
      mismatch_not_fixed_count: mismatchNotFixed.length,
      updated,
      mismatch_not_fixed: mismatchNotFixed
    });

  } catch (error) {
    console.error('[SyncMismatch] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});