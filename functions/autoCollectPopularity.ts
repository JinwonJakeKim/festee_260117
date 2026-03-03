import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
const YOUTUBE_DAILY_LIMIT = 90;
const BATCH_SIZE = 20;

async function searchYouTubeVideos(query, maxResults = 50) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&q=${encodeURIComponent(query)}&maxResults=${maxResults}&type=video&key=${YOUTUBE_API_KEY}`
  );
  if (!response.ok) return { videoIds: [], count: 0 };
  const data = await response.json();
  const videoIds = data.items?.map(item => item.id.videoId).filter(Boolean) || [];
  return { videoIds, count: data.pageInfo?.totalResults || 0 };
}

async function getVideoStats(videoIds) {
  if (videoIds.length === 0) return { totalViews: 0 };
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?` +
    `part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
  );
  if (!response.ok) return { totalViews: 0 };
  const data = await response.json();
  const totalViews = data.items?.reduce((sum, item) => sum + parseInt(item.statistics?.viewCount || 0), 0) || 0;
  return { totalViews };
}

async function getYoutubeUsage(base44) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const existing = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: 'youtube_data_api', date: today });
  if (existing.length > 0) return { id: existing[0].id, count: existing[0].count || 0, date: today };
  return { id: null, count: 0, date: today };
}

async function incrementYoutubeUsage(base44, usageInfo, callCount) {
  if (usageInfo.id && usageInfo.id !== 'new') {
    await base44.asServiceRole.entities.ApiUsageLog.update(usageInfo.id, { count: usageInfo.count + callCount });
  } else if (!usageInfo.id || usageInfo.id === 'new') {
    const created = await base44.asServiceRole.entities.ApiUsageLog.create({
      api_name: 'youtube_data_api',
      date: usageInfo.date,
      count: callCount,
      limit: YOUTUBE_DAILY_LIMIT
    });
    usageInfo.id = created.id;
  }
}

function calculateMetricPeriod(now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const periodStart = new Date(year, month, day);
  const nextMonth = new Date(year, month + 1, 1);
  const periodEnd = new Date(nextMonth.getTime() - 1);
  return {
    start: periodStart.toISOString().split('T')[0],
    end: periodEnd.toISOString().split('T')[0],
    startDate: periodStart
  };
}

function removeYear(name) {
  return name ? name.replace(/(19|20)\d{2}년?/g, '').replace(/\s+/g, ' ').trim() : '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const executionDate = new Date();
    const { start: periodStart, end: periodEnd, startDate } = calculateMetricPeriod(executionDate);

    console.log(`[autoCollectPopularity] Starting at ${executionDate.toISOString()}`);

    // 현재월 이후로 끝나는 축제만 조회
    const allFestivals = await base44.asServiceRole.entities.Festival.list();
    const candidateFestivals = allFestivals.filter(f => {
      if (!f.end_date) return false;
      return new Date(f.end_date) >= startDate;
    });

    // 이미 이번 달 인기도 데이터가 있는 축제 ID 목록 조회
    const existingPopularity = await base44.asServiceRole.entities.FestivalPopularity.filter({
      metric_period_start: periodStart
    });
    const alreadyCollectedIds = new Set(existingPopularity.map(p => p.festival_id));

    // 아직 수집 안 된 축제만 필터링
    const pendingFestivals = candidateFestivals.filter(f => !alreadyCollectedIds.has(f.id));

    // 시작일 기준으로 정렬 (가까운 월 먼저), 배치 크기만큼 선택
    pendingFestivals.sort((a, b) => {
      const aDate = new Date(a.start_date || a.end_date);
      const bDate = new Date(b.start_date || b.end_date);
      return aDate - bDate;
    });
    const targetFestivals = pendingFestivals.slice(0, BATCH_SIZE);

    console.log(`[autoCollectPopularity] Total candidates: ${candidateFestivals.length}, pending: ${pendingFestivals.length}, processing: ${targetFestivals.length}`);

    let youtubeUsage = await getYoutubeUsage(base44);
    console.log(`[autoCollectPopularity] YouTube usage: ${youtubeUsage.count}/${YOUTUBE_DAILY_LIMIT}`);

    let successCount = 0;
    let errorCount = 0;

    for (const festival of targetFestivals) {
      try {
        const languageConfigs = [
          { key: 'ko', name: removeYear(festival.name_ko || festival.name_original) },
          { key: 'en', name: removeYear(festival.name_en || festival.name_original) },
          { key: 'jp', name: removeYear(festival.name_jp || festival.name_original) },
          { key: 'zh', name: removeYear(festival.name_zh || festival.name_original) }
        ];

        const popularityData = {
          festival_id: festival.id,
          metric_period_start: periodStart,
          metric_period_end: periodEnd,
          source: 'YouTube',
          views_total: 0,
          videonums_total: 0
        };

        for (const config of languageConfigs) {
          const query = config.name || '';
          if (!query) continue;

          if (youtubeUsage.count + 1 > YOUTUBE_DAILY_LIMIT) {
            console.warn(`[autoCollectPopularity] Daily limit reached: ${youtubeUsage.count}/${YOUTUBE_DAILY_LIMIT}`);
            return Response.json({
              success: false,
              error: 'YOUTUBE_API_LIMIT_REACHED',
              message: `YouTube API 일일 한도(${YOUTUBE_DAILY_LIMIT}회) 초과. 현재 ${youtubeUsage.count}회 사용.`,
              success_count: successCount,
              error_count: errorCount
            }, { status: 429 });
          }

          const { videoIds, count } = await searchYouTubeVideos(query, 50);
          youtubeUsage.count += 1;
          await incrementYoutubeUsage(base44, youtubeUsage, 1);

          let totalViews = 0;
          if (videoIds.length > 0 && youtubeUsage.count + 1 <= YOUTUBE_DAILY_LIMIT) {
            const stats = await getVideoStats(videoIds);
            totalViews = stats.totalViews;
            youtubeUsage.count += 1;
            await incrementYoutubeUsage(base44, youtubeUsage, 1);
          }

          popularityData[`query_used_${config.key}`] = query;
          popularityData[`videonums_${config.key}`] = count;
          popularityData[`views_${config.key}`] = totalViews;
          popularityData.views_total += totalViews;
          popularityData.videonums_total += count;

          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // 기존 레코드 확인 후 생성/업데이트
        const existing = existingPopularity.filter(p => p.festival_id === festival.id);
        if (existing.length > 0) {
          await base44.asServiceRole.entities.FestivalPopularity.update(existing[0].id, popularityData);
        } else {
          await base44.asServiceRole.entities.FestivalPopularity.create(popularityData);
        }

        successCount++;
        console.log(`[autoCollectPopularity] Done: ${festival.name_ko || festival.name_original} (views: ${popularityData.views_total})`);
      } catch (error) {
        errorCount++;
        console.error(`[autoCollectPopularity] Error for festival ${festival.id}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      execution_date: executionDate.toISOString(),
      metric_period: `${periodStart} ~ ${periodEnd}`,
      total_pending: pendingFestivals.length,
      processed: targetFestivals.length,
      success_count: successCount,
      error_count: errorCount,
      youtube_usage: youtubeUsage.count
    });
  } catch (error) {
    console.error('[autoCollectPopularity] Fatal error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});