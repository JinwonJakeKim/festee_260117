import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { url } = await req.json();
    
    if (!url) {
      return Response.json({ 
        success: false,
        error: 'URL is required' 
      }, { status: 400 });
    }

    console.log(`Fetching content from: ${url}`);

    let html;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return Response.json({
          success: false,
          error: `페이지를 불러올 수 없습니다 (HTTP ${response.status})`,
          message: '올바른 URL인지 확인해주세요.'
        });
      }
      
      html = await response.text();
      
      if (!html || html.length < 100) {
        return Response.json({
          success: false,
          error: '페이지 내용이 너무 짧습니다',
          message: '다른 URL을 시도해주세요.'
        });
      }
      
      console.log(`Content fetched (${html.length} chars)`);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      
      let errorMessage = '페이지를 불러오는 중 오류가 발생했습니다';
      let userMessage = '';
      
      if (fetchError.name === 'AbortError') {
        errorMessage = '페이지 로딩 시간이 초과되었습니다';
        userMessage = '웹사이트 응답이 너무 느립니다. 다른 URL을 시도해주세요.';
      } else if (fetchError.message?.includes('certificate') || fetchError.message?.includes('SSL')) {
        errorMessage = 'SSL 인증서 오류';
        userMessage = '이 웹사이트는 보안 인증서 문제로 접근할 수 없습니다. 다른 URL을 시도해주세요.';
      } else if (fetchError.message?.includes('ENOTFOUND') || fetchError.message?.includes('getaddrinfo')) {
        errorMessage = 'URL을 찾을 수 없습니다';
        userMessage = 'URL 주소가 올바른지 확인해주세요.';
      } else {
        userMessage = `${fetchError.message} - 다른 URL을 시도해주세요.`;
      }
      
      return Response.json({
        success: false,
        error: errorMessage,
        message: userMessage,
        technical_details: fetchError.message
      });
    }

    // HTML에서 직접 YouTube URL 추출
    const extractYoutubeUrls = (htmlContent) => {
      const youtubeUrls = [];
      
      // iframe src에서 YouTube URL 찾기
      const iframePattern = /<iframe[^>]*src=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["'][^>]*>/gi;
      let match;
      while ((match = iframePattern.exec(htmlContent)) !== null) {
        youtubeUrls.push(match[1]);
      }
      
      // data-src에서도 찾기
      const dataSrcPattern = /<iframe[^>]*data-src=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["'][^>]*>/gi;
      while ((match = dataSrcPattern.exec(htmlContent)) !== null) {
        youtubeUrls.push(match[1]);
      }
      
      return youtubeUrls;
    };

    // HTML에서 직접 날짜 정보 추출 (핵심 개선)
    const extractDateInfo = (htmlContent) => {
      const dateInfo = [];
      
      // HTML 태그 제거하되 구조 유지
      const cleanHtml = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                     .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // 1. "When:" 키워드 근처 텍스트 추출
      const whenPatterns = [
        /When[:\s]+([^<>\n]{5,100})/gi,
        /when[:\s]+([^<>\n]{5,100})/gi,
        /WHEN[:\s]+([^<>\n]{5,100})/gi,
      ];
      
      whenPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanHtml)) !== null) {
          const text = match[1].trim().replace(/\s+/g, ' ');
          if (text.length > 5 && text.length < 100) {
            dateInfo.push({ source: 'When keyword', text: text });
          }
        }
      });
      
      // 2. "Date:" 키워드 근처 텍스트 추출
      const datePatterns = [
        /Date[:\s]+([^<>\n]{5,100})/gi,
        /date[:\s]+([^<>\n]{5,100})/gi,
        /DATE[:\s]+([^<>\n]{5,100})/gi,
        /날짜[:\s]+([^<>\n]{5,100})/gi,
      ];
      
      datePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanHtml)) !== null) {
          const text = match[1].trim().replace(/\s+/g, ' ');
          if (text.length > 5 && text.length < 100) {
            dateInfo.push({ source: 'Date keyword', text: text });
          }
        }
      });
      
      // 3. "기간:", "Period:" 키워드 근처 텍스트 추출
      const periodPatterns = [
        /Period[:\s]+([^<>\n]{5,100})/gi,
        /period[:\s]+([^<>\n]{5,100})/gi,
        /기간[:\s]+([^<>\n]{5,100})/gi,
        /Duration[:\s]+([^<>\n]{5,100})/gi,
      ];
      
      periodPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanHtml)) !== null) {
          const text = match[1].trim().replace(/\s+/g, ' ');
          if (text.length > 5 && text.length < 100) {
            dateInfo.push({ source: 'Period keyword', text: text });
          }
        }
      });
      
      // 4. 날짜 형식 패턴 직접 검색
      const dateFormatPatterns = [
        // ⭐ 새로 추가: 요일이 포함된 하루짜리 축제 패턴 (최우선)
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b/gi,
        // 단일 날짜 패턴 (예: "Mar 8th 2026", "January 15, 2026")
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b/gi,
        // "Late Jan - Mid Feb 2026" 형식
        /\b(Early|Mid|Late)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*-\s*(Early|Mid|Late)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi,
        // "January 15 - 20, 2026" 형식
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s*-\s*\d{1,2},?\s+\d{4}\b/gi,
        // "Sep 13th - Nov 30th 2025" 형식
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s*-\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2}(?:st|nd|rd|th)?\s+\d{4}\b/gi,
        // "2026.1.20 - 2.15" 형식
        /\b\d{4}\.\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}\b/gi,
        // "Mid Feb 2026" 형식 (단일 월)
        /\b(Early|Mid|Late)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi,
      ];
      
      dateFormatPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanHtml)) !== null) {
          const text = match[0].trim();
          dateInfo.push({ source: 'Date pattern match', text: text });
        }
      });
      
      // 5. 아이콘 근처 텍스트 추출 (calendar, clock 아이콘)
      const iconPatterns = [
        // Font Awesome calendar icon
        /<i[^>]*class="[^"]*(?:calendar|fa-calendar)[^"]*"[^>]*><\/i>\s*([^<>\n]{5,100})/gi,
        // Font Awesome clock icon
        /<i[^>]*class="[^"]*(?:clock|fa-clock)[^"]*"[^>]*><\/i>\s*([^<>\n]{5,100})/gi,
        // SVG calendar icon
        /<svg[^>]*>[^<]*(?:calendar)[^<]*<\/svg>\s*([^<>\n]{5,100})/gi,
        // SVG clock icon
        /<svg[^>]*>[^<]*(?:clock)[^<]*<\/svg>\s*([^<>\n]{5,100})/gi,
        // Image calendar icon (alt or src)
        /<img[^>]*(?:alt=["'][^"']*(?:calendar)[^"']*["']|src=["'][^"']*(?:calendar)[^"']*["'])[^>]*>\s*([^<>\n]{5,100})/gi,
        // Image clock icon (alt or src)
        /<img[^>]*(?:alt=["'][^"']*(?:clock)[^"']*["']|src=["'][^"']*(?:clock)[^"']*["'])[^>]*>\s*([^<>\n]{5,100})/gi,
      ];
      
      iconPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanHtml)) !== null) {
          const text = match[1].trim().replace(/\s+/g, ' ');
          if (text.length > 5 && text.length < 100) {
            dateInfo.push({ source: 'Icon proximity', text: text });
          }
        }
      });
      
      // 6. 메타 태그에서 날짜 추출
      const metaDatePatterns = [
        /<meta[^>]*property=["'](?:event:start_date|startDate)[^>]*content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]*property=["'](?:event:end_date|endDate)[^>]*content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]*name=["']date[^>]*content=["']([^"']+)["'][^>]*>/gi,
      ];
      
      metaDatePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(htmlContent)) !== null) {
          const text = match[1].trim();
          if (text.length > 5 && text.length < 100) {
            dateInfo.push({ source: 'Meta tag', text: text });
          }
        }
      });
      
      // 중복 제거
      const uniqueDateInfo = Array.from(new Set(dateInfo.map(d => d.text)))
        .map(text => {
          const item = dateInfo.find(d => d.text === text);
          return { source: item.source, text: text };
        });
      
      return uniqueDateInfo;
    };

    // YouTube URL 유효성 검증 함수
    const isValidYoutubeUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      
      const patterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(&.*)?$/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}(\?.*)?$/,
        /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}(\?.*)?$/,
      ];
      
      return patterns.some(pattern => pattern.test(url));
    };

    // YouTube Video ID 추출 함수
    const extractYoutubeVideoId = (url) => {
      if (!url) return null;
      
      const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[1].length === 11) {
          return match[1];
        }
      }
      
      return null;
    };

    const extractedYoutubeUrls = extractYoutubeUrls(html);
    console.log(`Extracted YouTube URLs from HTML:`, extractedYoutubeUrls);

    const extractedDateInfo = extractDateInfo(html);
    console.log(`Extracted date information from HTML:`, extractedDateInfo);

    // HTML 길이를 대폭 늘려서 더 많은 콘텐츠 분석 (50,000 → 100,000자)
    const maxLength = 100000;
    const truncatedHtml = html.length > maxLength ? html.substring(0, maxLength) : html;
    
    console.log(`Analyzing with LLM (${truncatedHtml.length} chars)...`);

    let extraction;
    try {
      extraction = await base44.integrations.Core.InvokeLLM({
        prompt: `
          다음 웹페이지에서 축제/이벤트 정보를 매우 상세하게 추출해주세요.
          
          **🌏 다국어 처리 (매우 중요!):**
          
          1. **원본 언어 감지:**
             - 웹페이지의 주요 텍스트가 어떤 언어로 작성되었는지 감지하세요
             - original_language 필드에 언어 코드 저장 (ja=일본어, ko=한국어, en=영어, zh=중국어, th=태국어 등)
          
          2. **⭐ 3가지 버전 모두 필수 작성 (절대 빠뜨리지 마세요!):**
             
             a) **축제 이름:**
                - name_original: 웹페이지 원본 언어 그대로
                - name_ko: 한국어 번역 (원본이 한국어면 그대로 복사)
                - name_en: 영어 번역 (원본이 영어면 그대로 복사)
             
             b) **축제 요약:**
                - summary_original: 웹페이지 원본 언어 그대로 (1-2줄)
                - summary_ko: 한국어 번역 (1-2줄)
                - summary_en: 영어 번역 (1-2줄)
             
             c) **축제 설명 (가장 중요!):**
                - description_original: 웹페이지 원본 언어의 모든 설명 텍스트 (절대 요약 금지!)
                - description_ko: 위 원본을 한국어로 완전히 번역 (모든 문장 포함, 절대 요약 금지!)
                - description_en: 위 원본을 영어로 완전히 번역 (모든 문장 포함, 절대 요약 금지!)
                
                ⚠️⚠️⚠️ 매우 중요:
                - 원본이 영어면: description_original과 description_en은 동일, description_ko는 한국어 번역
                - 원본이 일본어면: description_original과 description_ja는 동일, description_ko는 한국어 번역, description_en은 영어 번역
                - 원본이 한국어면: description_original과 description_ko는 동일, description_en은 영어 번역
                - 3가지 버전 모두 동일한 길이와 양의 텍스트를 포함해야 합니다!
             
             d) **하이라이트:**
                - highlights_original: 원본 언어로 7-10개
                - highlights_ko: 한국어 번역으로 7-10개 (원본과 동일한 개수)
                - highlights_en: 영어 번역으로 7-10개 (원본과 동일한 개수)
             
             e) **운영 정보:**
                - opening_hours_ko: 한국어
                - opening_hours_en: 영어
             
             f) **교통 정보:**
                - access_info_ko: 한국어로 상세히
                - access_info_en: 영어로 상세히
             
             g) **주차 정보:**
                - parking_info_ko: 한국어
                - parking_info_en: 영어
             
             h) **금지사항:**
                - restrictions_original: 원본 언어로 5-7개
                - restrictions_ko: 한국어 번역으로 5-7개
                - restrictions_en: 영어 번역으로 5-7개
             
             i) **추천사항:**
                - recommendations_original: 원본 언어로 5-7개
                - recommendations_ko: 한국어 번역으로 5-7개
                - recommendations_en: 영어 번역으로 5-7개
          
          3. **번역 품질 규칙:**
             - 모든 번역은 정확하고 자연스럽게
             - 고유명사(축제명, 장소명)는 번역하지 말고 원문 유지
             - 한국어 번역: 존댓말 사용, "~입니다" 체
             - 영어 번역: 명확하고 간결하게
             - 원본과 번역본의 문장 수, 문단 수가 동일해야 합니다
          
          4. **번역 예시:**
             
             원본(영어):
             "The Nagoya Women's Marathon is one of Japan's premier running events, attracting thousands of participants from around the world. The race takes place through the historic streets of Nagoya, offering runners a unique opportunity to experience the city's culture while competing.
             
             Established in 1980, this marathon has grown to become a significant event in the international running calendar. The course showcases Nagoya's beautiful landmarks and provides excellent support from local volunteers."
             
             description_original (영어): [위와 동일]
             
             description_ko (한국어):
             "나고야 여자 마라톤은 일본 최고의 러닝 이벤트 중 하나로, 전 세계에서 수천 명의 참가자들이 모입니다. 이 경주는 나고야의 역사적인 거리를 통과하며, 러너들에게 경쟁하는 동안 도시의 문화를 경험할 수 있는 독특한 기회를 제공합니다.
             
             1980년에 설립된 이 마라톤은 국제 러닝 일정에서 중요한 행사로 성장했습니다. 코스는 나고야의 아름다운 랜드마크를 보여주며 현지 자원봉사자들로부터 훌륭한 지원을 제공합니다."
             
             description_en (영어): [원본과 동일]
          
          ${extractedDateInfo.length > 0 ? `
          **🎯 HTML에서 추출한 날짜 정보:**
          ${extractedDateInfo.map(d => `- [${d.source}] ${d.text}`).join('\n')}
          ` : ''}
          
          **날짜 추출 규칙 (매우 중요):**
          
          0. **⭐ 요일이 포함된 하루짜리 축제 (최우선 처리!):**
             - "Sunday - Mar 8th 2026" → 2026-03-08 ~ 2026-03-08 (하루), date_status: "confirmed"
             - "Monday - April 15th 2025" → 2025-04-15 ~ 2025-04-15 (하루), date_status: "confirmed"
             - "Friday - Dec 25th 2025" → 2025-12-25 ~ 2025-12-25 (하루), date_status: "confirmed"
             - 요일(Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday) 뒤에 "-"가 오고 월/일/년도가 오면
             - 이것은 하루만 진행하는 축제입니다!
             - start_date와 end_date를 동일하게 설정하세요
          
          1. **확정된 날짜 형식:**
             - "Sep 13th - Nov 30th 2025" → 2025-09-13 ~ 2025-11-30, date_status: "confirmed"
             - "2025.9.13 - 11.30" → 2025-09-13 ~ 2025-11-30, date_status: "confirmed"
             - "January 15 - 20, 2026" → 2026-01-15 ~ 2026-01-20, date_status: "confirmed"
             - "Mar 8th 2026" (날짜만 있고 범위 없음) → 2026-03-08 ~ 2026-03-08 (하루), date_status: "confirmed"
             - "January 15, 2026" (날짜만 있고 범위 없음) → 2026-01-15 ~ 2026-01-15 (하루), date_status: "confirmed"
          
          2. **단일 월의 불명확한 날짜:**
             - "Mid Feb 2026" → 2026-02-01 ~ 2026-02-29 (2월 전체), date_status: "tentative"
             - "Early March 2025" → 2025-03-01 ~ 2025-03-31 (3월 전체), date_status: "tentative"
             - "Late April 2026" → 2026-04-01 ~ 2026-04-30 (4월 전체), date_status: "tentative"
             - "February 2026" → 2026-02-01 ~ 2026-02-29 (2월 전체), date_status: "tentative"
          
          3. **두 달에 걸친 불명확한 날짜 (매우 중요):**
             - "Late Jan - Mid Feb 2026" → 2026-01-20 ~ 2026-02-15, date_status: "tentative"
               * Late Jan = 1월 20일부터
               * Mid Feb = 2월 15일까지
             - "Early Jan - Late Jan 2026" → 2026-01-01 ~ 2026-01-31, date_status: "tentative"
               * Early Jan = 1월 1일부터
               * Late Jan = 1월 31일까지
             - "Mid Dec 2025 - Early Jan 2026" → 2025-12-15 ~ 2026-01-10, date_status: "tentative"
               * Mid Dec = 12월 15일
               * Early Jan = 1월 10일
          
          4. **Early/Mid/Late의 정확한 의미:**
             - Early (초) = 해당 월의 1일~10일 → 대표값: 5일
             - Mid (중순) = 해당 월의 11일~20일 → 대표값: 15일
             - Late (말) = 해당 월의 21일~말일 → 대표값: 25일 (또는 해당 월 마지막 날)
          
          5. **월(Month) 정보를 정확히 변환하세요:**
             - Jan=1, Feb=2, Mar=3, Apr=4, May=5, Jun=6
             - Jul=7, Aug=8, Sep=9, Oct=10, Nov=11, Dec=12
          
          6. **연도 처리:**
             - 연도가 명시되어 있으면 그 연도를 사용
             - 연도가 없으면 2025년으로 가정
          
          7. **HTML에서 추출한 날짜 정보를 최우선으로 사용하세요**
             - 위에 명시된 날짜 정보를 반드시 사용하세요
             - 다른 곳에서 추측하거나 찾지 마세요
             - 날짜 정보가 명확하지 않으면 date_status를 "tentative" 또는 "estimated"로 설정
             - 특히 요일이 포함된 패턴을 정확히 처리하세요!
          
          **영상 추출 규칙 (매우 엄격):**
          ⚠️ 영상이 실제로 페이지에 임베드되어 재생 가능한 경우에만 추출하세요!
          
          1. HTML <iframe> 태그 안에 실제로 있는 YouTube URL만 추출:
             - <iframe src="https://www.youtube.com/embed/VIDEO_ID">
             - <iframe data-src="https://www.youtube.com/embed/VIDEO_ID">
          
          2. YouTube URL 형식 검증:
             - 올바른 형식: https://www.youtube.com/watch?v=VIDEO_ID (VIDEO_ID는 정확히 11자)
             - 올바른 형식: https://youtu.be/VIDEO_ID
             - 잘못된 형식이거나 VIDEO_ID가 11자가 아니면 제외
          
          3. 다음 경우에는 영상이 없는 것으로 처리 (video_url 비워두기):
             - 페이지에 "영상", "비디오" 텍스트만 있고 실제 <iframe>이 없는 경우
             - og:video 메타 태그만 있고 실제 임베드가 없는 경우
             - 주석(comment)에만 있는 URL
             - 404 또는 삭제된 영상
          
          4. video_url 필드:
             - 실제로 재생 가능한 첫 번째 YouTube URL만 넣으세요
             - 확실하지 않으면 비워두세요 (null 또는 빈 문자열)
          
          5. media_urls 필드:
             - type은 반드시 "youtube", "video", "image" 중 하나
             - YouTube URL인 경우에만 type: "youtube" 사용
             - 일반 비디오 파일(.mp4, .webm 등)인 경우에만 type: "video" 사용
          
          **텍스트 수집 규칙:**
          
          1. **축제 요약 (summary):**
             - 1-2줄로 간단하게 핵심만 요약
             - summary_original, summary_ko, summary_en 모두 작성
          
          2. **축제 설명 (description) - 🔥 가장 중요!:**
             - ⚠️ 웹페이지의 축제 소개 전체 내용을 그대로 복사 (절대 요약 금지!)
             - description_original: 원본 언어 그대로 모든 텍스트
             - description_ko: 위 원본을 한국어로 완전 번역 (모든 문장 포함!)
             - description_en: 위 원본을 영어로 완전 번역 (모든 문장 포함!)
             - 최소 10문장 이상
             - 문단 구분 \\n\\n 사용
             - 원본이 5개 문단이면 번역본도 5개 문단이어야 합니다
          
          3. **하이라이트:**
             - 7-10개 추출
             - highlights_original, highlights_ko, highlights_en 모두 작성
             - 각 항목 2-3문장
          
          7. **주최 및 연락처:**
             - organizer: 주최/주관 기관명을 정확히
             - contact: 전화번호, 이메일, 팩스 등 모든 연락처 수집
          
          8. **근처 명소 (nearby_attractions):**
             - 웹페이지에서 "nearby", "around", "근처", "주변" 등의 키워드로 찾은 명소를 모두 수집
             - 각 명소마다 이름, 거리, 설명을 포함
             - 최소 3-5개 수집
             - 예: [{name: "나고야 성", distance: "도보 10분", description: "일본의 대표적인 성곽으로 벚꽃 명소"}]
          
          9. **가격 정보 (price_details):**
             - 일반 입장료뿐만 아니라 VIP, 조기 예매, 학생 할인 등 모든 가격 정보를 수집
             - 예: "일반: 50,000원, VIP: 150,000원, 학생 할인: 35,000원, 조기 예매 10% 할인"
          
          10. **기타:**
             - 관련 태그 7-10개 (더 많아도 좋음)
             - 예상 방문객 수 (웹페이지에 명시되어 있다면)
          
          ⚠️⚠️⚠️ 최종 확인: description_original 필드에 웹페이지의 축제 설명 텍스트를 **100% 원문 그대로** 복사했는지 확인하세요!
          - 요약하지 마세요!
          - 모든 문장을 포함하세요!
          - 단락 구분을 위해 \\n\\n을 사용하세요!
          
          HTML 내용:
          ${truncatedHtml}
        `,
        response_json_schema: {
          type: "object",
          properties: {
            festivals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  // 원본 언어 정보
                  original_language: { 
                    type: "string", 
                    description: "원본 언어 코드 (ja, ko, en, zh, th 등)" 
                  },
                  
                  // 축제 이름 (3가지 버전)
                  name_original: { type: "string", description: "축제 이름 (원본 언어)" },
                  name_ko: { type: "string", description: "축제 이름 (한국어 번역)" },
                  name_en: { type: "string", description: "축제 이름 (영어 번역)" },
                  name_local: { type: "string", description: "현지 언어 이름" }, 
                  
                  // 축제 요약 (3가지 버전)
                  summary_original: { type: "string", description: "축제 요약 (원본 언어, 1-2줄)" },
                  summary_ko: { type: "string", description: "축제 요약 (한국어 번역, 1-2줄)" },
                  summary_en: { type: "string", description: "축제 요약 (영어 번역, 1-2줄)" },
                  
                  // 축제 설명 (3가지 버전)
                  description_original: { 
                    type: "string", 
                    description: "축제 설명 (원본 언어, 모든 텍스트 포함, 절대 요약 금지, 최소 10문장)" 
                  },
                  description_ko: { 
                    type: "string", 
                    description: "축제 설명 (한국어 완전 번역, 원본의 모든 문장 포함, 절대 요약 금지, 최소 10문장)" 
                  },
                  description_en: { 
                    type: "string", 
                    description: "축제 설명 (영어 완전 번역, 원본의 모든 문장 포함, 절대 요약 금지, 최소 10문장)" 
                  },
                  
                  // 날짜 및 기본 정보
                  start_date: { type: "string", description: "YYYY-MM-DD 형식" },
                  end_date: { type: "string", description: "YYYY-MM-DD 형식" },
                  date_status: { 
                    type: "string", 
                    enum: ["confirmed", "tentative", "estimated"],
                    description: "날짜 상태" 
                  },
                  date_confidence: { type: "number", description: "날짜 정확도 (0-1)" },
                  date_source: { type: "string", description: "날짜 추출 위치" },
                  city: { type: "string" },
                  location: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  category: { type: "string" },
                  
                  // 가격 및 운영 정보
                  price: { type: "number" },
                  price_details: { type: "string", description: "모든 티켓 종류의 가격 상세 (일반, VIP, 할인 등)" },
                  opening_hours_ko: { type: "string", description: "운영 시간 (한국어)" },
                  opening_hours_en: { type: "string", description: "운영 시간 (영어)" },
                  organizer: { type: "string", description: "주최/주관 기관" },
                  contact: {
                    type: "object",
                    properties: {
                      phone: { type: "string" },
                      email: { type: "string" }
                    },
                    description: "연락처 정보"
                  },
                  
                  // 교통 및 주차 정보 (다국어)
                  access_info_ko: { type: "string", description: "교통 정보 (한국어, \\n으로 구분)" },
                  access_info_en: { type: "string", description: "교통 정보 (영어, \\n으로 구분)" },
                  parking_info_ko: { type: "string", description: "주차 정보 (한국어)" },
                  parking_info_en: { type: "string", description: "주차 정보 (영어)" },
                  
                  // 제한사항 (다국어)
                  restrictions_original: {
                    type: "array",
                    items: { type: "string" },
                    description: "금지사항 (원본 언어) 5-7개"
                  },
                  restrictions_ko: {
                    type: "array",
                    items: { type: "string" },
                    description: "금지사항 (한국어) 5-7개"
                  },
                  restrictions_en: {
                    type: "array",
                    items: { type: "string" },
                    description: "금지사항 (영어) 5-7개"
                  },
                  
                  // 추천사항 (다국어)
                  recommendations_original: {
                    type: "array",
                    items: { type: "string" },
                    description: "추천 준비물 (원본 언어) 5-7개"
                  },
                  recommendations_ko: {
                    type: "array",
                    items: { type: "string" },
                    description: "추천 준비물 (한국어) 5-7개"
                  },
                  recommendations_en: {
                    type: "array",
                    items: { type: "string" },
                    description: "추천 준비물 (영어) 5-7개"
                  },
                  
                  // 웹사이트 및 SNS
                  website: { type: "string" },
                  social_media: {
                    type: "object",
                    properties: {
                      facebook: { type: "string" },
                      instagram: { type: "string" },
                      twitter: { type: "string" },
                      youtube: { type: "string" }
                    },
                    description: "SNS 링크"
                  },
                  
                  // 미디어
                  image_url: { type: "string" },
                  video_url: { type: "string", description: "유효한 YouTube URL만, 없으면 빈 문자열" },
                  media_urls: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["image", "video", "youtube"] },
                        url: { type: "string" },
                        caption: { type: "string" }
                      }
                    }
                  },
                  
                  // 하이라이트 (다국어)
                  highlights_original: {
                    type: "array",
                    items: { type: "string" },
                    description: "하이라이트 (원본 언어) 7-10개, 각 항목은 2-3문장으로 상세하게"
                  },
                  highlights_ko: {
                    type: "array",
                    items: { type: "string" },
                    description: "하이라이트 (한국어) 7-10개, 각 항목은 2-3문장으로 상세하게"
                  },
                  highlights_en: {
                    type: "array",
                    items: { type: "string" },
                    description: "하이라이트 (영어) 7-10개, 각 항목은 2-3문장으로 상세하게"
                  },
                  
                  // 일정 및 라인업
                  schedule: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "string" },
                        activity: { type: "string" },
                        location: { type: "string" }
                      }
                    },
                    description: "웹페이지의 모든 일정 포함"
                  },
                  lineup: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "공연 날짜 (예: Day 1 - 4월 12일)" },
                        artists: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "출연 아티스트 목록"
                        }
                      }
                    },
                    description: "라인업 정보 (날짜별 아티스트)"
                  },
                  nearby_attractions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        distance: { type: "string" },
                        description: { type: "string" }
                      }
                    },
                    description: "근처 명소 최소 3-5개"
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "관련 태그 7-10개"
                  },
                  expected_visitors: { type: "number", description: "예상 방문객 수" }
                }
              }
            }
          }
        }
      });
    } catch (llmError) {
      console.error('LLM error:', llmError);
      return Response.json({
        success: false,
        error: 'AI 분석 중 오류가 발생했습니다',
        message: llmError.message || '다시 시도해주세요.'
      });
    }

    console.log(`Extraction completed, found ${extraction.festivals?.length || 0} festivals`);

    if (!extraction.festivals || extraction.festivals.length === 0) {
      return Response.json({
        success: false,
        error: '축제 정보를 찾을 수 없습니다',
        message: '이 페이지에서 축제 정보를 추출하지 못했습니다. 다른 URL을 시도해주세요.',
        festivals: []
      });
    }

    const validFestivals = extraction.festivals;

    const festivals = validFestivals.map((festival, index) => {
      const normalizeUrl = (inputUrl, baseUrl) => {
        if (!inputUrl || inputUrl.trim() === '') return '';
        try {
          const base = new URL(baseUrl);
          if (inputUrl.startsWith('//')) {
            return base.protocol + inputUrl;
          } else if (inputUrl.startsWith('/')) {
            return base.origin + inputUrl;
          } else if (!inputUrl.startsWith('http')) {
            return new URL(inputUrl, base.href).href;
          }
        } catch (e) {
          console.error(`Failed to normalize URL: ${inputUrl} with base ${baseUrl}`, e);
        }
        return inputUrl;
      };

      let thumbnailUrl = festival.image_url;
      
      if (!thumbnailUrl || thumbnailUrl.trim() === '') {
        const randomId = Math.floor(Math.random() * 100) + 1 + index * 10;
        thumbnailUrl = `https://picsum.photos/seed/${festival.name_original || randomId}/800/600`;
      } else {
        thumbnailUrl = normalizeUrl(thumbnailUrl, url);
      }

      // Video URL 처리 및 유효성 검증
      let videoUrl = festival.video_url || "";
      let videoValidationResult = { isValid: false, reason: "No video URL provided" };
      
      if (videoUrl && videoUrl.trim() !== '') {
        videoUrl = normalizeUrl(videoUrl, url);
        
        // YouTube URL 유효성 검증
        if (isValidYoutubeUrl(videoUrl)) {
          const videoId = extractYoutubeVideoId(videoUrl);
          if (videoId) {
            videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            videoValidationResult = { isValid: true, videoId: videoId, originalUrl: festival.video_url };
            console.log(`✅ Valid YouTube URL: ${videoUrl} (ID: ${videoId})`);
          } else {
            console.warn(`⚠️ Could not extract valid video ID from: ${videoUrl}`);
            videoUrl = "";
            videoValidationResult = { isValid: false, reason: "Invalid video ID", originalUrl: festival.video_url };
          }
        } else {
          console.warn(`⚠️ Invalid YouTube URL format: ${videoUrl}`);
          videoUrl = "";
          videoValidationResult = { isValid: false, reason: "Invalid URL format", originalUrl: festival.video_url };
        }
      }

      // Process media_urls
      let mediaUrlsArray = festival.media_urls || [];
      
      // HTML에서 추출한 YouTube URL 추가 (video_url이 없을 때만)
      if (!videoUrl && extractedYoutubeUrls.length > 0) {
        extractedYoutubeUrls.forEach((ytUrl, idx) => {
          const normalizedYtUrl = normalizeUrl(ytUrl, url);
          if (isValidYoutubeUrl(normalizedYtUrl)) {
            const videoId = extractYoutubeVideoId(normalizedYtUrl);
            if (videoId) {
              const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
              // Only assign to video_url if it's the first and still empty
              if (idx === 0 && !videoUrl) {
                videoUrl = cleanUrl;
                videoValidationResult = { isValid: true, videoId: videoId, source: "HTML extraction" };
                console.log(`✅ Using first HTML-extracted YouTube URL as video_url: ${cleanUrl}`);
              } else {
                // Add to media_urls if not already the main video_url or duplicate
                if (!mediaUrlsArray.some(m => m.url === cleanUrl)) {
                  mediaUrlsArray.push({
                    type: 'youtube',
                    url: cleanUrl,
                    caption: `${festival.name_original || 'Video'} - 영상 ${idx + 1}`
                  });
                }
              }
            }
          }
        });
      }

      const processedMediaUrls = mediaUrlsArray
        .map(media => {
          if (!media.url) return null;
          let normalizedMediaUrl = normalizeUrl(media.url, url);
          
          if (normalizedMediaUrl === thumbnailUrl || normalizedMediaUrl === videoUrl) {
            return null; // Avoid duplicate with thumbnail or main video
          }
          
          if (media.type === 'youtube') {
            if (isValidYoutubeUrl(normalizedMediaUrl)) {
              const videoId = extractYoutubeVideoId(normalizedMediaUrl);
              if (videoId) {
                normalizedMediaUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`✅ Valid YouTube URL in media_urls: ${normalizedMediaUrl}`);
              } else {
                console.warn(`⚠️ Invalid YouTube URL in media_urls, removing: ${normalizedMediaUrl}`);
                return null;
              }
            } else {
              console.warn(`⚠️ Invalid YouTube URL in media_urls, removing: ${normalizedMediaUrl}`);
              return null;
            }
          }
          
          return { ...media, url: normalizedMediaUrl };
        })
        .filter(item => item !== null);

      // Normalize website URL
      const websiteUrl = festival.website ? normalizeUrl(festival.website, url) : url;

      // Normalize social media URLs
      const socialMedia = festival.social_media ? {
        facebook: festival.social_media.facebook ? normalizeUrl(festival.social_media.facebook, url) : null,
        instagram: festival.social_media.instagram ? normalizeUrl(festival.social_media.instagram, url) : null,
        twitter: festival.social_media.twitter ? normalizeUrl(festival.social_media.twitter, url) : null,
        youtube: festival.social_media.youtube ? normalizeUrl(festival.social_media.youtube, url) : null,
      } : null;

      console.log(`Festival "${festival.name_original}" extraction:`, {
        date_status: festival.date_status || 'confirmed',
        start_date: festival.start_date,
        end_date: festival.end_date,
        date_source: festival.date_source,
        video_url: videoUrl || "(none)",
        video_validation: videoValidationResult,
        media_urls_count: processedMediaUrls.length,
        original_language: festival.original_language,
      });

      // 디버깅: 다국어 필드 확인
      console.log(`Festival "${festival.name_original}" multilingual fields:`, {
        original_language: festival.original_language,
        description_original_length: festival.description_original?.length || 0,
        description_ko_length: festival.description_ko?.length || 0,
        description_en_length: festival.description_en?.length || 0,
        summary_original: festival.summary_original?.substring(0, 50),
        summary_ko: festival.summary_ko?.substring(0, 50),
        summary_en: festival.summary_en?.substring(0, 50),
      });

      return {
        // 기본 필드 (한국어 우선 - 한국 서비스이므로)
        name: festival.name_ko || festival.name_original || festival.name_en,
        summary: festival.summary_ko || festival.summary_original || festival.summary_en || null,
        description: festival.description_ko || festival.description_original || festival.description_en,
        opening_hours: festival.opening_hours_ko || festival.opening_hours_en || null,
        access_info: festival.access_info_ko || festival.access_info_en || null,
        parking_info: festival.parking_info_ko || festival.parking_info_en || null,
        restrictions: festival.restrictions_ko || festival.restrictions_original || festival.restrictions_en || [],
        recommendations: festival.recommendations_ko || festival.recommendations_original || festival.recommendations_en || [],
        highlights: festival.highlights_ko || festival.highlights_original || festival.highlights_en || [],

        // 모든 다국어 버전 명시적으로 저장
        name_original: festival.name_original || null,
        name_ko: festival.name_ko || null,
        name_en: festival.name_en || null,
        name_local: festival.name_local || festival.name_original || null, 
        
        summary_original: festival.summary_original || null,
        summary_ko: festival.summary_ko || null,
        summary_en: festival.summary_en || null,
        
        description_original: festival.description_original || null,
        description_ko: festival.description_ko || null,
        description_en: festival.description_en || null,
        
        highlights_original: festival.highlights_original || [],
        highlights_ko: festival.highlights_ko || [],
        highlights_en: festival.highlights_en || [],
        
        opening_hours_ko: festival.opening_hours_ko || null,
        opening_hours_en: festival.opening_hours_en || null,
        
        access_info_ko: festival.access_info_ko || null,
        access_info_en: festival.access_info_en || null,
        
        parking_info_ko: festival.parking_info_ko || null,
        parking_info_en: festival.parking_info_en || null,
        
        restrictions_original: festival.restrictions_original || [],
        restrictions_ko: festival.restrictions_ko || [],
        restrictions_en: festival.restrictions_en || [],
        
        recommendations_original: festival.recommendations_original || [],
        recommendations_ko: festival.recommendations_ko || [],
        recommendations_en: festival.recommendations_en || [],
        
        original_language: festival.original_language,

        // 나머지 필드들
        country: festival.city?.includes('나고야') || festival.city?.includes('오사카') || festival.city?.includes('도쿄') ? '일본' : '일본',
        city: festival.city,
        location: festival.location,
        category: festival.category,
        start_date: festival.start_date,
        end_date: festival.end_date,
        date_status: festival.date_status || 'confirmed',
        latitude: festival.latitude,
        longitude: festival.longitude,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
        media_urls: processedMediaUrls,
        website: websiteUrl,
        price: festival.price || 0,
        price_details: festival.price_details || null,
        organizer: festival.organizer || null,
        contact: festival.contact || null,
        social_media: socialMedia,
        schedule: festival.schedule || [],
        lineup: festival.lineup || [],
        nearby_attractions: festival.nearby_attractions || [],
        tags: festival.tags || [],
        expected_visitors: festival.expected_visitors || null,
        star_rating: 0,
        likes_count: 0,
        catches_count: 0,
        _metadata: {
          date_status: festival.date_status || 'confirmed',
          date_confidence: festival.date_confidence || 0,
          date_source: festival.date_source || 'unknown',
          video_validation: videoValidationResult,
          source_url: url,
          extracted_at: new Date().toISOString(),
          extracted_date_info: extractedDateInfo,
        }
      };
    });

    // UrlExtractionRawData 엔티티에 저장
    const savedRecords = [];
    for (const festival of festivals) {
      try {
        const rawRecord = await base44.asServiceRole.entities.UrlExtractionRawData.create({
          source_url: url,
          raw_extraction_json: JSON.stringify(extraction),
          extracted_data: festival,
          processing_status: 'pending',
          extraction_metadata: {
            date_info_found: extractedDateInfo.length,
            date_info: extractedDateInfo,
            html_youtube_urls_found: extractedYoutubeUrls.length,
            extracted_at: new Date().toISOString()
          }
        });
        savedRecords.push(rawRecord);
        console.log(`Saved UrlExtractionRawData record: ${rawRecord.id}`);
      } catch (saveError) {
        console.error('Failed to save raw data:', saveError);
      }
    }

    return Response.json({
      success: true,
      source_url: url,
      festivals_found: festivals.length,
      raw_records_saved: savedRecords.length,
      message: `${festivals.length}개의 축제 정보를 추출하여 저장했습니다. 이제 데이터 관리 탭에서 변환할 수 있습니다.`,
      extraction_quality: {
        date_info_found: extractedDateInfo.length,
        date_info: extractedDateInfo,
        date_confidence: festivals[0]?._metadata?.date_confidence || 0,
        date_source: festivals[0]?._metadata?.date_source || 'unknown',
        date_status: festivals[0]?.date_status || 'confirmed',
        video_found: festivals[0]?.video_url ? true : false,
        video_validation: festivals[0]?._metadata?.video_validation,
        html_youtube_urls_found: extractedYoutubeUrls.length,
        multilingual_check: {
          description_ko_length: festivals[0]?.description_ko?.length || 0,
          description_en_length: festivals[0]?.description_en?.length || 0,
          description_original_length: festivals[0]?.description_original?.length || 0,
        }
      }
    });

  } catch (error) {
    console.error('Extraction error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다',
      message: '다시 시도해주세요.',
      details: error.toString()
    }, { status: 500 });
  }
});