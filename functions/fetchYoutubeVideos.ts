import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 관리자 인증 체크
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { festivalName } = await req.json();
    
    if (!festivalName || festivalName.trim() === '') {
      return Response.json({ 
        success: false,
        error: 'festivalName is required' 
      }, { status: 400 });
    }

    console.log(`[FetchYoutubeVideos] 🎬 YouTube video search for: "${festivalName}"`);

    // API 사용량 체크 함수
    const checkAndIncrementApiUsage = async (apiName, limit) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      try {
        const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
          api_name: apiName,
          date: today
        });
        
        if (logs.length === 0) {
          await base44.asServiceRole.entities.ApiUsageLog.create({
            api_name: apiName,
            date: today,
            count: 1,
            limit: limit
          });
          console.log(`[FetchYoutubeVideos] ✓ ${apiName} usage: 1/${limit}`);
          return { allowed: true, count: 1, limit };
        } else {
          const log = logs[0];
          if (log.count >= limit) {
            console.log(`[FetchYoutubeVideos] ❌ ${apiName} daily limit reached: ${log.count}/${limit}`);
            return { allowed: false, count: log.count, limit };
          }
          
          await base44.asServiceRole.entities.ApiUsageLog.update(log.id, {
            count: log.count + 1
          });
          console.log(`[FetchYoutubeVideos] ✓ ${apiName} usage: ${log.count + 1}/${limit}`);
          return { allowed: true, count: log.count + 1, limit };
        }
      } catch (error) {
        console.error(`[FetchYoutubeVideos] ❌ Failed to check API usage:`, error.message);
        return { allowed: true, count: 0, limit };
      }
    };

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!youtubeApiKey) {
      console.log(`[FetchYoutubeVideos] ⚠️ YOUTUBE_API_KEY is missing or empty`);
      return Response.json({
        success: true,
        topVideoUrl: '',
        shortsUrls: [],
        message: 'YOUTUBE_API_KEY not configured'
      });
    }
    
    // API 사용량 체크
    const usage = await checkAndIncrementApiUsage('youtube_data_api', 100);
    if (!usage.allowed) {
      return Response.json({
        success: false,
        error: 'YOUTUBE_API_LIMIT_REACHED',
        message: `YouTube Data API 일일 한도 초과: ${usage.count}/${usage.limit}`
      }, { status: 429 });
    }
    
    // YouTube Data API v3 search endpoint - 관련성 기준 검색 (10개)
    const searchParams = new URLSearchParams({
      part: 'id,snippet',
      q: festivalName,
      type: 'video',
      order: 'relevance',
      maxResults: '10',
      key: youtubeApiKey
    });
    
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
    console.log(`[FetchYoutubeVideos] 📡 Calling YouTube API (relevance order, 10 videos)...`);
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FetchYoutubeVideos] ❌ YouTube API error (${response.status}):`, errorText);
      return Response.json({
        success: true,
        topVideoUrl: '',
        shortsUrls: [],
        message: 'YouTube API request failed'
      });
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log(`[FetchYoutubeVideos] ⚠️ No videos found for: ${festivalName}`);
      return Response.json({
        success: true,
        topVideoUrl: '',
        shortsUrls: [],
        message: 'No videos found'
      });
    }
    
    console.log(`[FetchYoutubeVideos] 📋 Raw API response - ${data.items.length} videos returned`);
    
    // 뉴스 영상 판별 함수
    const isNewsVideo = (item) => {
      const title = (item.snippet.title || '').toLowerCase();
      const channelTitle = (item.snippet.channelTitle || '').toLowerCase();
      
      const newsOrgs = ['kbs', 'mbc', 'sbs', 'ytn', 'jtbc', '연합뉴스', 'channel a', 'tv조선', 'mbn'];
      const newsKeywords = ['뉴스', '속보', '보도', '현장', '긴급', '취재', '기자회견', '방송', 'news', 'breaking', 'report', 'live coverage'];
      
      const hasNewsOrg = newsOrgs.some(org => channelTitle.includes(org) || title.includes(org));
      const hasNewsKeyword = newsKeywords.some(keyword => title.includes(keyword) || channelTitle.includes(keyword));
      
      return hasNewsOrg || hasNewsKeyword;
    };
    
    // 공공기관/문화재단 채널 판별 함수
    const isOfficialChannel = (item) => {
      const title = (item.snippet.title || '').toLowerCase();
      const channelTitle = (item.snippet.channelTitle || '').toLowerCase();
      
      const officialKeywords = [
        '문화재청', '한국관광공사', '문화체육관광부', '국립문화재연구원',
        '국립중앙박물관', '국립국악원', '한국문화재재단', '국가유산진흥원',
        '공식', 'official'
      ];
      
      return officialKeywords.some(keyword => channelTitle.includes(keyword) || title.includes(keyword));
    };
    
    // 4K 여부 판별 함수
    const is4KVideo = (item) => {
      const title = (item.snippet.title || '').toUpperCase();
      const description = (item.snippet.description || '').toUpperCase();
      return /4K|UHD|2160|4096/.test(title + description);
    };
    
    // 1단계: 뉴스 영상 필터링 (제외)
    const filteredVideos = data.items.filter(item => !isNewsVideo(item));
    console.log(`[FetchYoutubeVideos] 🗑️ Filtered out ${data.items.length - filteredVideos.length} news videos`);
    
    if (filteredVideos.length === 0) {
      console.log(`[FetchYoutubeVideos] ⚠️ No videos left after news filtering`);
      return Response.json({
        success: true,
        topVideoUrl: '',
        shortsUrls: [],
        message: 'All videos were news content'
      });
    }
    
    // 2단계: 우선순위 부여 및 정렬
    const videosWithPriority = filteredVideos.map((item, idx) => ({
      item,
      videoId: item.id.videoId,
      title: item.snippet.title || '',
      channelTitle: item.snippet.channelTitle || '',
      isOfficial: isOfficialChannel(item),
      is4K: is4KVideo(item),
      relevanceIndex: idx
    }));
    
    console.log(`[FetchYoutubeVideos] 📊 Before sorting:`);
    videosWithPriority.forEach((v, idx) => {
      console.log(`[FetchYoutubeVideos]   ${idx + 1}. ${v.isOfficial ? '🏛️ 공공' : ''} ${v.is4K ? '✅ 4K' : ''} - ${v.videoId} | ${v.title.substring(0, 50)}`);
    });
    
    // 정렬: 공공기관 최우선 > 4K 우선 > 관련성 순서
    videosWithPriority.sort((a, b) => {
      if (a.isOfficial && !b.isOfficial) return -1;
      if (!a.isOfficial && b.isOfficial) return 1;
      
      if (a.is4K && !b.is4K) return -1;
      if (!a.is4K && b.is4K) return 1;
      
      return a.relevanceIndex - b.relevanceIndex;
    });
    
    console.log(`[FetchYoutubeVideos] 📊 After sorting (Official > 4K > Relevance):`);
    videosWithPriority.forEach((v, idx) => {
      console.log(`[FetchYoutubeVideos]   ${idx + 1}. ${v.isOfficial ? '🏛️ 공공' : ''} ${v.is4K ? '✅ 4K' : ''} - ${v.videoId} | ${v.title.substring(0, 50)}`);
    });
    
    // 3단계: 상위 5개 선택
    const finalVideos = videosWithPriority.slice(0, 5);
    
    // 최상위 영상 (하이라이트)
    const topVideo = finalVideos[0];
    const topVideoUrl = topVideo ? `https://www.youtube.com/watch?v=${topVideo.videoId}` : '';
    
    if (topVideo) {
      console.log(`[FetchYoutubeVideos] ✅ Top video selected:`);
      console.log(`[FetchYoutubeVideos]    ${topVideo.isOfficial ? '🏛️ 공공기관' : ''} ${topVideo.is4K ? '✅ 4K' : '일반'}`);
      console.log(`[FetchYoutubeVideos]    Title: ${topVideo.title}`);
      console.log(`[FetchYoutubeVideos]    Channel: ${topVideo.channelTitle}`);
      console.log(`[FetchYoutubeVideos]    URL: ${topVideoUrl}`);
    }
    
    // Shorts URL (상위 5개)
    const shortsUrls = finalVideos.map(v => `https://www.youtube.com/shorts/${v.videoId}`);
    
    console.log(`[FetchYoutubeVideos] ✓ YouTube search result: topVideo=${topVideoUrl ? '✓' : '✗'}, shorts=${shortsUrls.length}`);
    
    return Response.json({
      success: true,
      topVideoUrl,
      shortsUrls,
      message: `Found ${finalVideos.length} videos`
    });
    
  } catch (error) {
    console.error(`[FetchYoutubeVideos] ❌ Exception:`, error.message);
    return Response.json({ 
      success: false,
      error: error.message,
      topVideoUrl: '',
      shortsUrls: []
    }, { status: 500 });
  }
});