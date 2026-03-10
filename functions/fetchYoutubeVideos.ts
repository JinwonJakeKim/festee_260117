import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 관리자 인증 (백엔드 함수간 호출이므로 asServiceRole로 변경 가능)
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { 
      festivalName,
      searchHighlightVideo = true,
      searchShorts = true 
    } = await req.json();
    
    if (!festivalName) {
      return Response.json({ 
        success: false,
        error: 'festivalName is required' 
      }, { status: 400 });
    }

    // 축제 이름에서 연도 제거 (YouTube 검색 시 더 많은 결과를 얻기 위함)
    // 예: "Shizukuishi Winter Festa 2026" -> "Shizukuishi Winter Festa"
    let festivalNameForSearch = festivalName.replace(/\s*20\d{2}\s*/g, ' ').trim();
    
    // 축제 관련 키워드가 없으면 '축제' 추가
    const festivalKeywords = ['축제', 'festival', 'festa', 'fest', '페스티벌', 'fes', 'carnival', '카니발', 'fair', '페어'];
    const hasFestivalKeyword = festivalKeywords.some(keyword => festivalNameForSearch.toLowerCase().includes(keyword.toLowerCase()));
    if (!hasFestivalKeyword) {
      festivalNameForSearch = `${festivalNameForSearch} 축제`;
      console.log(`[FetchYoutubeVideos] Added '축제' keyword: "${festivalNameForSearch}"`);
    }
    
    console.log(`[FetchYoutubeVideos] Starting search for: "${festivalName}"`);
    if (festivalNameForSearch !== festivalName) {
      console.log(`[FetchYoutubeVideos] Year removed for search: "${festivalNameForSearch}"`);
    }
    console.log(`[FetchYoutubeVideos] Options: highlightVideo=${searchHighlightVideo}, shorts=${searchShorts}`);

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!youtubeApiKey) {
      console.log(`[FetchYoutubeVideos] ⚠️ YOUTUBE_API_KEY is missing or empty`);
      return Response.json({
        success: true,
        highlightVideoUrl: '',
        shortsUrls: [],
        message: 'YouTube API key not configured'
      });
    }

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

    let highlightVideoUrl = '';
    let highlightVideoChannelName = '';
    let shortsUrls = [];
    let shortsViewsTotal = 0;

    // ========== 하이라이트 영상 검색 ==========
    if (searchHighlightVideo) {
      try {
        console.log(`[FetchYoutubeVideos] 🎬 Searching for highlight video...`);
        
        const usage = await checkAndIncrementApiUsage('youtube_data_api', 90);
        if (!usage.allowed) {
          throw new Error(`YOUTUBE_API_LIMIT_REACHED: ${usage.count}/${usage.limit} 쿼리 소진`);
        }
        
        const searchParams = new URLSearchParams({
          part: 'id,snippet',
          q: festivalNameForSearch,
          type: 'video',
          order: 'relevance',
          maxResults: '20',
          key: youtubeApiKey
        });
        
        // Rate limiting 방지를 위한 지연 (300ms)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;
        console.log(`[FetchYoutubeVideos] 📡 Calling YouTube API for highlights...`);
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[FetchYoutubeVideos] ❌ YouTube API error (${response.status}):`, errorText);
        } else {
          const data = await response.json();
          
          if (data.items && data.items.length > 0) {
            console.log(`[FetchYoutubeVideos] 📋 Raw API response - ${data.items.length} videos returned`);
            
            // 뉴스 영상 판별
            const isNewsVideo = (item) => {
              const title = (item.snippet.title || '').toLowerCase();
              const channelTitle = (item.snippet.channelTitle || '').toLowerCase();
              
              const newsOrgs = ['kbs', 'mbc', 'sbs', 'ytn', 'jtbc', '연합뉴스', 'channel a', 'tv조선', 'mbn'];
              const newsKeywords = ['뉴스', '속보', '보도', '현장', '긴급', '취재', '기자회견', '방송', 'news', 'breaking', 'report', 'live coverage'];
              
              const hasNewsOrg = newsOrgs.some(org => channelTitle.includes(org) || title.includes(org));
              const hasNewsKeyword = newsKeywords.some(keyword => title.includes(keyword) || channelTitle.includes(keyword));
              
              return hasNewsOrg || hasNewsKeyword;
            };
            
            // 공공기관/문화재단 채널 판별
            const isOfficialChannel = (item) => {
              const title = (item.snippet.title || '').toLowerCase();
              const channelTitle = (item.snippet.channelTitle || '').toLowerCase();
              
              const officialKeywords = [
                '문화재청', '한국관광공사', '문화체육관광부', '국립문화재연구원',
                '국립중앙박물관', '국립국악원', '한국문화재재단', '국가유산진흥원',
                '공식', 'official', 'seoul_4k', 'seoul'
              ];
              
              return officialKeywords.some(keyword => channelTitle.includes(keyword) || title.includes(keyword));
            };
            
            // 4K 여부 판별
            const is4KVideo = (item) => {
              const title = (item.snippet.title || '').toUpperCase();
              const description = (item.snippet.description || '').toUpperCase();
              return /4K|UHD|2160|4096/.test(title + description);
            };
            
            // 1단계: 뉴스 영상 필터링
            const filteredVideos = data.items.filter(item => !isNewsVideo(item));
            console.log(`[FetchYoutubeVideos] 🗑️ Filtered out ${data.items.length - filteredVideos.length} news videos`);
            
            if (filteredVideos.length > 0) {
              // 2단계: 임베드 가능 여부 확인 (YouTube videos API 호출)
              const videoIds = filteredVideos.map(item => item.id.videoId).filter(id => id);
              const embeddableVideos = [];
              
              if (videoIds.length > 0) {
                try {
                  // Rate limiting 방지를 위한 지연 (300ms)
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
                  console.log(`[FetchYoutubeVideos] 🔍 Checking embeddable status for ${videoIds.length} videos...`);
                  const videosResponse = await fetch(videosUrl);
                  
                  if (videosResponse.ok) {
                    const videosData = await videosResponse.json();
                    const embeddableMap = {};
                    
                    videosData.items?.forEach(video => {
                      const isEmbeddable = video.contentDetails?.embeddable === true;
                      embeddableMap[video.id] = isEmbeddable;
                      if (!isEmbeddable) {
                        console.log(`[FetchYoutubeVideos] 🚫 Filtered out non-embeddable: ${video.id}`);
                      }
                    });
                    
                    // 임베드 가능한 영상만 필터링
                    filteredVideos.forEach((item, idx) => {
                      if (embeddableMap[item.id.videoId] === true) {
                        embeddableVideos.push({ item, originalIndex: idx });
                      }
                    });
                    
                    console.log(`[FetchYoutubeVideos] ✅ Embeddable videos: ${embeddableVideos.length}/${filteredVideos.length}`);
                  } else {
                    console.error(`[FetchYoutubeVideos] ⚠️ Failed to check embeddable status, using all filtered videos`);
                    filteredVideos.forEach((item, idx) => {
                      embeddableVideos.push({ item, originalIndex: idx });
                    });
                  }
                } catch (embedError) {
                  console.error(`[FetchYoutubeVideos] ⚠️ Embed check error:`, embedError.message);
                  filteredVideos.forEach((item, idx) => {
                    embeddableVideos.push({ item, originalIndex: idx });
                  });
                }
              }
              
              // 3단계: 우선순위 부여 및 정렬
              // 임베드 가능한 영상이 없으면 채택하지 않음
              if (embeddableVideos.length === 0) {
                console.log(`[FetchYoutubeVideos] ⚠️ No embeddable videos found, skipping highlight video`);
              }
              const videosToUse = embeddableVideos;
              
              if (videosToUse.length === 0) {
                console.log(`[FetchYoutubeVideos] ⚠️ No videos available after filtering`);
              } else {
                const videosWithPriority = videosToUse.map(({ item, originalIndex }) => ({
                  item,
                  videoId: item.id.videoId,
                  title: item.snippet.title || '',
                  channelTitle: item.snippet.channelTitle || '',
                  isOfficial: isOfficialChannel(item),
                  is4K: is4KVideo(item),
                  relevanceIndex: originalIndex
                }));
                
                // 정렬: 공공기관 최우선 > 관련성 순서 > 4K (최후순위)
                videosWithPriority.sort((a, b) => {
                  if (a.isOfficial && !b.isOfficial) return -1;
                  if (!a.isOfficial && b.isOfficial) return 1;
                  if (a.relevanceIndex !== b.relevanceIndex) return a.relevanceIndex - b.relevanceIndex;
                  if (a.is4K && !b.is4K) return -1;
                  if (!a.is4K && b.is4K) return 1;
                  return 0;
                });
                
                const topVideo = videosWithPriority[0];
                if (topVideo) {
                  highlightVideoUrl = `https://www.youtube.com/watch?v=${topVideo.videoId}`;
                  highlightVideoChannelName = topVideo.channelTitle || '';
                  const embeddableStatus = embeddableVideos.length > 0 ? '✅ 임베드 가능' : '⚠️ 임베드 불가 (YouTube 링크)';
                  console.log(`[FetchYoutubeVideos] ✅ Top video selected (${embeddableStatus}):`);
                  console.log(`[FetchYoutubeVideos]    ${topVideo.isOfficial ? '🏛️ 공공기관' : '일반'} ${topVideo.is4K ? '(4K)' : ''}`);
                  console.log(`[FetchYoutubeVideos]    Relevance: #${topVideo.relevanceIndex + 1}`);
                  console.log(`[FetchYoutubeVideos]    Title: ${topVideo.title}`);
                  console.log(`[FetchYoutubeVideos]    Channel: ${highlightVideoChannelName}`);
                  console.log(`[FetchYoutubeVideos]    URL: ${highlightVideoUrl}`);
                }
              }
            } else {
              console.log(`[FetchYoutubeVideos] ⚠️ No videos left after news filtering`);
            }
          } else {
            console.log(`[FetchYoutubeVideos] ⚠️ No videos found for: ${festivalName}`);
          }
        }
      } catch (error) {
        console.error(`[FetchYoutubeVideos] ❌ Highlight video search exception:`, error.message);
        if (error.message.includes('YOUTUBE_API_LIMIT_REACHED')) {
          throw error;
        }
      }
    }

    // ========== YouTube Shorts 검색 ==========
    if (searchShorts) {
      try {
        console.log(`[FetchYoutubeVideos] 🎬 Searching for YouTube Shorts...`);
        
        const usage = await checkAndIncrementApiUsage('youtube_data_api', 90);
        if (!usage.allowed) {
          throw new Error(`YOUTUBE_API_LIMIT_REACHED: ${usage.count}/${usage.limit} 쿼리 소진`);
        }
        
        // Rate limiting 방지를 위한 지연 (300ms)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const shortsQuery = festivalNameForSearch;
        const shortsSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(shortsQuery)}&type=video&videoDuration=short&maxResults=20&key=${youtubeApiKey}`;
        const shortsResponse = await fetch(shortsSearchUrl);
        
        if (shortsResponse.ok) {
          const shortsData = await shortsResponse.json();
          if (shortsData.items && shortsData.items.length > 0) {
            const shortsVideoIds = shortsData.items
              .filter(item => item.id?.videoId)
              .map(item => item.id.videoId);
            
            // Shorts도 임베드 가능 여부 확인
            if (shortsVideoIds.length > 0) {
              try {
                // Rate limiting 방지를 위한 지연 (300ms)
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${shortsVideoIds.join(',')}&key=${youtubeApiKey}`;
                console.log(`[FetchYoutubeVideos] 🔍 Checking embeddable status for ${shortsVideoIds.length} shorts...`);
                const videosResponse = await fetch(videosUrl);
                
                if (videosResponse.ok) {
                  const videosData = await videosResponse.json();
                  const embeddableItems = videosData.items?.filter(video => video.contentDetails?.embeddable === true) || [];
                  
                  // 조회수 합산
                  shortsViewsTotal = embeddableItems.reduce((sum, video) => {
                    return sum + parseInt(video.statistics?.viewCount || '0', 10);
                  }, 0);
                  
                  const embeddableShorts = embeddableItems
                    .map(video => `https://www.youtube.com/shorts/${video.id}`)
                    .slice(0, 5);
                  
                  // 임베드 가능한 쇼츠가 없으면 원본 URL 그대로 사용 (최대 5개)
                  if (embeddableShorts && embeddableShorts.length > 0) {
                    shortsUrls = embeddableShorts;
                    console.log(`[FetchYoutubeVideos] ✓ Found ${shortsUrls.length} embeddable YouTube Shorts, total views: ${shortsViewsTotal}`);
                  } else {
                    shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 5);
                    // 조회수 없는 경우도 합산 시도
                    shortsViewsTotal = (videosData.items || []).reduce((sum, video) => sum + parseInt(video.statistics?.viewCount || '0', 10), 0);
                    console.log(`[FetchYoutubeVideos] ⚠️ No embeddable shorts, using all shorts as links: ${shortsUrls.length}`);
                  }
                } else {
                  // 임베드 체크 실패 시 그냥 사용
                  shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 5);
                  console.log(`[FetchYoutubeVideos] ⚠️ Could not check embeddable status, using all shorts: ${shortsUrls.length}`);
                }
              } catch (embedError) {
                shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 5);
                console.log(`[FetchYoutubeVideos] ⚠️ Embed check failed, using all shorts: ${shortsUrls.length}`);
              }
            }
          } else {
            console.log(`[FetchYoutubeVideos] ⚠️ No shorts found for: ${festivalName}`);
          }
        } else {
          const errorText = await shortsResponse.text();
          console.error(`[FetchYoutubeVideos] ❌ YouTube Shorts API error (${shortsResponse.status}):`, errorText);
        }
      } catch (error) {
        console.error(`[FetchYoutubeVideos] ❌ Shorts search exception:`, error.message);
        if (error.message.includes('YOUTUBE_API_LIMIT_REACHED')) {
          throw error;
        }
      }
    }

    console.log(`[FetchYoutubeVideos] ✅ Search completed:`);
    console.log(`[FetchYoutubeVideos]    Highlight video: ${highlightVideoUrl || '(not found)'}`);
    console.log(`[FetchYoutubeVideos]    Shorts: ${shortsUrls.length} videos`);

    return Response.json({
      success: true,
      highlightVideoUrl,
      highlightVideoChannelName,
      shortsUrls,
      shortsViewsTotal,
      message: `YouTube 검색 완료: 하이라이트 ${highlightVideoUrl ? '✓' : '✗'}, 쇼츠 ${shortsUrls.length}개, 조회수합산 ${shortsViewsTotal}`
    });

  } catch (error) {
    console.error('[FetchYoutubeVideos] Error:', error);
    
    if (error.message && error.message.includes('YOUTUBE_API_LIMIT_REACHED')) {
      return Response.json({ 
        success: false,
        error: 'API_LIMIT_REACHED',
        message: 'YouTube Data API 하루 100회 무료 쿼리를 소진하였습니다.'
      }, { status: 429 });
    }
    
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});