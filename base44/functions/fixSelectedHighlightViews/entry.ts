import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// YoutubeRawdata의 highlights1~5_url 중 Festival.video_url과 매칭되는 것을 찾아
// selected_highlight_views 필드에 해당 조회수를 저장하는 함수

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    // Festival 전체를 미리 로드해서 Map으로 만들기 (rate limit 방지)
    let allFestivals = [];
    let fSkip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Festival.list('-created_date', 100, fSkip);
      if (!batch || batch.length === 0) break;
      allFestivals = [...allFestivals, ...batch];
      if (batch.length < 100) break;
      fSkip += 100;
    }
    const festivalMap = new Map(allFestivals.map(f => [f.id, f]));
    console.log(`[FixHighlightViews] Loaded ${allFestivals.length} festivals into memory`);

    // 모든 YoutubeRawdata 레코드 로드
    let allRecords = [];
    let skip = 0;
    const batchSize = 50;
    while (true) {
      const batch = await base44.asServiceRole.entities.YoutubeRawdata.list('-created_date', batchSize, skip);
      if (!batch || batch.length === 0) break;
      allRecords = [...allRecords, ...batch];
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    console.log(`[FixHighlightViews] Total YoutubeRawdata records: ${allRecords.length}`);

    // festival_id별로 최신 레코드만 처리 (중복 festival_id 있을 경우)
    // 실제로는 전체 처리
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of allRecords) {
      if (!record.festival_id) {
        skipped++;
        continue;
      }

      // Festival 메모리 Map에서 조회
      const festival = festivalMap.get(record.festival_id);
      if (!festival) {
        console.warn(`[FixHighlightViews] Festival not found: ${record.festival_id}`);
        skipped++;
        continue;
      }

      if (!festival || !festival.video_url) {
        skipped++;
        continue;
      }

      const adoptedUrl = festival.video_url.trim();

      // highlights1~5 중 매칭되는 것 찾기
      let selectedViews = 0;
      let matched = false;

      for (let i = 1; i <= 5; i++) {
        const url = record[`highlights${i}_url`];
        const views = record[`highlights${i}_views`] || 0;
        if (url && url.trim() === adoptedUrl) {
          selectedViews = views;
          matched = true;
          console.log(`[FixHighlightViews] ✓ festival=${record.festival_id} matched highlights${i}_url, views=${views}`);
          break;
        }
      }

      if (!matched) {
        // URL이 매칭되지 않으면 highlights1_views를 기본값으로 사용
        selectedViews = record.highlights1_views || 0;
        console.log(`[FixHighlightViews] ⚠️ No URL match for festival=${record.festival_id}, fallback to highlights1_views=${selectedViews}`);
      }

      // 이미 동일한 값이면 스킵
      if (record.selected_highlight_views === selectedViews) {
        skipped++;
        continue;
      }

      try {
        await base44.asServiceRole.entities.YoutubeRawdata.update(record.id, {
          selected_highlight_views: selectedViews
        });
        updated++;
      } catch (e) {
        console.error(`[FixHighlightViews] Update failed for ${record.id}:`, e.message);
        errors++;
      }
    }

    console.log(`[FixHighlightViews] Done. updated=${updated}, skipped=${skipped}, errors=${errors}`);
    return Response.json({
      success: true,
      total: allRecords.length,
      updated,
      skipped,
      errors
    });

  } catch (error) {
    console.error('[FixHighlightViews] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});