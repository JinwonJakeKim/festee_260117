import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// YouTube Shorts URL에서 비디오 ID 추출
function extractVideoId(url) {
  if (!url) return null;
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { batchSize = 50, onlyMissing = true, festivalIds = null, country = null, startMonth = null } = await req.json().catch(() => ({}));

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!youtubeApiKey) {
      return Response.json({ success: false, error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });
    }

    // API 사용량 체크 & 증가
    const today = new Date().toISOString().split('T')[0];
    const checkAndIncrementApiUsage = async () => {
      const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
        api_name: 'youtube_data_api',
        date: today
      }).catch(() => []);

      if (logs.length === 0) {
        await base44.asServiceRole.entities.ApiUsageLog.create({
          api_name: 'youtube_data_api',
          date: today,
          count: 1,
          limit: 90
        }).catch(() => {});
        return { allowed: true, count: 1 };
      }

      const log = logs[0];
      if (log.count >= 95) {
        return { allowed: false, count: log.count };
      }
      await base44.asServiceRole.entities.ApiUsageLog.update(log.id, { count: log.count + 1 }).catch(() => {});
      return { allowed: true, count: log.count + 1 };
    };

    // Festival 목록 조회
    console.log(`[UpdateShortsViews] Fetching festivals... country=${country}, startMonth=${startMonth}`);
    let allFestivals;
    if (festivalIds && Array.isArray(festivalIds) && festivalIds.length > 0) {
      allFestivals = await Promise.all(
        festivalIds.map(id => base44.asServiceRole.entities.Festival.filter({ id }).then(r => r[0]).catch(() => null))
      );
      allFestivals = allFestivals.filter(Boolean);
      console.log(`[UpdateShortsViews] Using provided festivalIds: ${allFestivals.length} festivals`);
    } else {
      allFestivals = await base44.asServiceRole.entities.Festival.list('-created_date', 1000);
    }

    const targetFestivals = allFestivals.filter(f => {
      if (!f.youtube_shorts_urls || f.youtube_shorts_urls.length === 0) return false;
      if (onlyMissing && f.shorts_views_5_total > 0) return false;
      if (country && f.country !== country) return false;
      if (startMonth && f.start_date && !f.start_date.startsWith(startMonth)) return false;
      return true;
    }).slice(0, batchSize);

    console.log(`[UpdateShortsViews] Target festivals: ${targetFestivals.length} (onlyMissing=${onlyMissing})`);

    if (targetFestivals.length === 0) {
      return Response.json({
        success: true,
        message: '업데이트할 축제가 없습니다.',
        updated: 0,
        skipped: 0
      });
    }

    let updated = 0;
    let skipped = 0;
    let apiCallCount = 0;

    const festivalVideoMap = [];

    for (const festival of targetFestivals) {
      const videoIds = (festival.youtube_shorts_urls || [])
        .map(url => extractVideoId(url))
        .filter(id => id);

      if (videoIds.length === 0) {
        skipped++;
        continue;
      }
      festivalVideoMap.push({ festivalId: festival.id, videoIds });
    }

    const allVideoIds = [...new Set(festivalVideoMap.flatMap(f => f.videoIds))];
    console.log(`[UpdateShortsViews] Total unique video IDs: ${allVideoIds.length}`);

    const BATCH_SIZE = 50;
    const viewCountMap = {};

    for (let i = 0; i < allVideoIds.length; i += BATCH_SIZE) {
      const batchIds = allVideoIds.slice(i, i + BATCH_SIZE);

      const usage = await checkAndIncrementApiUsage();
      if (!usage.allowed) {
        console.warn(`[UpdateShortsViews] ⛔ YouTube API 일일 한도 초과 (${usage.count}/90)`);
        return Response.json({
          success: false,
          error: `YouTube API 일일 한도 초과 (${usage.count}/90)`,
          updated,
          skipped
        }, { status: 429 });
      }
      apiCallCount++;

      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batchIds.join(',')}&key=${youtubeApiKey}`;
      console.log(`[UpdateShortsViews] 📡 API call #${apiCallCount} for ${batchIds.length} video IDs...`);

      await new Promise(resolve => setTimeout(resolve, 300));
      const res = await fetch(url);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[UpdateShortsViews] ❌ YouTube API error (${res.status}):`, errText);
        continue;
      }

      const data = await res.json();
      (data.items || []).forEach(video => {
        viewCountMap[video.id] = parseInt(video.statistics?.viewCount || '0', 10);
      });

      console.log(`[UpdateShortsViews] ✓ Got stats for ${(data.items || []).length} videos`);
    }

    for (const { festivalId, videoIds } of festivalVideoMap) {
      const totalViews = videoIds.reduce((sum, id) => sum + (viewCountMap[id] || 0), 0);
      console.log(`[UpdateShortsViews] Festival ${festivalId}: ${videoIds.length} shorts, total views = ${totalViews}`);

      await base44.asServiceRole.entities.Festival.update(festivalId, {
        shorts_views_5_total: totalViews
      });
      updated++;
    }

    console.log(`[UpdateShortsViews] ✅ Done. updated=${updated}, skipped=${skipped}, apiCalls=${apiCallCount}`);

    return Response.json({
      success: true,
      message: `${updated}개 축제의 shorts_views_5_total 업데이트 완료 (API 호출 ${apiCallCount}회)`,
      updated,
      skipped,
      apiCallCount
    });

  } catch (error) {
    console.error('[UpdateShortsViews] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});