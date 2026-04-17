import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// LLM으로 영상이 해당 축제와 관련있는지 판단 (Y/N/UNKNOWN)
async function checkVideoRelevanceWithLLM(base44, festivalName, videoTitle, channelTitle, videoDescription) {
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `다음 유튜브 영상이 "${festivalName}" 축제와 직접적으로 관련이 있는지 판단해줘.

영상 제목: ${videoTitle}
채널명: ${channelTitle}
영상 설명: ${videoDescription ? videoDescription.slice(0, 500) : '(없음)'}

판단 기준:
1. 이 영상이 해당 축제의 현장 영상인가?
2. 이 영상이 해당 축제를 직접 소개하거나 홍보하는가?
3. 이 영상이 해당 축제와 직접적인 연관이 있는가?

판단이 불가능할 정도로 정보가 부족한 경우(제목이 매우 짧거나, 설명이 없고, 채널명이 축제와 무관한 경우)에는 UNKNOWN으로 응답해.

반드시 아래 JSON 형식으로만 응답해:
{"relevance": "Y" | "N" | "UNKNOWN"}`,
      response_json_schema: {
        type: "object",
        properties: {
          relevance: { type: "string" }
        }
      }
    });
    const val = (result?.relevance || 'UNKNOWN').toUpperCase();
    if (val === 'Y' || val === 'N') return val;
    return 'UNKNOWN';
  } catch (e) {
    console.error(`[FetchYoutubeVideos] LLM check failed:`, e.message);
    return 'UNKNOWN';
  }
}

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
      searchShorts = true,
      llmScoreThreshold = 2  // LLM 관련성 판단 최소 score: 일본 축제 2, 한국 축제 1
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
    
    // 축제 키워드 추가는 호출 측(transformJapantravelRawData 등)에서 처리됨
    
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

    // ========== 핵심 키워드 추출 ==========
    // 축제 이름에서 불용어를 제거하고 핵심 명사 키워드를 추출
    const GENERIC_STOP_WORDS = [
      // 영어 불용어
      'festival', 'fest', 'event', 'show', 'the', 'and', 'or', 'of', 'in', 'at', 'on', 'for',
      'a', 'an', 'to', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'international', 'national', 'annual', 'edition', 'season', 'world', 'grand', 'open',
      // 국가명 (너무 광범위하여 관련성 점수 오염 방지)
      'japan', 'korea', 'china', 'taiwan', 'thailand', 'vietnam', 'singapore', 'indonesia',
      'usa', 'us', 'uk', 'france', 'germany', 'italy', 'spain', 'australia',
      // 한국어 불용어
      '축제', '페스티벌', '페스트', '행사', '이벤트', '국제', '전국', '지역', '대한민국', '한국', '일본', '중국',
      // 일본어 불용어
      'フェスティバル', 'フェス', 'まつり', '祭り', '祭', 'イベント', '日本',
    ];

    const extractCoreKeywords = (name) => {
      // 연도 제거
      const withoutYear = name.replace(/\s*20\d{2}\s*/g, ' ').trim();
      // 특수문자를 공백으로 변환
      const normalized = withoutYear.replace(/[_\/\-\.&]/g, ' ');
      // 단어로 분리
      const words = normalized.split(/\s+/).filter(w => w.length > 1);
      // 불용어 제거
      const keywords = words.filter(word => {
        const lower = word.toLowerCase();
        return !GENERIC_STOP_WORDS.some(stop => stop.toLowerCase() === lower);
      });
      return keywords.map(w => w.toLowerCase());
    };

    // festivalName (원본)과 festivalNameForSearch (연도제거) 모두에서 키워드 추출
    const coreKeywords = [...new Set([
      ...extractCoreKeywords(festivalName),
      ...extractCoreKeywords(festivalNameForSearch)
    ])];

    console.log(`[FetchYoutubeVideos] 🔑 Core keywords extracted: [${coreKeywords.join(', ')}]`);

    // 영상의 관련성 점수 계산 함수 (키워드가 제목/설명/채널명에 몇 개 포함되는지)
    const calcRelevanceScore = (item) => {
      const combined = [
        item.snippet?.title || '',
        item.snippet?.description || '',
        item.snippet?.channelTitle || ''
      ].join(' ').toLowerCase();
      return coreKeywords.filter(kw => combined.includes(kw)).length;
    };

    let highlightVideoUrl = '';
    let highlightVideoChannelName = '';
    let highlightRelevanceRank = 0;
    let highlightScore = 0;
    let highlightMatchedKeywords = [];
    let highlightViews = 0;
    let highlightVideos = []; // 상위 5개 하이라이트 영상 정보
    let highlightLLMRelevances = []; // 상위 5개 하이라이트 LLM 판단 결과
    let shortsUrls = [];
    let shortsViewsTotal = 0;
    let shortsViewsList = []; // 각 숏츠별 개별 조회수
    let shortsRelevanceRanks = []; // 각 숏츠의 원본 API 결과 순위
    let shortsScores = []; // 각 숏츠의 키워드 점수
    let shortsMatchedKeywords = []; // 각 숏츠의 매핑된 키워드
    let shortsLLMRelevances = []; // 각 숏츠의 LLM 판단 결과

    // ========== 하이라이트 영상 검색 ==========
    if (searchHighlightVideo) {
      try {
        console.log(`[FetchYoutubeVideos] 🎬 Searching for highlight video...`);
        
        const usage = await checkAndIncrementApiUsage('youtube_data_api', 95);
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
            
            // 블랙리스트 키워드 판별 (영상 제목에 포함된 경우 제외)
            // 언더스코어, 슬래시 등 구분자를 공백으로 정규화하여 붙어있는 키워드도 감지
            const BLACKLIST_KEYWORDS = [
              // 기존
              'idol', 'dance', '아이돌', '공연', '춤', 'アイドル', 'ダンス', '교차편집', 'stage',
              // 챌린지/밈
              '챌린지', '틱톡', '밈', '유행', 'shorts challenge', '댄스 챌린지', '충격', '레전드', '결말',
              'challenge', 'tiktok', 'meme', 'trend', 'dance challenge', 'shocking', 'legend', 'ending',
              'チャレンジ', 'ティックトック', 'ミーム', '流行',
              // 엔터테인먼트/인물 중심
              '연예인', '직캠', '팬캠', '덕질', '배우', '가수', '스트리머', '유튜버', '인플루언서', 'asmr', '먹방', '하울',
              'celebrity', 'fancam', 'kpop', 'actor', 'singer', 'streamer', 'youtuber', 'influencer', 'mukbang', 'haul',
              '芸能人', 'ファンカム', '俳優', '歌手', 'ユーチューバー', 'インフルエンサー'
            ];
            // 세로영상(Shorts) 판별 키워드 - 하이라이트는 가로영상만 채택
            const VERTICAL_KEYWORDS = ['縦動画', '縦型動画', '縦', 'vertical video', '#shorts', '#short', '세로', '세로영상'];
            const isBlacklistedVideo = (item) => {
              const rawTitle = (item.snippet.title || '').toLowerCase();
              const normalizedTitle = rawTitle.replace(/[_\/\-\.]/g, ' ');
              const isBlacklisted = BLACKLIST_KEYWORDS.some(kw => normalizedTitle.includes(kw.toLowerCase()));
              const isVertical = VERTICAL_KEYWORDS.some(kw => rawTitle.includes(kw.toLowerCase()));
              return isBlacklisted || isVertical;
            };

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
            
            // 1단계: 뉴스 및 블랙리스트 영상 필터링
            const filteredVideos = data.items.filter(item => !isNewsVideo(item) && !isBlacklistedVideo(item));
            const blacklistedCount = data.items.filter(item => isBlacklistedVideo(item)).length;
            if (blacklistedCount > 0) {
              console.log(`[FetchYoutubeVideos] 🚫 Filtered out ${blacklistedCount} blacklisted videos (idol/dance/아이돌/공연/춤)`);
            }
            console.log(`[FetchYoutubeVideos] 🗑️ Filtered out ${data.items.length - filteredVideos.length} news videos`);
            
            if (filteredVideos.length > 0) {
              // 2단계: 임베드 가능 여부 확인 (YouTube videos API 호출)
              const videoIds = filteredVideos.map(item => item.id.videoId).filter(id => id);
              const embeddableVideos = [];
              
              if (videoIds.length > 0) {
                try {
                  // Rate limiting 방지를 위한 지연 (300ms)
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
                  console.log(`[FetchYoutubeVideos] 🔍 Checking embeddable status for ${videoIds.length} videos...`);
                  const videosResponse = await fetch(videosUrl);
                  
                  if (videosResponse.ok) {
                    const videosData = await videosResponse.json();
                    const embeddableMap = {};
                    
                    videosData.items?.forEach(video => {
                      const isEmbeddable = video.status?.embeddable !== false;
                      embeddableMap[video.id] = isEmbeddable;
                      if (!isEmbeddable) {
                        console.log(`[FetchYoutubeVideos] 🚫 Filtered out non-embeddable: ${video.id}`);
                      }
                    });
                    
                    // 임베드 가능한 영상만 필터링
                    filteredVideos.forEach((item, idx) => {
                      if (embeddableMap[item.id.videoId] !== false) {
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
              // 임베드 가능한 영상이 없으면 필터링된 전체 영상을 fallback으로 사용
              if (embeddableVideos.length === 0) {
                console.log(`[FetchYoutubeVideos] ⚠️ No embeddable videos found, falling back to all filtered videos`);
                filteredVideos.forEach((item, idx) => {
                  embeddableVideos.push({ item, originalIndex: idx });
                });
              }
              const videosToUse = embeddableVideos;
              
              if (videosToUse.length === 0) {
                console.log(`[FetchYoutubeVideos] ⚠️ No videos available after filtering`);
              } else {
                const videosWithPriority = videosToUse.map(({ item, originalIndex }) => {
                  const score = calcRelevanceScore(item);
                  const matched = coreKeywords.filter(kw => {
                    const combined = [item.snippet.title, item.snippet.description, item.snippet.channelTitle].join(' ').toLowerCase();
                    return combined.includes(kw);
                  });
                  return {
                    item,
                    videoId: item.id.videoId,
                    title: item.snippet.title || '',
                    channelTitle: item.snippet.channelTitle || '',
                    description: item.snippet.description || '',
                    isOfficial: isOfficialChannel(item),
                    is4K: is4KVideo(item),
                    relevanceIndex: originalIndex,
                    relevanceScore: score,
                    matchedKeywords: matched
                  };
                });

                // 키워드 점수 > 공공기관 우선 > API 관련성 순서로 정렬
                videosWithPriority.sort((a, b) => {
                  if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
                  if (a.isOfficial && !b.isOfficial) return -1;
                  if (!a.isOfficial && b.isOfficial) return 1;
                  return a.relevanceIndex - b.relevanceIndex;
                });

                console.log(`[FetchYoutubeVideos] 📊 Top 5 candidates by relevance score:`);
                videosWithPriority.slice(0, 5).forEach((v, i) => {
                  console.log(`[FetchYoutubeVideos]   #${i+1} score=${v.relevanceScore} rank=${v.relevanceIndex+1} ${v.isOfficial?'🏛️':''} "${v.title}"`);
                });

                // 상위 5개 하이라이트 영상 정보 수집
                const top5Videos = videosWithPriority.slice(0, 5);
                
                // 상위 5개 영상 조회수 일괄 조회
                const top5VideoIds = top5Videos.map(v => v.videoId);
                let top5ViewsMap = {};
                try {
                  await new Promise(resolve => setTimeout(resolve, 300));
                  const viewsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${top5VideoIds.join(',')}&key=${youtubeApiKey}`;
                  const viewsResponse = await fetch(viewsUrl);
                  if (viewsResponse.ok) {
                    const viewsData = await viewsResponse.json();
                    viewsData.items?.forEach(v => {
                      top5ViewsMap[v.id] = parseInt(v.statistics?.viewCount || '0', 10);
                    });
                  }
                } catch (viewsError) {
                  console.error(`[FetchYoutubeVideos] ⚠️ Failed to fetch highlight views:`, viewsError.message);
                }

                highlightVideos = top5Videos.map(v => ({
                  url: `https://www.youtube.com/watch?v=${v.videoId}`,
                  views: top5ViewsMap[v.videoId] || 0,
                  relevanceRank: v.relevanceIndex + 1,
                  score: v.relevanceScore,
                  matchedKeywords: v.matchedKeywords,
                  title: v.title,
                  channelTitle: v.channelTitle,
                  description: v.item?.snippet?.description || ''
                }));

                console.log(`[FetchYoutubeVideos] ✅ Top 5 highlight videos selected:`);
                top5Videos.forEach((v, i) => {
                  console.log(`[FetchYoutubeVideos]   #${i+1} score=${v.relevanceScore} rank=${v.relevanceIndex+1} views=${top5ViewsMap[v.videoId]||0} "${v.title}"`);
                });

                // ========== LLM 검증: score >= llmScoreThreshold인 하이라이트 영상만 ==========
                // 일본 축제: llmScoreThreshold=2, 한국 축제: llmScoreThreshold=1
                console.log(`[FetchYoutubeVideos] 🤖 Running LLM relevance check for highlights with score >= ${llmScoreThreshold}...`);
                highlightLLMRelevances = [];
                for (const hv of highlightVideos) {
                  if (hv.score >= llmScoreThreshold) {
                    const llmResult = await checkVideoRelevanceWithLLM(base44, festivalName, hv.title, hv.channelTitle, hv.description);
                    console.log(`[FetchYoutubeVideos]   LLM highlight: score=${hv.score} → ${llmResult} "${hv.title}"`);
                    highlightLLMRelevances.push(llmResult);
                  } else {
                    highlightLLMRelevances.push('SKIP');
                  }
                }

                // score >= llmScoreThreshold AND LLM = Y인 첫 번째 영상 채택, 없으면 UNKNOWN도 허용
                const adoptedVideo = top5Videos.find((v, i) => v.relevanceScore >= llmScoreThreshold && highlightLLMRelevances[i] === 'Y')
                  || top5Videos.find((v, i) => v.relevanceScore >= llmScoreThreshold && highlightLLMRelevances[i] === 'UNKNOWN')
                  || null;

                if (adoptedVideo) {
                  const adoptedIdx = top5Videos.indexOf(adoptedVideo);
                  highlightVideoUrl = `https://www.youtube.com/watch?v=${adoptedVideo.videoId}`;
                  highlightVideoChannelName = adoptedVideo.channelTitle || '';
                  highlightRelevanceRank = adoptedVideo.relevanceIndex + 1;
                  highlightScore = adoptedVideo.relevanceScore;
                  highlightMatchedKeywords = adoptedVideo.matchedKeywords;
                  highlightViews = top5ViewsMap[adoptedVideo.videoId] || 0;
                  console.log(`[FetchYoutubeVideos] ✅ Highlight adopted: score=${adoptedVideo.relevanceScore} LLM=${highlightLLMRelevances[adoptedIdx]} "${adoptedVideo.title}"`);
                } else {
                    highlightVideoUrl = '';
                    console.log(`[FetchYoutubeVideos] ⚠️ No highlight video passed LLM check (all N or score<${llmScoreThreshold}). Setting highlight to empty.`);
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
        
        const usage = await checkAndIncrementApiUsage('youtube_data_api', 95);
        if (!usage.allowed) {
          throw new Error(`YOUTUBE_API_LIMIT_REACHED: ${usage.count}/${usage.limit} 쿼리 소진`);
        }
        
        // Rate limiting 방지를 위한 지연 (300ms)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Shorts 검색: 일반 영상과 동일한 보정된 쿼리 사용 + #Shorts 태그 추가
        // festivalName은 이미 buildEnglishYoutubeQuery/buildJapaneseYoutubeQuery를 거친 보정된 쿼리
        const shortsQuery = `${festivalName} #Shorts`;
        const shortsSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(shortsQuery)}&type=video&videoDuration=short&order=relevance&maxResults=20&key=${youtubeApiKey}`;
        const shortsResponse = await fetch(shortsSearchUrl);
        
        if (shortsResponse.ok) {
          const shortsData = await shortsResponse.json();
          if (shortsData.items && shortsData.items.length > 0) {
            // 하이라이트 영상 videoId 추출 (숏츠 중복 방지용)
            const highlightVideoId = highlightVideoUrl ? highlightVideoUrl.split('v=')[1]?.split('&')[0] : null;

            // Shorts 블랙리스트 (VERTICAL_KEYWORDS 제외)
            const SHORTS_BLACKLIST = [
              'idol', 'dance', '아이돌', '공연', '춤', 'アイドル', 'ダンス', '교차편집', 'stage',
              '챌린지', '틱톡', '밈', '유행', 'shorts challenge', '댄스 챌린지', '충격', '레전드', '결말',
              'challenge', 'tiktok', 'meme', 'trend', 'dance challenge', 'shocking', 'legend', 'ending',
              'チャレンジ', 'ティックトック', 'ミーム', '流行',
              '연예인', '직캠', '팬캠', '덕질', '배우', '가수', '스트리머', '유튜버', '인플루언서', 'asmr', '먹방', '하울',
              'celebrity', 'fancam', 'kpop', 'actor', 'singer', 'streamer', 'youtuber', 'influencer', 'mukbang', 'haul',
              '芸能人', 'ファンカム', '俳優', '歌手', 'ユーチューバー', 'インフルエンサー'
            ];
            const isBlacklistedShorts = (item) => {
              const normalizedTitle = (item.snippet?.title || '').toLowerCase().replace(/[_\/\-\.]/g, ' ');
              return SHORTS_BLACKLIST.some(kw => normalizedTitle.includes(kw.toLowerCase()));
            };

            // 뉴스 영상 판별 (Shorts용)
            const isShortsNewsVideo = (item) => {
              const title = (item.snippet?.title || '').toLowerCase();
              const channelTitle = (item.snippet?.channelTitle || '').toLowerCase();
              const newsOrgs = ['kbs', 'mbc', 'sbs', 'ytn', 'jtbc', '연합뉴스', 'channel a', 'tv조선', 'mbn'];
              const newsKeywords = ['뉴스', '속보', '보도', '현장', '긴급', '취재', '기자회견', '방송', 'news', 'breaking', 'report', 'live coverage'];
              return newsOrgs.some(org => channelTitle.includes(org) || title.includes(org)) ||
                     newsKeywords.some(kw => title.includes(kw) || channelTitle.includes(kw));
            };

            // API 결과 순서 그대로 숏츠 메타 정보 수집 + 키워드 점수 계산
            const relevantShortsMeta = [];
            let shortsBlacklistedCount = 0;
            shortsData.items.forEach((item, idx) => {
              if (!item.id?.videoId || item.id.videoId === highlightVideoId) return;
              if (isBlacklistedShorts(item) || isShortsNewsVideo(item)) {
                shortsBlacklistedCount++;
                return;
              }
              const score = calcRelevanceScore(item);
              const matchedKeywords = coreKeywords.filter(kw => {
                const combined = [
                  item.snippet?.title || '',
                  item.snippet?.description || '',
                  item.snippet?.channelTitle || ''
                ].join(' ').toLowerCase();
                return combined.includes(kw);
              });
              relevantShortsMeta.push({ videoId: item.id.videoId, relevanceRank: idx + 1, score, matchedKeywords, snippet: item.snippet });
            });
            const relevantShortsItems = relevantShortsMeta;
            if (shortsBlacklistedCount > 0) {
              console.log(`[FetchYoutubeVideos] 🚫 Filtered out ${shortsBlacklistedCount} blacklisted/news shorts`);
            }
            console.log(`[FetchYoutubeVideos] ✅ Shorts collected: ${relevantShortsItems.length}/${shortsData.items.length}`);

            const shortsVideoIds = relevantShortsItems.map(item => item.videoId);
            
            // Shorts도 임베드 가능 여부 확인
            if (shortsVideoIds.length > 0) {
              try {
                // Rate limiting 방지를 위한 지연 (300ms)
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=status,statistics&id=${shortsVideoIds.join(',')}&key=${youtubeApiKey}`;
                console.log(`[FetchYoutubeVideos] 🔍 Checking embeddable status for ${shortsVideoIds.length} shorts...`);
                const videosResponse = await fetch(videosUrl);
                
                if (videosResponse.ok) {
                  const videosData = await videosResponse.json();
                  const embeddableItems = videosData.items?.filter(video => video.status?.embeddable !== false) || [];
                  
                  // 조회수 맵 + 상위 5개만 선택 후 합산
                  const shortsViewsMap = {};
                  embeddableItems.forEach(video => {
                    const views = parseInt(video.statistics?.viewCount || '0', 10);
                    shortsViewsMap[`https://www.youtube.com/shorts/${video.id}`] = views;
                  });
                  
                  // 임베드 가능한 숏츠를 최대 20개로 수집 (저장용)
                  const embeddableShorts = embeddableItems
                    .map(video => `https://www.youtube.com/shorts/${video.id}`)
                    .slice(0, 20);
                  
                  // relevantShortsMeta를 videoId → meta 맵으로 변환
                  const shortsMetaMap = {};
                  relevantShortsMeta.forEach(m => { shortsMetaMap[m.videoId] = m; });

                  // 임베드 가능한 쇼츠가 없으면 원본 URL 그대로 사용 (최대 20개)
                  const buildShortsData = (urls, viewsMap) => {
                    return {
                      urls,
                      viewsList: urls.map(url => viewsMap[url] || 0),
                      ranks: urls.map(url => { const id = url.split('/').pop(); return shortsMetaMap[id]?.relevanceRank || 0; }),
                      scores: urls.map(url => { const id = url.split('/').pop(); return shortsMetaMap[id]?.score || 0; }),
                      keywords: urls.map(url => { const id = url.split('/').pop(); return shortsMetaMap[id]?.matchedKeywords || []; }),
                      snippets: urls.map(url => { const id = url.split('/').pop(); return shortsMetaMap[id]?.snippet || {}; })
                    };
                  };

                  let finalViewsMap = shortsViewsMap;
                  if (embeddableShorts && embeddableShorts.length > 0) {
                    shortsUrls = embeddableShorts;
                  } else {
                    shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 20);
                    finalViewsMap = {};
                    (videosData.items || []).forEach(video => {
                      finalViewsMap[`https://www.youtube.com/shorts/${video.id}`] = parseInt(video.statistics?.viewCount || '0', 10);
                    });
                  }

                  const sd = buildShortsData(shortsUrls, finalViewsMap);
                  shortsViewsList = sd.viewsList;
                  shortsRelevanceRanks = sd.ranks;
                  shortsScores = sd.scores;
                  shortsMatchedKeywords = sd.keywords;

                  // ========== LLM 검증: score >= llmScoreThreshold인 숏츠만 ==========
                  // 일본 축제: llmScoreThreshold=2, 한국 축제: llmScoreThreshold=1
                  console.log(`[FetchYoutubeVideos] 🤖 Running LLM relevance check for shorts with score >= ${llmScoreThreshold}...`);
                  shortsLLMRelevances = [];
                  for (let si = 0; si < shortsUrls.length; si++) {
                    const sScore = shortsScores[si] || 0;
                    if (sScore >= llmScoreThreshold) {
                      const sId = shortsUrls[si].split('/').pop();
                      const sMeta = shortsMetaMap[sId];
                      const sSnippet = sMeta?.snippet || {};
                      const llmResult = await checkVideoRelevanceWithLLM(
                        base44, festivalName,
                        sSnippet.title || sId,
                        sSnippet.channelTitle || '',
                        sSnippet.description || ''
                      );
                      console.log(`[FetchYoutubeVideos]   LLM shorts #${si+1}: score=${sScore} → ${llmResult} "${sSnippet.title || sId}"`);
                      shortsLLMRelevances.push(llmResult);
                    } else {
                      shortsLLMRelevances.push('SKIP');
                    }
                  }

                  // 상위 5개 중 score >= llmScoreThreshold AND LLM != N인 숏츠 조회수만 합산
                  const top5Shorts = shortsUrls.slice(0, 5);
                  shortsViewsTotal = top5Shorts.reduce((sum, url, idx) => {
                    const id = url.split('/').pop();
                    const score = shortsMetaMap[id]?.score || 0;
                    const views = finalViewsMap[url] || 0;
                    const llm = shortsLLMRelevances[idx] || 'SKIP';
                    return sum + (score >= llmScoreThreshold && llm !== 'N' ? views : 0);
                  }, 0);
                  console.log(`[FetchYoutubeVideos] ✓ Found ${shortsUrls.length} shorts, top5 score>=${llmScoreThreshold} LLM!=N views total: ${shortsViewsTotal}`);
                } else {
                  // 임베드 체크 실패 시 그냥 사용
                  shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 20);
                  shortsViewsList = shortsUrls.map(() => 0);
                  console.log(`[FetchYoutubeVideos] ⚠️ Could not check embeddable status, using all shorts: ${shortsUrls.length}`);
                }
              } catch (embedError) {
                shortsUrls = shortsVideoIds.map(id => `https://www.youtube.com/shorts/${id}`).slice(0, 20);
                shortsViewsList = shortsUrls.map(() => 0);
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
      highlightRelevanceRank,
      highlightScore,
      highlightMatchedKeywords,
      highlightViews,
      highlightVideos,
      coreKeywords,
      shortsUrls,
      shortsViewsTotal,
      shortsViewsList,
      shortsRelevanceRanks: shortsRelevanceRanks,
      shortsScores: shortsScores,
      shortsMatchedKeywords: shortsMatchedKeywords,
      shortsLLMRelevances: shortsLLMRelevances,
      highlightLLMRelevances: highlightLLMRelevances,
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