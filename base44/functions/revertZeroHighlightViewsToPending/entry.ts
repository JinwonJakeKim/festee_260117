import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // source: 'japan' | 'tour' | undefined(both)
  const source = body.source;

  // 1. selected_highlight_views가 0인 YoutubeRawdata에서 festival_id 수집
  let allYtRecords = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.YoutubeRawdata.list('-created_date', 200, skip);
    if (!batch || batch.length === 0) break;
    allYtRecords = allYtRecords.concat(batch);
    if (batch.length < 200) break;
    skip += 200;
  }

  const zeroHighlightFestivalIds = new Set(
    allYtRecords
      .filter(r => (r.selected_highlight_views || 0) === 0 && r.festival_id)
      .map(r => r.festival_id)
  );

  console.log(`[Revert] 0-highlight festival IDs: ${zeroHighlightFestivalIds.size}, source: ${source || 'both'}`);
  if (zeroHighlightFestivalIds.size === 0) {
    return Response.json({ success: true, zeroHighlightFestivalCount: 0, japanUpdated: 0, tourUpdated: 0, total: 0 });
  }

  const festivalIdList = [...zeroHighlightFestivalIds];
  let japanUpdated = 0;
  let tourUpdated = 0;

  // JapantravelRawData 처리
  if (!source || source === 'japan') {
    let allJapan = [];
    let s = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.JapantravelRawData.filter({ processing_status: 'processed' }, '-created_date', 200, s);
      if (!batch || batch.length === 0) break;
      allJapan = allJapan.concat(batch);
      if (batch.length < 200) break;
      s += 200;
    }
    const toUpdate = allJapan.filter(r => r.festival_id && zeroHighlightFestivalIds.has(r.festival_id));
    console.log(`[Revert] JapantravelRawData to update: ${toUpdate.length}`);
    await Promise.all(toUpdate.map(r =>
      base44.asServiceRole.entities.JapantravelRawData.update(r.id, { processing_status: 'pending', error_message: null })
    ));
    japanUpdated = toUpdate.length;
  }

  // TourApiRawData 처리
  if (!source || source === 'tour') {
    let allTour = [];
    let s = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.TourApiRawData.filter({ processing_status: 'processed' }, '-created_date', 200, s);
      if (!batch || batch.length === 0) break;
      allTour = allTour.concat(batch);
      if (batch.length < 200) break;
      s += 200;
    }
    const toUpdate = allTour.filter(r => r.festival_id && zeroHighlightFestivalIds.has(r.festival_id));
    console.log(`[Revert] TourApiRawData to update: ${toUpdate.length}`);
    await Promise.all(toUpdate.map(r =>
      base44.asServiceRole.entities.TourApiRawData.update(r.id, { processing_status: 'pending', error_message: null })
    ));
    tourUpdated = toUpdate.length;
  }

  console.log(`[Revert] Done — Japan: ${japanUpdated}, Tour: ${tourUpdated}`);

  return Response.json({
    success: true,
    zeroHighlightFestivalCount: zeroHighlightFestivalIds.size,
    japanUpdated,
    tourUpdated,
    total: japanUpdated + tourUpdated
  });
});