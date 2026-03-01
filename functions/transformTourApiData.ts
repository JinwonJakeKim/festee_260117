import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        success: false,
        error: 'Unauthorized - Admin only' 
      }, { status: 401 });
    }

    const { rawDataIds, retransform = false } = await req.json();
    
    if (!rawDataIds || rawDataIds.length === 0) {
      return Response.json({
        success: false,
        error: 'No data to transform',
        message: '변환할 원본 데이터가 없습니다.'
      }, { status: 400 });
    }
    
    console.log(`[Transform] ========== START TRANSFORMATION ==========`);
    console.log(`[Transform] Mode: ${retransform ? 'RETRANSFORM (재변환)' : 'NEW (신규 변환)'}`);
    console.log(`[Transform] Processing ${rawDataIds.length} raw data records`);
    
    const apiKey = Deno.env.get("TOUR_API_KEY");
    const baseUrl = "https://apis.data.go.kr/B551011/KorService2";
    
    const festivals = [];
    const errors = [];
    
    // ========== 유틸리티 함수들 ==========
    
    const cleanHtml = (text) => {
      if (!text) return '';
      return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
    };
    
    const cleanHomepage = (homepage) => {
      if (!homepage) return '';
      return homepage.replace(/<[^>]*>/g, '').trim();
    };
    
    // 웹사이트 URL 파싱 및 검증
    const parseWebsiteUrls = (homepage) => {
      if (!homepage) return '';
      
      // HTML 태그 제거
      let cleaned = homepage.replace(/<[^>]*>/g, '').trim();
      
      if (!cleaned) return '';

      // 완전한 URL (http 또는 https로 시작) 패턴 찾기
      const fullUrlPattern = /(https?:\/\/[^\s\)]+)/gi;
      const fullUrlMatches = cleaned.match(fullUrlPattern);

      if (fullUrlMatches && fullUrlMatches.length > 0) {
        // 여러 개의 완전한 URL이 있는 경우 첫 번째만 반환
        console.log(`[Transform] 📎 Found ${fullUrlMatches.length} full URLs, using first one: ${fullUrlMatches[0]}`);
        return fullUrlMatches[0].trim();
      }
      
      // http/https가 없지만 www. 또는 도메인 형식으로 시작하는 경우
      const domainPattern = /^(www\.|[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?$/i;
      if (domainPattern.test(cleaned)) {
        console.log(`[Transform] 🌐 Appending https:// to: ${cleaned}`);
        return `https://${cleaned}`;
      }
      
      // 그 외의 경우 (유효한 URL이 아니라고 판단)
      console.log(`[Transform] 🚫 Invalid URL format, returning empty: ${cleaned}`);
      return '';
    };
    
    // 중복 문장 제거
    const removeDuplicates = (text) => {
      if (!text) return '';
      
      const sentences = text.split(/(?<=[.!?])\s+/);
      const seen = new Set();
      const result = [];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed || trimmed.length < 5) {
          result.push(trimmed);
          continue;
        }
        
        const normalized = trimmed
          .replace(/[\s,.!?;:()[\]{}'"]/g, '')
          .toLowerCase();
        
        if (normalized.length < 15) {
          result.push(trimmed);
          continue;
        }
        
        let isDuplicate = false;
        for (const existing of seen) {
          const similarity = normalized.length / existing.length;
          
          if (normalized === existing) {
            isDuplicate = true;
            console.log(`[Transform] 🗑️ Exact duplicate: ${trimmed.substring(0, 40)}...`);
            break;
          }
          
          if (similarity > 0.95 && (normalized.includes(existing) || existing.includes(normalized))) {
            isDuplicate = true;
            console.log(`[Transform] 🗑️ Similar duplicate: ${trimmed.substring(0, 40)}...`);
            break;
          }
        }
        
        if (!isDuplicate) {
          seen.add(normalized);
          result.push(trimmed);
        }
      }
      
      return result.join(' ');
    };
    
    // 텍스트 포맷팅 - 개선된 버전 (조사 보호 + 의미 단위 강조)
    const formatText = (text) => {
      if (!text) return '';
      
      console.log(`[FormatText] 📝 Input length: ${text.length} chars`);
      
      // 1. 모든 개행을 공백으로 변환 (초기화)
      text = text.replace(/\n+/g, ' ');
      
      // 2. 연속 공백 제거
      text = text.replace(/\s{2,}/g, ' ');
      
      // 3. 특수 키워드(섹션 제목) 앞뒤로 명확하게 개행 추가
      // ✅ 개선: ': ' 다음에는 줄바꿈하지 않고 공백만 (예: "행사내용: 내용...")
      const specialKeywords = [
        '행사내용:', '행사 내용:', '부대행사:', '부대 행사:',
        '프로그램:', '주요 프로그램:', '주요프로그램:',
        '주요내용:', '주요 내용:', '공연시간:', '운영시간:',
        '참가대상:', '참여대상:', '행사장소:', '행사 장소:',
        '행사일정:', '일정:', '시간:', '장소:'
      ];
      
      specialKeywords.forEach(keyword => {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\s*(${escapedKeyword})\\s*`, 'gi');
        // ': ' 다음에는 공백만 추가 (줄바꿈 제거)
        text = text.replace(regex, '\n\n$1 ');
      });
      
      // 4. 한국어 문장 끝 감지 및 개행 추가
      // "습니다.", "요.", "다." 등으로 끝나는 문장 뒤에 개행
      text = text.replace(/(다\.|요\.|니다\.|습니다\.|요!\s|다!\s|까\?)\s+([가-힣A-Z0-9])/g, '$1\n\n$2');
      
      // 5. 마침표, 느낌표, 물음표 뒤에 대문자나 한글이 오면 개행
      // ⚠️ 단, 숫자 리스트의 마침표는 제외 (예: "1. 메인프로그램")
      text = text.replace(/([^0-9][.!?])\s+([가-힣A-Z])/g, '$1\n\n$2');
      
      // 6. 숫자 리스트 앞에만 개행 추가 (숫자 뒤에는 개행 없음!)
      // ✅ 예: "\n\n1. 메인프로그램: 내용..." (1. 다음에 줄바꿈 없음)
      text = text.replace(/([^\d\n])(\d+\.\s+)/g, '$1\n\n$2');
      
      // 7. 불렛 포인트 앞에 개행 추가
      text = text.replace(/\s+(○|-|\*|•)\s+/g, '\n$1 ');
      
      // 8. 섹션 제목 (대괄호 등) 앞뒤 개행
      text = text.replace(/\s*(\[.+?\]|【.+?】)\s*/g, '\n\n$1\n\n');
      
      // 9. 날짜 형식 앞에 개행 - 조사 보호 (개선된 버전)
      // "10월 17일부터", "12월 25일까지", "5월 1일에" 등은 줄바꿈하지 않음
      // 조사 목록: 부터, 까지, 에, 에는, 에서, 으로, 으로도, 과, 와, 를, 을, 이, 가, 의, 도
      const postpositions = '부터|까지|에|에는|에서|으로|으로도|으로부터|과|와|를|을|이|가|의|도|만';
      const datePattern = new RegExp(
        `\\s+(\\d{4}년|\\d{1,2}월\\s*\\d{1,2}일)(?!\\s*(${postpositions}))`,
        'g'
      );
      text = text.replace(datePattern, '\n\n$1');
      
      // 10. 과도한 개행 정리 (3개 이상 → 2개로)
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // 11. 각 줄 trim 및 빈 줄 제거
      const lines = text.split('\n');
      const trimmedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
      text = trimmedLines.join('\n');
      
      const outputText = text.trim();
      console.log(`[FormatText] ✓ Output length: ${outputText.length} chars`);
      console.log(`[FormatText] ✓ Line breaks count: ${(outputText.match(/\n/g) || []).length}`);
      
      return outputText;
    };
    
    // ========== 개선된 일정 추출 함수 ==========
    const extractSchedule = (programText, festivalStartDate, festivalEndDate) => {
      if (!programText) {
        console.log(`[Schedule] No program text provided`);
        return [];
      }
      
      console.log(`[Schedule] ========== 일정 추출 시작 ==========`);
      console.log(`[Schedule] 입력 텍스트 길이: ${programText.length} chars`);
      console.log(`[Schedule] 축제 기간: ${festivalStartDate} ~ ${festivalEndDate}`);
      
      const schedule = [];
      const lines = programText.split('\n');
      
      // 제외할 키워드 (운영시간, 관람시간 등)
      const excludeKeywords = [
        '운영시간', '관람시간', '개장시간', '이용시간', '영업시간',
        '입장시간', '오픈시간', '개관시간', '개방시간',
        '평일', '주말', '공휴일', '매일'
      ];
      
      // 날짜 패턴 매칭
      const datePatterns = [
        // "10월 31일", "10/31", "10.31"
        /(\d{1,2})[월\/\.](\d{1,2})일?/,
        // "첫째날", "둘째날", "마지막날"
        /(첫째|둘째|셋째|넷째|다섯째|여섯째|마지막)날/,
        // "Day 1", "DAY1"
        /Day\s*(\d+)/i,
        // "1일차", "2일차"
        /(\d+)일차/
      ];
      
      // 시간 패턴 매칭
      const timePatterns = [
        // "10:00~12:00", "14:00 - 16:00"
        /(\d{1,2}:\d{2})\s*[~\-]\s*(\d{1,2}:\d{2})/,
        // "오전 10시", "오후 3시"
        /(오전|오후)\s*(\d{1,2})시/,
        // "14:00"
        /(\d{1,2}:\d{2})/
      ];
      
      let currentDate = null;
      let dateIndex = 1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.length < 3) continue;
        
        // 제외 키워드가 포함된 라인은 스킵
        if (excludeKeywords.some(keyword => line.includes(keyword))) {
          console.log(`[Schedule] ⏭️ 제외: "${line.substring(0, 50)}..." (운영시간 관련)`);
          continue;
        }
        
        // 날짜 패턴 체크
        let foundDate = false;
        for (const pattern of datePatterns) {
          const dateMatch = line.match(pattern);
          if (dateMatch) {
            if (dateMatch[1] && dateMatch[2]) {
              // "10월 31일" 형식
              currentDate = `${dateMatch[1]}월 ${dateMatch[2]}일`;
            } else if (dateMatch[1]) {
              // "첫째날", "Day 1" 형식
              currentDate = `${dateMatch[1]}일차`; // Changed to use the matched day string directly
              // If it's a "Day X" or "X일차" style, we should probably reset dateIndex or handle it differently
              // For "첫째날", "둘째날" type, if we want to convert to actual dates relative to festival start, it's more complex.
              // For now, retaining original logic for `dateIndex` for "Day X" or "X일차" if that's the intention.
              // For "첫째날", "둘째날", we just use the string.
            }
            foundDate = true;
            console.log(`[Schedule] 📅 날짜 발견: ${currentDate}`);
            break;
          }
        }
        
        if (foundDate) continue;
        
        // 시간 패턴 체크
        let timeMatch = null;
        let matchedPattern = null;
        
        for (const pattern of timePatterns) {
          timeMatch = line.match(pattern);
          if (timeMatch) {
            matchedPattern = pattern;
            break;
          }
        }
        
        if (timeMatch) {
          let time = '';
          let activity = '';
          let location = '';
          
          // 시간 추출
          if (matchedPattern === timePatterns[0]) {
            // "10:00~12:00"
            time = `${timeMatch[1]}~${timeMatch[2]}`;
          } else if (matchedPattern === timePatterns[1]) {
            // "오전 10시"
            time = `${timeMatch[1]} ${timeMatch[2]}시`;
          } else {
            // "14:00"
            time = timeMatch[1];
          }
          
          // 활동 내용 추출 (시간 이후 텍스트)
          activity = line.replace(timeMatch[0], '').trim();
          
          // 콜론(:), 하이픈(-) 등으로 시작하면 제거
          activity = activity.replace(/^[\s::\-\—]+/, '').trim();
          
          // 위치 정보 추출 시도 (괄호 안이나 @ 기호 뒤)
          const locationMatch = activity.match(/[\(@]([^)\n]+)[)\n]?/);
          if (locationMatch) {
            location = locationMatch[1].trim();
            activity = activity.replace(locationMatch[0], '').trim();
          }
          
          // 활동이 너무 짧으면 스킵
          if (activity.length < 3) {
            console.log(`[Schedule] ⏭️ 제외: 활동 내용이 너무 짧음`);
            continue;
          }
          
          // 활동 내용이 100자를 넘으면 자르기
          if (activity.length > 100) {
            activity = activity.substring(0, 97) + '...';
          }
          
          const scheduleItem = {
            time,
            activity,
            ...(location && { location }),
            ...(currentDate && { date: currentDate })
          };
          
          schedule.push(scheduleItem);
          console.log(`[Schedule] ✓ 추가: ${currentDate ? `[${currentDate}] ` : ''}${time} - ${activity}${location ? ` (${location})` : ''}`);
        }
      }
      
      console.log(`[Schedule] ========== 일정 추출 완료 ==========`);
      console.log(`[Schedule] 총 ${schedule.length}개의 일정 항목 추출됨`);
      
      // 날짜별로 그룹화하여 정렬
      if (schedule.length > 0) {
        const grouped = {};
        
        schedule.forEach(item => {
          const dateKey = item.date || '날짜 미정';
          if (!grouped[dateKey]) {
            grouped[dateKey] = [];
          }
          grouped[dateKey].push(item);
        });
        
        console.log(`[Schedule] 📊 날짜별 그룹: ${Object.keys(grouped).length}개`);
        Object.keys(grouped).forEach(date => {
          console.log(`[Schedule]   - ${date}: ${grouped[date].length}개 일정`);
        });
      }
      
      return schedule;
    };
    
    // YouTube 동영상 검색 - 중앙화된 함수 사용
    const searchYouTubeVideos = async (festivalName) => {
      try {
        console.log(`[Transform] 🎬 Calling fetchYoutubeVideos function for: "${festivalName}"`);
        
        const result = await base44.functions.invoke('fetchYoutubeVideos', {
          festivalName,
          searchHighlightVideo: true,
          searchShorts: true
        });
        
        if (result.data.success) {
          console.log(`[Transform] ✓ fetchYoutubeVideos result: topVideo=${result.data.highlightVideoUrl ? '✓' : '✗'}, shorts=${result.data.shortsUrls.length}`);
          return {
            topVideoUrl: result.data.highlightVideoUrl || '',
            shortsUrls: result.data.shortsUrls || []
          };
        } else {
          console.error(`[Transform] ❌ fetchYoutubeVideos failed:`, result.data.error);
          return { shortsUrls: [], topVideoUrl: '' };
        }
        
      } catch (error) {
        console.error(`[Transform] ❌ fetchYoutubeVideos exception:`, error.message);
        if (error.message.includes('YOUTUBE_API_LIMIT_REACHED') || error.message.includes('API_LIMIT_REACHED')) {
          throw error;
        }
        return { shortsUrls: [], topVideoUrl: '' };
      }
    };
    
    // API 사용량 체크 및 증가 함수
    const checkAndIncrementApiUsage = async (apiName, limit) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      try {
        // 오늘 날짜의 사용 로그 조회
        const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
          api_name: apiName,
          date: today
        });
        
        if (logs.length === 0) {
          // 첫 사용 - 새로 생성
          await base44.asServiceRole.entities.ApiUsageLog.create({
            api_name: apiName,
            date: today,
            count: 1,
            limit: limit
          });
          console.log(`[Transform] ✓ ${apiName} usage: 1/${limit}`);
          return { allowed: true, count: 1, limit };
        } else {
          // 기존 로그 있음
          const log = logs[0];
          if (log.count >= limit) {
            console.log(`[Transform] ❌ ${apiName} daily limit reached: ${log.count}/${limit}`);
            return { allowed: false, count: log.count, limit };
          }
          
          // 카운트 증가
          await base44.asServiceRole.entities.ApiUsageLog.update(log.id, {
            count: log.count + 1
          });
          console.log(`[Transform] ✓ ${apiName} usage: ${log.count + 1}/${limit}`);
          return { allowed: true, count: log.count + 1, limit };
        }
      } catch (error) {
        console.error(`[Transform] ❌ Failed to check API usage:`, error.message);
        // 에러 시에는 허용 (로깅 실패로 API 호출 막지 않음)
        return { allowed: true, count: 0, limit };
      }
    };
    
    // Google 이미지 검색 함수
    const searchGoogleImages = async (festivalName) => {
      try {
        console.log(`[Transform] 🖼️ Google Image search for: "${festivalName}"`);
        
        const googleApiKey = Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
        const searchEngineId = Deno.env.get("GOOGLE_SEARCH_ENGINE_ID");
        
        if (!googleApiKey || !searchEngineId) {
          console.log(`[Transform] ⚠️ Google API credentials missing`);
          return [];
        }
        
        // API 사용량 체크
        const usage = await checkAndIncrementApiUsage('google_custom_search', 100);
        if (!usage.allowed) {
          throw new Error(`GOOGLE_SEARCH_LIMIT_REACHED: ${usage.count}/${usage.limit} 쿼리 소진`);
        }
        
        // Google Custom Search API - 이미지 검색 (포스터 및 정치인/공무원 이미지 제외)
        const searchParams = new URLSearchParams({
          key: googleApiKey,
          cx: searchEngineId,
          q: `${festivalName} -포스터 -poster -현수막 -banner -기간 -일시 -정치인 -공무원 -관계자 -회의 -간담회 -방문 -협약 -시장 -도지사 -의원 -단체사진 -업무협약 -개막식 -위촉식`,
          searchType: 'image',
          num: '5',
          imgSize: 'large',
          safe: 'active'
        });
        
        const searchUrl = `https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`;
        console.log(`[Transform] 📡 Calling Google Custom Search API...`);
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Transform] ❌ Google API error (${response.status}):`, errorText);
          return [];
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
          console.log(`[Transform] ⚠️ No images found for: ${festivalName}`);
          return [];
        }

        // 부정 키워드 목록 정의 (정치인/공무원/행사 관련 이미지 필터링)
        const excludeKeywords = [
          // 인물 관련
          '정치인', '공무원', '관계자', '국회의원', '도지사', '시장', '구청장', '단체장',
          // 행사/이벤트 관련
          '기자회견', '취임식', '개막식', '폐막식', '시상식', '위촉식', '간담회', '회의', 
          '업무협약', 'mou', '협력', '협약식', '방문', '시찰', '격려', '축사', '환영사', 
          '기념촬영', '포토월', '행사준비', '추진위원회', '조직위원회', '운영위원회', 
          '성공개최', '발전방안', '지원', '예산', '유치', '홍보대사', '서포터즈', 
          '발대식', '자원봉사자', '안전점검', '현장점검', '점검', '봉사활동',
          // 뉴스/보도 관련 (뉴스 이미지만 제외, 언론사 자체는 제외하지 않음)
          '기자단', '보도자료', '브리핑', '언론', '방송촬영'
        ];

        // 제외할 도메인 목록 (접근 제한이 있거나 리다이렉트되는 URL)
        const excludeDomains = [
          'lookaside.fbsbx.com',  // Facebook/Instagram 프록시 URL (로그인 필요)
          'scontent.cdninstagram.com',  // Instagram CDN (접근 제한)
          'scontent.xx.fbcdn.net'  // Facebook CDN (접근 제한)
        ];

        // HTTPS 이미지만 필터링 + URL 검증 + 부정 키워드 필터링 + 도메인 필터링
        const imageUrls = data.items
          .filter(item => {
            const url = item.link;
            const title = (item.title || '').toLowerCase();
            const snippet = (item.snippet || '').toLowerCase();
            const displayLink = (item.displayLink || '').toLowerCase();

            // 기본 URL 검증
            if (!url || !url.startsWith('https://')) return false;

            // 연속된 슬래시 3개 이상이 있으면 제외
            if (url.includes('///')) {
              console.log(`[Transform] 🚫 Invalid URL (triple slash): ${url}`);
              return false;
            }

            // 제외 도메인 체크 (URL 또는 displayLink에 포함된 경우 제외)
            const hasExcludedDomain = excludeDomains.some(domain => 
              url.includes(domain) || displayLink.includes(domain)
            );

            if (hasExcludedDomain) {
              console.log(`[Transform] 🚫 Filtered out restricted domain: ${displayLink}`);
              return false;
            }

            // 부정 키워드 체크 (제목 또는 설명에 포함된 경우 제외)
            const hasExcludedKeyword = excludeKeywords.some(keyword => 
              title.includes(keyword) || snippet.includes(keyword)
            );

            if (hasExcludedKeyword) {
              console.log(`[Transform] 🚫 Filtered out unwanted image: ${title.substring(0, 50)}...`);
              return false;
            }

            return true;
          })
          .map(item => item.link);
        
        const filteredCount = data.items.length - imageUrls.length;
        if (filteredCount > 0) {
          console.log(`[Transform] 🔒 Filtered out ${filteredCount} invalid images (HTTPS + URL validation)`);
        }
        console.log(`[Transform] ✅ Found ${imageUrls.length} valid HTTPS images from Google`);
        
        return imageUrls;
        
      } catch (error) {
        console.error(`[Transform] ❌ Google Image search exception:`, error.message);
        if (error.message.includes('GOOGLE_SEARCH_LIMIT_REACHED')) {
          throw error; // 제한 에러는 상위로 전달
        }
        return [];
      }
    };
    
    // 언어 감지 함수 (한글, 영문, 일본어 구분)
    const detectLanguage = (text) => {
      if (!text) return 'ko';
      
      // 한글 체크 (완성형 한글 범위: AC00-D7A3)
      const koreanMatch = text.match(/[\uAC00-\uD7A3]/g);
      // 영문 체크
      const englishMatch = text.match(/[a-zA-Z]/g);
      // 일본어 체크 (히라가나, 카타카나, 한자)
      const japaneseMatch = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g);
      
      const koreanCount = koreanMatch ? koreanMatch.length : 0;
      const englishCount = englishMatch ? englishMatch.length : 0;
      const japaneseCount = japaneseMatch ? japaneseMatch.length : 0;
      
      if (koreanCount > englishCount && koreanCount > japaneseCount) {
        return 'ko';
      } else if (englishCount > japaneseCount) {
        return 'en';
      } else if (japaneseCount > 0) {
        return 'jp';
      }
      
      return 'ko'; // 기본값
    };
    
    // Google Translate API 사용 (1순위), 한도 초과 시 LLM 폴백 (2순위)
    const translateWithGoogleOrLLM = async (texts, targetLanguages, fieldNames) => {
      // texts: { fieldName: string | string[] }
      // returns: { fieldName: { ko, en, jp, zh } }
      try {
        const result = await base44.functions.invoke('googleTranslate', { texts, targetLanguages });
        if (result.data?.success) {
          console.log(`[Transform] ✓ Google Translate used for: ${fieldNames.join(', ')}`);
          return result.data.results;
        }
        if (result.data?.error === 'GOOGLE_TRANSLATE_MONTHLY_LIMIT_REACHED') {
          console.warn(`[Transform] ⚠️ Google Translate monthly limit reached, falling back to LLM`);
          throw new Error('LIMIT_REACHED');
        }
        throw new Error(result.data?.error || 'Google Translate failed');
      } catch (e) {
        if (e.message !== 'LIMIT_REACHED') {
          console.warn(`[Transform] ⚠️ Google Translate error: ${e.message}, falling back to LLM`);
        }
        // LLM 폴백
        const results = {};
        for (const [fieldName, textValue] of Object.entries(texts)) {
          if (Array.isArray(textValue)) {
            if (!textValue.length) { results[fieldName] = { ko: [], en: [], jp: [], zh: [] }; continue; }
            const itemsText = textValue.join('\n- ');
            const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: `다음 항목들을 한국어, 영어, 일본어(jp), 중국어로 번역해주세요:\n- ${itemsText}`,
              add_context_from_internet: false,
              response_json_schema: { type: "object", properties: { ko: { type: "array", items: { type: "string" } }, en: { type: "array", items: { type: "string" } }, jp: { type: "array", items: { type: "string" } }, zh: { type: "array", items: { type: "string" } } }, required: ["ko", "en", "jp", "zh"] }
            }).catch(() => ({ ko: textValue, en: textValue, jp: textValue, zh: textValue }));
            results[fieldName] = llmResult;
          } else {
            if (!textValue || textValue.length < 3) { results[fieldName] = { ko: textValue || '', en: textValue || '', jp: textValue || '', zh: textValue || '' }; continue; }
            const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: `다음 텍스트를 한국어, 영어, 일본어(jp), 중국어로 번역해주세요:\n${textValue}`,
              add_context_from_internet: false,
              response_json_schema: { type: "object", properties: { ko: { type: "string" }, en: { type: "string" }, jp: { type: "string" }, zh: { type: "string" } }, required: ["ko", "en", "jp", "zh"] }
            }).catch(() => ({ ko: textValue, en: textValue, jp: textValue, zh: textValue }));
            results[fieldName] = llmResult;
          }
        }
        return results;
      }
    };

    // 다국어 번역 함수
    const translateMultiLanguage = async (text, sourceLanguage, fieldName) => {
      if (!text || text.length < 3) return { ko: text || '', en: text || '', jp: text || '', zh: text || '' };
      const r = await translateWithGoogleOrLLM({ [fieldName]: text }, ['ko', 'en', 'ja', 'zh-CN'], [fieldName]);
      return r[fieldName] || { ko: text, en: text, jp: text, zh: text };
    };
    
    // 배열 다국어 번역 함수 (highlights, tags용)
    const translateArrayMultiLanguage = async (items, sourceLanguage, fieldName) => {
      if (!items || items.length === 0) return { ko: [], en: [], jp: [], zh: [] };
      const r = await translateWithGoogleOrLLM({ [fieldName]: items }, ['ko', 'en', 'ja', 'zh-CN'], [fieldName]);
      return r[fieldName] || { ko: items, en: items, jp: items, zh: items };
    };
    
    // AI 기반 요약, 하이라이트, 태그 생성
    const generateAIContent = async (festivalName, overview, additionalInfo) => {
      try {
        console.log(`[Transform] 🤖 Generating AI content (summary, highlights, tags)...`);
        
        // 컨텍스트 구성
        let context = `축제명: ${festivalName}\n\n`;
        context += `상세 설명:\n${overview}\n\n`;
        
        if (additionalInfo.program) {
          context += `프로그램:\n${additionalInfo.program}\n\n`;
        }
        if (additionalInfo.placeinfo) {
          context += `행사장 정보:\n${additionalInfo.placeinfo}\n\n`;
        }
        if (additionalInfo.category) {
          context += `카테고리: ${additionalInfo.category}\n\n`;
        }
        
        const prompt = `다음은 한국 축제에 대한 정보입니다. 이 축제를 사용자에게 매력적으로 소개하기 위해:

1. **요약**: 축제의 핵심을 1-2문장으로 간결하고 매력적으로 요약해주세요. (최대 120자)
2. **하이라이트**: 이 축제의 주요 특징이나 볼거리를 3-4개의 짧은 포인트로 정리해주세요. 각 포인트는 한 문장으로 간결하게 작성해주세요.
3. **태그**: 이 축제를 잘 설명하는 태그 5-7개를 생성해주세요. 태그는 간결하게 2-4글자로, 축제의 특징, 대상, 분위기 등을 나타내는 키워드여야 합니다.
   예시 태그: "가족친화적", "음악", "전통문화", "먹거리", "체험행사", "무료입장", "야간행사" 등

${context}

응답 형식은 반드시 다음 JSON 스키마를 따라주세요.`;

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: false,
          response_json_schema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "1-2문장의 축제 요약 (최대 120자)"
              },
              highlights: {
                type: "array",
                items: { type: "string" },
                description: "3-4개의 하이라이트 포인트"
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "5-7개의 축제 태그"
              }
            },
            required: ["summary", "highlights", "tags"]
          }
        });
        
        console.log(`[Transform] ✓ AI generated summary: ${result.summary?.substring(0, 60)}...`);
        console.log(`[Transform] ✓ AI generated ${result.highlights?.length || 0} highlights`);
        console.log(`[Transform] ✓ AI generated ${result.tags?.length || 0} tags: ${result.tags?.join(', ')}`);
        
        return {
          summary: result.summary || overview.substring(0, 120),
          highlights: result.highlights || [],
          tags: result.tags || []
        };
        
      } catch (error) {
        console.error(`[Transform] AI generation error:`, error.message);
        // AI 실패 시 폴백
        const fallbackSummary = overview.substring(0, 120) + (overview.length > 120 ? '...' : '');
        return {
          summary: fallbackSummary,
          highlights: [],
          tags: []
        };
      }
    };
    
    // ========== 메인 처리 로직 ==========
    
    for (let i = 0; i < rawDataIds.length; i++) {
      const rawDataId = rawDataIds[i];
      
      try {
        console.log(`[Transform] ========== Processing ${i + 1}/${rawDataIds.length} ==========`);
        
        const rawDataList = await base44.asServiceRole.entities.TourApiRawData.filter({ id: rawDataId });
        
        if (rawDataList.length === 0) {
          console.error(`[Transform] Raw data not found: ${rawDataId}`);
          errors.push({ id: rawDataId, error: 'Raw data not found' });
          continue;
        }
        
        const rawData = rawDataList[0];
        console.log(`[Transform] Processing: ${rawData.title} (contentid: ${rawData.contentid})`);
        
        // ===== 기존 Festival 검색 (중복 방지) =====
        let existingFestival = null;
        let isUpdate = false;
        
        try {
          // 1. TourApiRawData에 festival_id가 있으면 우선적으로 그 ID로 검색
          if (rawData.festival_id) {
            console.log(`[Transform] 🔍 Searching by stored festival_id: ${rawData.festival_id}...`);
            const festivalById = await base44.asServiceRole.entities.Festival.filter({ id: rawData.festival_id });
            if (festivalById && festivalById.length > 0) {
              existingFestival = festivalById[0];
              isUpdate = true;
              console.log(`[Transform] ✓ Found existing Festival by ID: ${existingFestival.id}`);
            }
          }
          
          // 2. festival_id로 못찾았으면 tour_api_raw_data_id로 검색
          if (!existingFestival) {
            console.log(`[Transform] 🔍 Searching by tour_api_raw_data_id: "${rawDataId}"...`);
            const festivalByRawId = await base44.asServiceRole.entities.Festival.filter({ tour_api_raw_data_id: rawDataId });
            if (festivalByRawId && festivalByRawId.length > 0) {
              existingFestival = festivalByRawId[0];
              isUpdate = true;
              console.log(`[Transform] ✓ Found existing Festival by tour_api_raw_data_id: ${existingFestival.id}`);
            }
          }
          
          // 3. 위에서 못찾았으면 name_original로 검색
          if (!existingFestival) {
            console.log(`[Transform] 🔍 Searching by name_original: "${rawData.title}"...`);
            const festivalByName = await base44.asServiceRole.entities.Festival.filter({ name_original: rawData.title });
            if (festivalByName && festivalByName.length > 0) {
              existingFestival = festivalByName[0];
              isUpdate = true;
              console.log(`[Transform] ✓ Found existing Festival by name_original: ${existingFestival.id}`);
            }
          }
          
          if (!existingFestival) {
            console.log(`[Transform] ℹ️ No existing Festival found - will create new`);
          }
        } catch (searchError) {
          console.error(`[Transform] Failed to search existing Festival:`, searchError.message);
          // 검색 실패해도 계속 진행 (새로 생성)
        }
        
        // 관리자 수동 입력 필드 보존 (업데이트 모드일 때만)
        let preservedAdminFields = {};
        let preservedYoutubeShorts = [];
        
        if (isUpdate && existingFestival) {
          preservedAdminFields = {
            video_url: existingFestival.video_url || '',
            website: existingFestival.website || '',
            contact: existingFestival.contact || {},
            social_media: existingFestival.social_media || {},
            star_rating: existingFestival.star_rating || 0
          };
          
          // YouTube Shorts 보존 (5개 이상이면)
          if (existingFestival.youtube_shorts_urls && existingFestival.youtube_shorts_urls.length >= 5) {
            preservedYoutubeShorts = existingFestival.youtube_shorts_urls;
            console.log(`[Transform] ✓ YouTube Shorts preserved: ${preservedYoutubeShorts.length} videos (skipping API call)`);
          }
          
          if (preservedAdminFields.video_url) {
            console.log(`[Transform] ✓ video_url preserved (admin manual input)`);
          }
          if (preservedAdminFields.website) {
            console.log(`[Transform] ✓ website preserved (admin manual input)`);
          }
          if (preservedAdminFields.star_rating > 0) {
            console.log(`[Transform] ✓ star_rating preserved: ${preservedAdminFields.star_rating}`);
          }
        }
        
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processing'
        });
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const extractCity = (addr) => {
          if (!addr) return '서울';
          const match = addr.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
          if (match) {
            if (match[1] === '경기') {
              const cityMatch = addr.match(/경기도?\s+([^\s]+시)/);
              return cityMatch ? cityMatch[1].replace('시', '') : '경기';
            }
            return match[1];
          }
          return '서울';
        };
        
        const mapCategory = (cat3code) => {
          const categoryMap = {
            'A0207': '음악', 'A0208': '문화', 'A02070': '음악',
            'A02070200': '지역축제', 'A02080': '문화',
            'A02080600': '문화', 'A02081000': '문화', 'A02081300': '문화',
          };
          return categoryMap[cat3code] || '지역축제';
        };
        
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr.length !== 8) return null;
          return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        };
        
        let formattedStartDate = formatDate(rawData.eventstartdate);
        let formattedEndDate = formatDate(rawData.eventenddate);
        let detailData = {};
        let introData = {};
        let infoData = [];
        let imageGallery = [];
        
        // ===== API 호출들 =====
        
        // detailCommon2
        if (apiKey && rawData.contentid) {
          try {
            const detailParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json"
            });
            
            const detailUrl = `${baseUrl}/detailCommon2?${detailParams.toString()}`;
            const detailResponse = await fetch(detailUrl);
            const detailText = await detailResponse.text();
            
            if (detailResponse.ok) {
              try {
                const detailJson = JSON.parse(detailText);
                const resultCode = detailJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = detailJson.response?.body?.items;
                  if (items && items.item) {
                    detailData = Array.isArray(items.item) ? items.item[0] : items.item;
                    console.log(`[Transform] ✓ detailCommon2 success`);
                    
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      overview: cleanHtml(detailData.overview || ''),
                      homepage: cleanHomepage(detailData.homepage || ''),
                      raw_detail_json: JSON.stringify(detailData)
                    });
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailCommon2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailCommon2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailIntro2
          try {
            const introParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              contentTypeId: "15",
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
            });
            
            const introUrl = `${baseUrl}/detailIntro2?${introParams.toString()}`;
            const introResponse = await fetch(introUrl);
            const introText = await introResponse.text();
            
            if (introResponse.ok) {
              try {
                const introJson = JSON.parse(introText);
                const resultCode = introJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = introJson.response?.body?.items;
                  if (items && items.item) {
                    introData = Array.isArray(items.item) ? items.item[0] : items.item;
                    console.log(`[Transform] ✓ detailIntro2 success`);
                    
                    if (introData.eventstartdate) {
                      formattedStartDate = formatDate(introData.eventstartdate) || formattedStartDate;
                    }
                    if (introData.eventenddate) {
                      formattedEndDate = formatDate(introData.eventenddate) || formattedEndDate;
                    }
                    
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      playtime: cleanHtml(introData.playtime || ''),
                      program: cleanHtml(introData.program || ''),
                      raw_intro_json: JSON.stringify(introData)
                    });
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailIntro2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailIntro2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailInfo2
          try {
            const infoParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              contentTypeId: "15",
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
            });
            
            const infoUrl = `${baseUrl}/detailInfo2?${infoParams.toString()}`;
            const infoResponse = await fetch(infoUrl);
            const infoText = await infoResponse.text();
            
            if (infoResponse.ok) {
              try {
                const infoJson = JSON.parse(infoText);
                const resultCode = infoJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = infoJson.response?.body?.items;
                  if (items && items.item) {
                    infoData = Array.isArray(items.item) ? items.item : [items.item];
                    console.log(`[Transform] ✓ detailInfo2 success - ${infoData.length} items`);
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailInfo2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailInfo2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailImage1
          try {
            const imageParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
              imageYN: "Y",
              subImageYN: "Y"
            });
            
            const imageUrl = `${baseUrl}/detailImage1?${imageParams.toString()}`;
            const imageResponse = await fetch(imageUrl);
            const imageText = await imageResponse.text();
            
            if (imageResponse.ok) {
              try {
                const imageJson = JSON.parse(imageText);
                const resultCode = imageJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = imageJson.response?.body?.items;
                  if (items && items.item) {
                    const imageItems = Array.isArray(items.item) ? items.item : [items.item];
                    imageGallery = imageItems
                      .map(img => ({
                        originimgurl: img.originimgurl || '',
                        smallimageurl: img.smallimageurl || img.originimgurl || '',
                        imgname: cleanHtml(img.imgname || '')
                      }))
                      .filter(img => img.originimgurl);
                    
                    console.log(`[Transform] ✓ detailImage1 success - ${imageGallery.length} images`);
                    if (imageGallery.length > 0) {
                      console.log(`[Transform] 📸 First gallery image: ${imageGallery[0].originimgurl}`);
                    }
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailImage1 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailImage1 error:`, e.message);
          }
        }
        
        // ===== 날짜 검증 =====
        if (!formattedStartDate || !formattedEndDate) {
          console.error(`[Transform] ✗ REJECTED: ${rawData.title} - Missing dates`);
          await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
            processing_status: 'failed',
            error_message: 'Missing start_date or end_date'
          });
          errors.push({ id: rawDataId, festival: rawData.title, error: 'Missing dates' });
          continue;
        }
        
        // ===== Overview 처리 =====
        const overview = detailData.overview || rawData.overview || '';
        let cleanedOverview = cleanHtml(overview);
        cleanedOverview = removeDuplicates(cleanedOverview);
        
        console.log(`[Transform] Overview length: ${cleanedOverview.length} chars`);
        
        // ===== 카테고리 정보 =====
        const festivalCategory = mapCategory(rawData.cat3);
        
        // ===== AI 기반 요약, 하이라이트, 태그 생성 =====
        const aiResult = await generateAIContent(
          rawData.title,
          cleanedOverview,
          {
            program: introData.program,
            placeinfo: introData.placeinfo,
            category: festivalCategory
          }
        );
        
        const summary = aiResult.summary;
        const highlights = aiResult.highlights;
        const aiTags = aiResult.tags || [];
        
        // ===== YouTube 동영상 검색 =====
        let youtubeShorts = [];
        let topVideoUrl = '';
        
        console.log(`[Transform] 🎬 Searching YouTube for: "${rawData.title}"`);
        const youtubeResult = await searchYouTubeVideos(rawData.title);
        topVideoUrl = youtubeResult.topVideoUrl;
        
        // YouTube Shorts: 기존값 5개 이상이면 유지, 아니면 새로 검색
        if (preservedYoutubeShorts.length >= 5) {
          youtubeShorts = preservedYoutubeShorts;
          console.log(`[Transform] 📌 Using preserved YouTube Shorts: ${youtubeShorts.length} videos`);
        } else {
          youtubeShorts = youtubeResult.shortsUrls;
          console.log(`[Transform] 📌 New YouTube Shorts: ${youtubeShorts.length} videos`);
        }
        
        console.log(`[Transform] 📺 Video URL: ${topVideoUrl || '(검색 실패 또는 API 에러)'}`);
        
        // ===== Google 이미지 검색 제외 (이미지 저작권 및 정확성 우려) =====
        // Google 이미지 검색 로직 제거됨
        
        // ===== 설명 구성 (섹션별) =====
        const sections = [];
        const usedContent = new Set();
        
        // Overview 정규화 버전 저장
        if (cleanedOverview) {
          const normalizedOverview = cleanedOverview
            .replace(/[\s,.!?;:()[\]{}'"]/g, '')
            .toLowerCase()
            .substring(0, 150);
          usedContent.add(normalizedOverview);
        }
        
        // 콘텐츠 추가 헬퍼
        const addSection = (title, content) => {
          if (!content) return false;
          
          const cleaned = cleanHtml(content);
          if (!cleaned || cleaned.length < 20) return false;
          
          const normalized = cleaned
            .replace(/[\s,.!?;:()[\]{}'"]/g, '')
            .toLowerCase()
            .substring(0, 150);
          
          for (const used of usedContent) {
            if (normalized === used) {
              console.log(`[Transform] 🗑️ Exact duplicate section: ${title}`);
              return false;
            }
            
            const longer = normalized.length > used.length ? normalized : used;
            const shorter = normalized.length > used.length ? used : normalized;
            
            if (longer.includes(shorter) && shorter.length / longer.length > 0.9) {
              console.log(`[Transform] 🗑️ Similar section skipped: ${title}`);
              return false;
            }
          }
          
          usedContent.add(normalized);
          
          if (title) {
            sections.push(`${title}\n${cleaned}`);
          } else {
            sections.push(cleaned);
          }
          
          return true;
        };
        
        // 프로그램 정보 추가
        if (introData.program) {
          addSection('📋 행사 프로그램', introData.program);
        }
        
        // 부대행사
        if (introData.subevent) {
          addSection('🎪 부대행사', introData.subevent);
        }
        
        // 행사장 안내
        if (introData.placeinfo) {
          addSection('📍 행사장 안내', introData.placeinfo);
        }
        
        // 할인 정보
        if (introData.discountinfofestival) {
          addSection('💰 할인 정보', introData.discountinfofestival);
        }
        
        // detailInfo2 정보
        if (infoData && infoData.length > 0) {
          const infoSections = {};
          
          infoData.forEach(item => {
            const infoName = cleanHtml(item.infoname || '');
            const infoText = cleanHtml(item.infotext || '');
            
            if (infoName && infoText && infoText.length > 10) {
              if (!infoSections[infoName]) {
                infoSections[infoName] = [];
              }
              infoSections[infoName].push(infoText);
            }
          });
          
          Object.keys(infoSections).forEach(sectionName => {
            const content = infoSections[sectionName].join('\n');
            addSection(`📌 ${sectionName}`, content);
          });
        }
        
        // 최종 설명: Overview + 추가 섹션들
        console.log(`[Transform] 📄 Building final description...`);
        
        // Overview는 포맷팅 적용
        let formattedOverview = formatText(cleanedOverview);
        console.log(`[Transform] ✓ Formatted overview: ${formattedOverview.length} chars`);
        
        let fullDescription = formattedOverview;
        
        if (sections.length > 0) {
          console.log(`[Transform] 📋 Adding ${sections.length} additional sections...`);
          const formattedSections = sections.map((section, idx) => {
            const formatted = formatText(section);
            console.log(`[Transform]   Section ${idx + 1}: ${formatted.length} chars`);
            return formatted;
          });
          
          fullDescription += '\n\n' + formattedSections.join('\n\n');
        }
        
        if (!fullDescription.trim()) {
          fullDescription = rawData.title;
        }
        
        console.log(`[Transform] ✅ FINAL Description:`);
        console.log(`[Transform]   - Total length: ${fullDescription.length} chars`);
        
        // ===== 일정 추출 (개선된 버전) =====
        const scheduleItems = extractSchedule(
          introData.program || '', 
          formattedStartDate, 
          formattedEndDate
        );
        
        console.log(`[Transform] ✓ Summary: ${summary.length} chars`);
        console.log(`[Transform] ✓ Highlights: ${highlights.length} items`);
        console.log(`[Transform] ✓ AI Tags: ${aiTags.length} items - ${aiTags.join(', ')}`);
        console.log(`[Transform] ✓ Schedule: ${scheduleItems.length} items`);
        
        // ===== 다국어 번역 =====
        const sourceLanguage = detectLanguage(rawData.title);
        console.log(`[Transform] 📝 Detected source language: ${sourceLanguage}`);

        const cityKo = extractCity(detailData.addr1 || rawData.addr1);

        // 이미 번역된 Festival이 있으면 번역 API 호출 스킵
        const alreadyTranslated = !!(
          isUpdate && existingFestival &&
          existingFestival.name_en &&
          existingFestival.description_en
        );

        let nameTranslations, summaryTranslations, descriptionTranslations, highlightsTranslations, tagsTranslations, categoryTranslations, countryTranslations, cityTranslations;

        if (alreadyTranslated && !retransform) {
          console.log(`[Transform] ⏭️ Translation skipped - already translated (retransform=false)`);
          nameTranslations = { ko: existingFestival.name_ko || rawData.title, en: existingFestival.name_en, jp: existingFestival.name_jp || '', zh: existingFestival.name_zh || '' };
          summaryTranslations = { ko: existingFestival.summary_ko || '', en: existingFestival.summary_en || '', jp: existingFestival.summary_jp || '', zh: existingFestival.summary_zh || '' };
          descriptionTranslations = { ko: existingFestival.description_ko || '', en: existingFestival.description_en || '', jp: existingFestival.description_jp || '', zh: existingFestival.description_zh || '' };
          highlightsTranslations = { ko: existingFestival.highlights_ko || [], en: existingFestival.highlights_en || [], jp: existingFestival.highlights_jp || [], zh: existingFestival.highlights_zh || [] };
          tagsTranslations = { ko: existingFestival.tags_ko || [], en: existingFestival.tags_en || [], jp: existingFestival.tags_jp || [], zh: existingFestival.tags_zh || [] };
          categoryTranslations = { ko: existingFestival.category || festivalCategory, en: existingFestival.category_en || '', jp: existingFestival.category_jp || '', zh: existingFestival.category_zh || '' };
          countryTranslations = { ko: '대한민국', en: existingFestival.country_en || 'South Korea', jp: existingFestival.country_jp || '', zh: existingFestival.country_zh || '' };
          cityTranslations = { ko: cityKo, en: existingFestival.city_en || cityKo, jp: existingFestival.city_jp || cityKo, zh: existingFestival.city_zh || cityKo };
        } else {
          // 다국어 필드 번역
          nameTranslations = await translateMultiLanguage(rawData.title, sourceLanguage, 'name');
          summaryTranslations = await translateMultiLanguage(summary, sourceLanguage, 'summary');
          
          // Description은 길이가 길어서 요약본만 번역 (처음 1000자)
          const descriptionForTranslation = fullDescription.length > 1000 
            ? fullDescription.substring(0, 1000) + '...' 
            : fullDescription;
          descriptionTranslations = await translateMultiLanguage(descriptionForTranslation, sourceLanguage, 'description');
          
          highlightsTranslations = await translateArrayMultiLanguage(highlights, sourceLanguage, 'highlights');
          tagsTranslations = await translateArrayMultiLanguage(aiTags, sourceLanguage, 'tags');
          categoryTranslations = await translateMultiLanguage(festivalCategory, sourceLanguage, 'category');
          // country/city는 Google Translate 대신 LLM 직접 사용 (고유명사 정확성)
          const locationLlm = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `다음 국가명과 도시명을 영어, 일본어, 중국어로 번역해주세요. 고유명사는 해당 언어의 표기법을 따르세요.\n국가: 대한민국\n도시: ${cityKo}`,
            response_json_schema: {
              type: "object",
              properties: {
                country_en: { type: "string" },
                country_jp: { type: "string" },
                country_zh: { type: "string" },
                city_en: { type: "string" },
                city_jp: { type: "string" },
                city_zh: { type: "string" }
              },
              required: ["country_en", "country_jp", "country_zh", "city_en", "city_jp", "city_zh"]
            }
          }).catch(() => ({
            country_en: 'South Korea', country_jp: '韓国', country_zh: '韩国',
            city_en: cityKo, city_jp: cityKo, city_zh: cityKo
          }));
          countryTranslations = { ko: '대한민국', en: locationLlm.country_en, jp: locationLlm.country_jp, zh: locationLlm.country_zh };
          cityTranslations = { ko: cityKo, en: locationLlm.city_en, jp: locationLlm.city_jp, zh: locationLlm.city_zh };
        }
        
        console.log(`[Transform] ✓ Multi-language translation completed`);
        
        // ===== 기타 정보 =====
        const longitude = (detailData.mapx || rawData.mapx) ? parseFloat(detailData.mapx || rawData.mapx) : null;
        const latitude = (detailData.mapy || rawData.mapy) ? parseFloat(detailData.mapy || rawData.mapy) : null;
        
        // 주소 추출: detailData → rawData 직접 필드 → raw_search_json 순으로 fallback
        let resolvedAddr1 = detailData.addr1 || rawData.addr1 || '';
        let resolvedAddr2 = detailData.addr2 || rawData.addr2 || '';
        if (!resolvedAddr1 && rawData.raw_search_json) {
          try {
            const searchJson = JSON.parse(rawData.raw_search_json);
            resolvedAddr1 = searchJson.addr1 || '';
            resolvedAddr2 = searchJson.addr2 || '';
          } catch (e) {}
        }
        // eventplace를 최후 보조 주소로 사용
        if (!resolvedAddr1 && introData.eventplace) {
          resolvedAddr1 = introData.eventplace;
        }
        
        // 웹사이트 URL 파싱 개선
        const websiteUrl = parseWebsiteUrls(introData.eventhomepage || detailData.homepage || rawData.homepage || '');
        
        let organizerInfo = '';
        if (introData.sponsor1 || rawData.sponsor1) {
          organizerInfo = introData.sponsor1 || rawData.sponsor1;
          if (introData.sponsor2) {
            organizerInfo += ` / ${introData.sponsor2}`;
          }
        }
        
        const phoneNumber = detailData.tel || rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '';
        
        // ===== 썸네일 이미지 결정 =====
        // TourAPI 이미지만 사용 (Google 이미지 검색 제외)
        const tourApiImage = detailData.firstimage || rawData.firstimage || '';
        const thumbnailUrl = tourApiImage || null;
        
        console.log(`[Transform] 📸 Image summary:`);
        console.log(`[Transform]   - TourAPI thumbnail: ${tourApiImage ? '✓' : '✗'}`);
        console.log(`[Transform]   - TourAPI gallery (detailImage1): ${imageGallery.length} images`);
        console.log(`[Transform]   - Final thumbnail: ${thumbnailUrl || 'null'}`);
        
        // ===== 최종 태그 구성 =====
        const baseTagsArray = ['국내축제', '한국관광공사', extractCity(detailData.addr1 || rawData.addr1)];
        const finalTags = [...new Set([...baseTagsArray, ...aiTags])]; // 중복 제거
        
        // ===== Festival 엔티티 생성/업데이트 =====
        const festivalData = {
          // 원본 데이터 ID 저장 (중복 방지용)
          tour_api_raw_data_id: rawDataId,
          // 기본 정보 (name 필드 제거, name_original 사용)
          name_original: rawData.title,
          name_ko: nameTranslations.ko,
          name_en: nameTranslations.en,
          name_jp: nameTranslations.jp,
          name_zh: nameTranslations.zh,
          original_language: sourceLanguage,
          
          description_original: fullDescription,
          description_ko: descriptionTranslations.ko,
          description_en: descriptionTranslations.en,
          description_jp: descriptionTranslations.jp,
          description_zh: descriptionTranslations.zh,
          
          summary_ko: summaryTranslations.ko,
          summary_en: summaryTranslations.en,
          summary_jp: summaryTranslations.jp,
          summary_zh: summaryTranslations.zh,
          
          highlights_ko: highlightsTranslations.ko,
          highlights_en: highlightsTranslations.en,
          highlights_jp: highlightsTranslations.jp,
          highlights_zh: highlightsTranslations.zh,
          
          category: festivalCategory,
          category_en: categoryTranslations.en,
          category_jp: categoryTranslations.jp,
          category_zh: categoryTranslations.zh,
          
          tags_ko: tagsTranslations.ko && tagsTranslations.ko.length > 0 ? tagsTranslations.ko : finalTags,
          tags_en: tagsTranslations.en,
          tags_jp: tagsTranslations.jp,
          tags_zh: tagsTranslations.zh,
          
          country: '대한민국',
          country_ko: '대한민국',
          country_en: countryTranslations.en,
          country_jp: countryTranslations.jp,
          country_zh: countryTranslations.zh,
          city: cityKo,
          city_ko: cityKo,
          city_en: cityTranslations.en,
          city_jp: cityTranslations.jp,
          city_zh: cityTranslations.zh,
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          latitude: latitude,
          longitude: longitude,
          thumbnail_url: thumbnailUrl,
          
          // 영상 URL: 
          // - 업데이트 모드에서 기존 video_url이 있고 비어있지 않으면 유지
          // - 그 외에는 YouTube 검색 결과 사용
          video_url: (isUpdate && preservedAdminFields.video_url && preservedAdminFields.video_url.trim() !== '') 
            ? preservedAdminFields.video_url 
            : topVideoUrl,
          
          youtube_shorts_urls: youtubeShorts,
          media_urls: [
            // 1. 대표 이미지 (thumbnail) - null이면 제외
            ...(thumbnailUrl ? [{
              type: 'image',
              url: thumbnailUrl,
              caption: rawData.title
            }] : []),
            // 2. TourAPI 갤러리 이미지
            ...imageGallery.map(img => ({
              type: 'image',
              url: img.originimgurl,
              caption: img.imgname || rawData.title
            }))
          ],
          
          // 웹사이트: 업데이트 시 기존값 유지
          website: isUpdate && preservedAdminFields.website 
            ? preservedAdminFields.website 
            : websiteUrl,
          
          price: 0,
          opening_hours: formatText(introData.playtime || rawData.playtime || introData.usetimefestival || ''),
          opening_hours_ko: formatText(introData.playtime || rawData.playtime || introData.usetimefestival || ''),
          
          access_info: resolvedAddr1 ? `${resolvedAddr1} ${resolvedAddr2}`.trim() : '',
          access_info_ko: resolvedAddr1 ? `${resolvedAddr1} ${resolvedAddr2}`.trim() : '',
          
          parking_info: formatText(introData.parkingfee || introData.parkingfestival || ''),
          parking_info_ko: formatText(introData.parkingfee || introData.parkingfestival || ''),
          
          organizer: organizerInfo,
          
          // 연락처: 업데이트 시 기존값 유지
          contact: isUpdate && preservedAdminFields.contact && Object.keys(preservedAdminFields.contact).length > 0
            ? preservedAdminFields.contact
            : { phone: phoneNumber, email: '' },
          
          // SNS: 업데이트 시 기존값 유지
          social_media: isUpdate && preservedAdminFields.social_media && Object.keys(preservedAdminFields.social_media).length > 0
            ? preservedAdminFields.social_media
            : {},
          
          // 별점: 업데이트 시 기존값 유지
          star_rating: isUpdate && preservedAdminFields.star_rating > 0
            ? preservedAdminFields.star_rating
            : 0,
          
          lineup: [],
          likes_count: isUpdate ? (existingFestival.likes_count || 0) : 0,
          catches_count: isUpdate ? (existingFestival.catches_count || 0) : 0,
          comments_count: isUpdate ? (existingFestival.comments_count || 0) : 0,
          restrictions: introData.agelimit ? [`관람연령: ${introData.agelimit}`] : [],
          recommendations: introData.spendtimefestival ? [`관람 소요시간: ${introData.spendtimefestival}`] : [],
          schedule: scheduleItems,
          image_gallery_urls: imageGallery,
          restrictions_ko: introData.agelimit ? [`관람연령: ${introData.agelimit}`] : [],
          restrictions_en: [],
          recommendations_ko: introData.spendtimefestival ? [`관람 소요시간: ${introData.spendtimefestival}`] : [],
          recommendations_en: []
        };
        
        // 업데이트 또는 생성
        let festivalResult;
        const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        if (isUpdate && existingFestival) {
          // 기존 Festival 업데이트 (ID 유지) - update_time만 갱신, create_time은 기존값 유지
          console.log(`[Transform] 🔄 Updating existing Festival (ID: ${existingFestival.id})...`);
          festivalResult = await base44.asServiceRole.entities.Festival.update(existingFestival.id, {
            ...festivalData,
            create_time: existingFestival.create_time || nowIso,
            update_time: nowIso
          });
          console.log(`[Transform] ✓ Festival updated (ID maintained: ${existingFestival.id})`);
        } else {
          // 새로운 Festival 생성 - create_time, update_time 모두 현재 시각
          console.log(`[Transform] ➕ Creating new Festival...`);
          festivalResult = await base44.asServiceRole.entities.Festival.create({
            ...festivalData,
            create_time: nowIso,
            update_time: nowIso
          });
          console.log(`[Transform] ✓ New Festival created (ID: ${festivalResult.id})`);
        }
        
        festivals.push(festivalResult);
        
        // TourApiRawData의 festival_id 업데이트
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processed',
          festival_id: festivalResult.id,
          error_message: ''
        });
        
        console.log(`[Transform] ✓ SUCCESS: ${festivalData.name} ${isUpdate ? '(업데이트 완료)' : '(신규 생성 완료)'}`);
        
      } catch (error) {
        console.error(`[Transform] Exception for ${rawDataId}:`, error);
        
        try {
          await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
            processing_status: 'failed',
            error_message: error.message
          });
        } catch (updateError) {
          console.error(`[Transform] Failed to update error status:`, updateError);
        }
        
        errors.push({ id: rawDataId, error: error.message });
      }
    }
    
    console.log(`[Transform] ========== SUMMARY ==========`);
    console.log(`[Transform] Processed: ${rawDataIds.length}`);
    console.log(`[Transform] Success: ${festivals.length}`);
    console.log(`[Transform] Failed: ${errors.length}`);
    
    // JSON serialization safe response - 순환 참조 제거
    const festivalIds = festivals.map(f => f.id);
    
    return Response.json({
      success: true,
      festivals_created: festivals.length,
      festival_ids: festivalIds,
      message: `${festivals.length}개의 축제가 처리되었습니다.`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[Transform] Function error:', error);
    
    // API 제한 에러 체크
    if (error.message && error.message.includes('GOOGLE_SEARCH_LIMIT_REACHED')) {
      return Response.json({ 
        success: false,
        error: 'API_LIMIT_REACHED',
        error_type: 'google_search',
        message: 'Google Custom Search API 하루 100회 무료 쿼리를 소진하였습니다.'
      }, { status: 429 });
    }
    
    if (error.message && error.message.includes('YOUTUBE_API_LIMIT_REACHED')) {
      return Response.json({ 
        success: false,
        error: 'API_LIMIT_REACHED',
        error_type: 'youtube',
        message: 'YouTube Data API 하루 100회 무료 쿼리를 소진하였습니다.'
      }, { status: 429 });
    }
    
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류',
      message: '데이터 변환 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
});