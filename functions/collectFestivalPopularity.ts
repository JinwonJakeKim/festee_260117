import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');

async function searchYouTubeVideos(query, maxResults = 50) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(query)}&maxResults=${maxResults}&type=video&key=${YOUTUBE_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`YouTube API error: ${response.status}`);
      return { videoIds: [], count: 0 };
    }
    
    const data = await response.json();
    const videoIds = data.items?.map(item => item.id.videoId).filter(Boolean) || [];
    return { videoIds, count: data.pageInfo?.totalResults || 0 };
  } catch (error) {
    console.error('YouTube search error:', error.message);
    return { videoIds: [], count: 0 };
  }
}

async function logYoutubeApiUsage(base44, callCount) {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const existing = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: 'youtube_data_api', date: today });
    if (existing.length > 0) {
      await base44.asServiceRole.entities.ApiUsageLog.update(existing[0].id, {
        count: (existing[0].count || 0) + callCount
      });
    } else {
      await base44.asServiceRole.entities.ApiUsageLog.create({
        api_name: 'youtube_data_api',
        date: today,
        count: callCount,
        limit: 100
      });
    }
  } catch (e) {
    console.error('[collectFestivalPopularity] Failed to log API usage:', e.message);
  }
}

async function getVideoStats(videoIds) {
  if (videoIds.length === 0) return { totalViews: 0 };
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?` +
      `part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`YouTube API error: ${response.status}`);
      return { totalViews: 0 };
    }
    
    const data = await response.json();
    const totalViews = data.items?.reduce((sum, item) => {
      const views = parseInt(item.statistics?.viewCount || 0);
      return sum + views;
    }, 0) || 0;
    
    return { totalViews };
  } catch (error) {
    console.error('YouTube stats error:', error.message);
    return { totalViews: 0 };
  }
}

function calculateMetricPeriod(executionDate) {
  const year = executionDate.getFullYear();
  const month = executionDate.getMonth();
  const day = executionDate.getDate();
  
  const periodStart = new Date(year, month, day);
  periodStart.setHours(0, 0, 0, 0);
  
  // 월말 계산
  const nextMonth = new Date(year, month + 1, 1);
  const periodEnd = new Date(nextMonth.getTime() - 1);
  periodEnd.setHours(23, 59, 59, 999);
  
  return {
    start: periodStart.toISOString().split('T')[0],
    end: periodEnd.toISOString().split('T')[0],
    startDate: periodStart
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 요청 본문에서 festival_id 확인 (특정 축제만 수집하는 경우)
    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // JSON 파싱 실패 시 무시
    }

    // 실행 시점의 측정 기간 계산
    const executionDate = new Date();
    const { start: periodStart, end: periodEnd, startDate } = calculateMetricPeriod(executionDate);

    console.log(`[collectFestivalPopularity] Executing at ${executionDate.toISOString()}`);
    console.log(`[collectFestivalPopularity] Metric period: ${periodStart} ~ ${periodEnd}`);

    // 모든 축제 조회
    const allFestivals = await base44.entities.Festival.list();
    
    // 필터링: 특정 축제만 수집하거나, 실행 시점 이후에 끝나는 축제만 수집
    let targetFestivals;
    if (body.festival_id) {
      // 특정 축제만 수집
      targetFestivals = allFestivals.filter(f => f.id === body.festival_id);
    } else {
      // 실행 시점 이후에 끝나는 축제만 수집
      targetFestivals = allFestivals.filter(festival => {
        if (!festival.end_date) return false;
        const festivalEndDate = new Date(festival.end_date);
        return festivalEndDate >= startDate;
      });
    }

    console.log(`[collectFestivalPopularity] Found ${targetFestivals.length} target festivals out of ${allFestivals.length} total`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let totalApiCalls = 0;

    // 각 축제의 인기도 수집
    for (const festival of targetFestivals) {
      try {
        // 연도 제거 함수 (예: "2024 서울 불꽃축제" → "서울 불꽃축제")
        const removeYear = (name) => name ? name.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim() : '';

        // 4개 언어 (한국어, 영어, 일본어, 중국어) 조회
        const languageConfigs = [
          { key: 'ko', name: removeYear(festival.name_ko || festival.name_original), lang: '한국어' },
          { key: 'en', name: removeYear(festival.name_en || festival.name_original), lang: '영어' },
          { key: 'jp', name: removeYear(festival.name_jp || festival.name_original), lang: '일본어' },
          { key: 'zh', name: removeYear(festival.name_zh || festival.name_original), lang: '중국어' }
        ];

        const populairtyData = {
          festival_id: festival.id,
          metric_period_start: periodStart,
          metric_period_end: periodEnd,
          source: 'YouTube',
          views_total: 0,
          videonums_total: 0
        };

        // 각 언어별로 YouTube 데이터 수집
        for (const config of languageConfigs) {
          const query = config.name || '';
          
          if (!query) {
            console.warn(`[collectFestivalPopularity] No name for festival ${festival.id} in ${config.lang}`);
            continue;
          }

          const { videoIds, count } = await searchYouTubeVideos(query, 50);
          totalApiCalls += 1; // search API call
          const { totalViews } = await getVideoStats(videoIds);
          if (videoIds.length > 0) totalApiCalls += 1; // videos stats API call

          populairtyData[`query_used_${config.key}`] = query;
          populairtyData[`videonums_${config.key}`] = count;
          populairtyData[`views_${config.key}`] = totalViews;
          populairtyData.views_total += totalViews;
          populairtyData.videonums_total += count;

          // API rate limit 회피를 위한 대기
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // 기존 FestivalPopularity 레코드 확인
        const existing = await base44.entities.FestivalPopularity.filter({
          festival_id: festival.id,
          metric_period_start: periodStart,
          metric_period_end: periodEnd
        });

        if (existing.length > 0) {
          // 이미 해당 기간의 데이터가 있으면 업데이트
          await base44.entities.FestivalPopularity.update(existing[0].id, populairtyData);
          console.log(`[collectFestivalPopularity] Updated popularity for festival ${festival.id}`);
        } else {
          // 없으면 새로 생성
          await base44.entities.FestivalPopularity.create(populairtyData);
          console.log(`[collectFestivalPopularity] Created popularity for festival ${festival.id}`);
        }

        successCount++;
        results.push({
          festival_id: festival.id,
          festival_name: festival.name_ko || festival.name_en || festival.name_original,
          views_total: populairtyData.views_total,
          status: 'success'
        });
      } catch (error) {
        errorCount++;
        console.error(`[collectFestivalPopularity] Error processing festival ${festival.id}:`, error.message);
        results.push({
          festival_id: festival.id,
          status: 'error',
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      execution_date: executionDate.toISOString(),
      metric_period_start: periodStart,
      metric_period_end: periodEnd,
      total_festivals_processed: targetFestivals.length,
      success_count: successCount,
      error_count: errorCount,
      results
    });
  } catch (error) {
    console.error('[collectFestivalPopularity] Fatal error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});