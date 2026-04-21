import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// YoutubeRawdata에서 festival_id별 최대 popularity를 찾아 Festival에 동기화
// payload: { festival_ids: [...] } 로 특정 축제만 지정 가능, 없으면 popularity=0인 전체 처리
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetIds = body.festival_ids || null;

    console.log('[SyncMax] ========== START ==========');

    // 대상 축제 목록 조회
    let targetFestivals = [];
    if (targetIds && targetIds.length > 0) {
      // 특정 ID만 처리
      for (const id of targetIds) {
        const records = await base44.asServiceRole.entities.Festival.filter({ id }, '-created_date', 1);
        if (records.length > 0) targetFestivals.push(records[0]);
      }
    } else {
      // popularity=0인 전체 조회
      let skip = 0;
      const pageSize = 100;
      while (true) {
        const page = await base44.asServiceRole.entities.Festival.filter(
          { popularity: 0 }, 'created_date', pageSize, skip
        );
        targetFestivals = targetFestivals.concat(page);
        if (page.length < pageSize) break;
        skip += pageSize;
      }
    }

    console.log(`[SyncMax] Target festivals: ${targetFestivals.length}`);

    const updated = [];
    const stillZero = [];

    for (const festival of targetFestivals) {
      try {
        // 해당 festival의 YoutubeRawdata 레코드 중 가장 최신 레코드 1개 조회
        const allYtRecords = await base44.asServiceRole.entities.YoutubeRawdata.filter(
          { festival_id: festival.id }, '-update_time', 1
        );

        if (allYtRecords.length === 0) {
          stillZero.push({ id: festival.id, name: festival.name_ko || festival.name_original || festival.id, reason: 'YoutubeRawdata 없음' });
          continue;
        }

        // 가장 최신 레코드 사용
        const bestRecord = allYtRecords[0];

        const maxPopularity = bestRecord.popularity || 0;
        const rawShorts = bestRecord.raw_shorts_views_5_total || 0;

        if (maxPopularity > 0) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            popularity: maxPopularity,
            shorts_views_5_total: rawShorts
          });
          console.log(`[SyncMax] ✓ ${festival.name_ko || festival.id} → popularity=${maxPopularity} (최신 레코드: ${bestRecord.update_time})`);
          updated.push({
            id: festival.id,
            name: festival.name_ko || festival.name_original || festival.id,
            new_popularity: maxPopularity,
            shorts_views_5_total: rawShorts,
            latest_update_time: bestRecord.update_time
          });
        } else {
          console.log(`[SyncMax] Still 0: ${festival.name_ko || festival.id} (최신 YoutubeRawdata.popularity=0)`);
          stillZero.push({
            id: festival.id,
            name: festival.name_ko || festival.name_original || festival.id,
            reason: `최신 YoutubeRawdata(${bestRecord.update_time}).popularity=0`
          });
        }
      } catch (err) {
        console.error(`[SyncMax] Error for ${festival.id}:`, err.message);
        stillZero.push({ id: festival.id, name: festival.name_ko || festival.id, reason: `오류: ${err.message}` });
      }
    }

    console.log(`[SyncMax] ========== DONE: Updated=${updated.length}, StillZero=${stillZero.length} ==========`);

    return Response.json({
      success: true,
      message: `${updated.length}개 축제 업데이트 완료`,
      updated_count: updated.length,
      still_zero_count: stillZero.length,
      updated,
      still_zero: stillZero
    });

  } catch (error) {
    console.error('[SyncMax] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});