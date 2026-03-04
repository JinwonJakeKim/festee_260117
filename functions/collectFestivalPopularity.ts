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

const YOUTUBE_DAILY_LIMIT = 90;

async function getYoutubeUsage(base44) {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const existing = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: 'youtube_data_api', date: today });
    if (existing.length > 0) {
      return { id: existing[0].id, count: existing[0].count || 0, date: today };
    }
    return { id: null, count: 0, date: today };
  } catch (e) {
    console.error('[collectFestivalPopularity] Failed to get API usage:', e.message);
    return { id: null, count: 0, date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) };
  }
}

async function incrementYoutubeUsage(base44, usageInfo, callCount) {
  try {
    if (usageInfo.id) {
      await base44.asServiceRole.entities.ApiUsageLog.update(usageInfo.id, {
        count: usageInfo.count + callCount
      });
    } else {
      await base44.asServiceRole.entities.ApiUsageLog.create({
        api_name: 'youtube_data_api',
        date: usageInfo.date,
        count: callCount,
        limit: YOUTUBE_DAILY_LIMIT
      });
    }
  } catch (e) {
    console.error('[collectFestivalPopularity] Failed to increment API usage:', e.message);
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

    // YouTube API 사용량 사전 확인
    let youtubeUsage = await getYoutubeUsage(base44);
    console.log(`[collectFestivalPopularity] YouTube API usage today: ${youtubeUsage.count}/${YOUTUBE_DAILY_LIMIT}`);

    // 각 축제의 인기도 수집
    for (const festival of targetFestivals) {
      try {
        // 연도 제거 함수 (예: "2024 서울 불꽃축제" → "서울 불꽃축제")
        const removeYear = (name) => name ? name.replace(/(19|20)\d{2}년?/g, '').replace(/\s+/g, ' ').trim() : '';

        // 국가별 언어 쿼리 설정
        // 대한민국: 한국어 + 영어, 일본: 일본어 + 영어, 그 외: 영어 + 원어
        const country = (festival.country || festival.country_en || '').toLowerCase();
        const isKorea = country.includes('korea') || country.includes('한국') || country.includes('대한민국');
        const isJapan = country.includes('japan') || country.includes('일본');

        let languageConfigs;
        if (isKorea) {
          languageConfigs = [
            { key: 'ko', name: removeYear(festival.name_ko || festival.name_original), lang: '한국어' },
            { key: 'en', name: removeYear(festival.name_en || festival.name_original), lang: '영어' }
          ];
        } else if (isJapan) {
          languageConfigs = [
            { key: 'jp', name: removeYear(festival.name_jp || festival.name_original), lang: '일본어' },
            { key: 'en', name: removeYear(festival.name_en || festival.name_original), lang: '영어' }
          ];
        } else {
          // 기타 국가: 영어 + 한국어
          languageConfigs = [
            { key: 'en', name: removeYear(festival.name_en || festival.name_original), lang: '영어' },
            { key: 'ko', name: removeYear(festival.name_ko || festival.name_original), lang: '한국어' }
          ];
        }

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

          // 한도 초과 확인 (search 1회 + stats 1회 = 최대 2회 필요)
          if (youtubeUsage.count + 1 > YOUTUBE_DAILY_LIMIT) {
            console.warn(`[collectFestivalPopularity] YouTube API daily limit reached: ${youtubeUsage.count}/${YOUTUBE_DAILY_LIMIT}`);
            return Response.json({
              success: false,
              error: 'YOUTUBE_API_LIMIT_REACHED',
              message: `YouTube Data API 하루 ${YOUTUBE_DAILY_LIMIT}회 무료 한도를 초과했습니다. (현재 ${youtubeUsage.count}회 사용) 내일 다시 시도해주세요.`,
              partial: { success_count: successCount, error_count: errorCount }
            }, { status: 429 });
          }

          const { videoIds, count } = await searchYouTubeVideos(query, 50);
          youtubeUsage.count += 1;
          await incrementYoutubeUsage(base44, youtubeUsage, 1);
          youtubeUsage.id = youtubeUsage.id || 'updated'; // mark as existing

          const { totalViews } = await getVideoStats(videoIds);
          if (videoIds.length > 0) {
            if (youtubeUsage.count + 1 > YOUTUBE_DAILY_LIMIT) {
              // stats 호출도 한도 초과 시 views=0으로 처리하고 계속
              console.warn(`[collectFestivalPopularity] Limit reached for stats call, skipping`);
            } else {
              youtubeUsage.count += 1;
              await incrementYoutubeUsage(base44, youtubeUsage, 1);
            }
          }

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