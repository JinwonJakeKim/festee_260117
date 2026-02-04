import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { url, rawDataId, imageSelectors } = await req.json();
    
    if (!url) {
      return Response.json({ 
        success: false,
        error: 'URL is required' 
      }, { status: 400 });
    }

    // 기본 이미지 선택자 설정
    const imgSelectors = imageSelectors || {
      thumbnail_selector: "div.coverphoto figure.coverImgWrapper img",
      thumbnail_attribute: "src",
      content_image_selector: "div.article__content figure.shortcode-photo img",
      content_image_attribute: "data-src"
    };
    
    console.log(`[Japantravel] Using image selectors:`, imgSelectors);

    console.log(`[Japantravel] Fetching content from: ${url}`);

    // japantravel.com은 항상 Japan으로 설정
    let countryFromSource = 'Japan';
    const urlHost = new URL(url).hostname.toLowerCase();
    if (urlHost.includes('japantravel.com')) {
      console.log(`japantravel.com detected, setting country: Japan`);
    } else {
      console.warn(`⚠️ Non-japantravel.com URL detected: ${urlHost}`);
    }

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
      
      console.log(`[Japantravel] Content fetched (${html.length} chars)`);
    } catch (fetchError) {
      console.error('[Japantravel] Fetch error:', fetchError);
      
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

    // HTML에서 직접 날짜 정보 추출 (japantravel.com 특화)
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
    console.log(`[Japantravel] Extracted YouTube URLs from HTML:`, extractedYoutubeUrls);

    const extractedDateInfo = extractDateInfo(html);
    console.log(`[Japantravel] Extracted date information from HTML:`, extractedDateInfo);

    // CSS 선택자로 이미지 직접 추출
    const extractImagesWithSelectors = async (htmlContent, selectors) => {
      try {
        const { DOMParser } = await import('https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts');
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        
        const images = {
          thumbnail: null,
          gallery: []
        };

        // 썸네일 이미지 추출
        if (selectors.thumbnail_selector && selectors.thumbnail_attribute) {
          const thumbnailElement = doc.querySelector(selectors.thumbnail_selector);
          if (thumbnailElement) {
            const thumbnailUrl = thumbnailElement.getAttribute(selectors.thumbnail_attribute);
            if (thumbnailUrl) {
              images.thumbnail = thumbnailUrl;
              console.log(`[Japantravel] ✅ Extracted thumbnail via CSS: ${thumbnailUrl}`);
            }
          }
        }

        // 본문 이미지들 추출
        if (selectors.content_image_selector && selectors.content_image_attribute) {
          const contentImages = doc.querySelectorAll(selectors.content_image_selector);
          contentImages.forEach((img, index) => {
            const imgUrl = img.getAttribute(selectors.content_image_attribute) || img.getAttribute('src');
            if (imgUrl) {
              images.gallery.push({
                originimgurl: imgUrl,
                smallimageurl: imgUrl,
                imgname: `Gallery Image ${index + 1}`
              });
            }
          });
          console.log(`[Japantravel] ✅ Extracted ${images.gallery.length} content images via CSS`);
        }

        return images;
      } catch (domError) {
        console.error('[Japantravel] DOM parsing error:', domError);
        return { thumbnail: null, gallery: [] };
      }
    };

    const extractedImages = await extractImagesWithSelectors(html, imgSelectors);
    console.log(`[Japantravel] CSS-extracted images:`, {
      thumbnail: extractedImages.thumbnail ? '✓' : '✗',
      gallery_count: extractedImages.gallery.length
    });

    // 운영시간, 주소, 카테고리를 DOM에서 직접 추출
    const extractStructuredInfo = async (htmlContent) => {
      try {
        const { DOMParser } = await import('https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts');
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        
        let openingHours = null;
        let accessInfo = null;
        let category = null;

        // === 운영시간 추출 (div.sidebar > div.event 내의 Time: 텍스트) ===
        const sidebar = doc.querySelector('div.sidebar');
        if (sidebar) {
          const eventDivs = sidebar.querySelectorAll('div.event');
          for (const eventDiv of eventDivs) {
            const pTag = eventDiv.querySelector('p');
            if (pTag) {
              const text = pTag.textContent?.trim();
              if (text && text.toLowerCase().includes('time:')) {
                openingHours = text.replace(/\s+/g, ' ').trim();
                console.log(`[Japantravel] ✅ Extracted opening hours from sidebar: ${openingHours}`);
                break;
              }
            }
          }
        }

        // === 주소/접근 정보 추출 (div.sidebar > div.address.event[title="Address"]) ===
        if (sidebar) {
          // 우선순위 1: div.address.event[title="Address"] 내의 <p> 태그
          const addressDiv = sidebar.querySelector('div.address.event[title="Address"]');
          if (addressDiv) {
            const addressP = addressDiv.querySelector('p');
            if (addressP) {
              const text = addressP.textContent?.trim();
              if (text && text.length > 10) {
                accessInfo = text.replace(/\s+/g, ' ').trim();
                console.log(`[Japantravel] ✅ Extracted access info from sidebar div.address.event: ${accessInfo}`);
              }
            }
          }

          // 우선순위 2: 일반 div.event 내의 Address 키워드
          if (!accessInfo) {
            const eventDivs = sidebar.querySelectorAll('div.event');
            for (const eventDiv of eventDivs) {
              const pTag = eventDiv.querySelector('p');
              if (pTag) {
                const text = pTag.textContent?.trim();
                // Address, Location, Access 등의 키워드 확인
                if (text && (
                  text.toLowerCase().includes('address:') || 
                  text.toLowerCase().includes('location:') ||
                  text.toLowerCase().includes('access:')
                )) {
                  accessInfo = text.replace(/\s+/g, ' ').trim();
                  console.log(`[Japantravel] ✅ Extracted access info from sidebar div.event: ${accessInfo}`);
                  break;
                }
              }
            }
          }
        }

        // 우선순위 3: div#info에서 찾기 (fallback)
        if (!accessInfo) {
          const infoDiv = doc.querySelector('div#info');
          if (infoDiv) {
            const addressDiv = infoDiv.querySelector('div[title="Address"]');
            if (addressDiv) {
              const addressP = addressDiv.querySelector('p');
              if (addressP) {
                const text = addressP.textContent?.trim();
                if (text && text.length > 10) {
                  accessInfo = text.replace(/\s+/g, ' ').trim();
                  console.log(`[Japantravel] ✅ Extracted access info from div#info: ${accessInfo}`);
                }
              }
            }
          }
        }

        // === 카테고리 추출 (ul.separated-list > li > a[href*="/activity/"]) ===
        const categoryList = doc.querySelector('ul.separated-list.context-heading-list');
        if (categoryList) {
          const links = categoryList.querySelectorAll('li a');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href && href.includes('/activity/')) {
              category = link.textContent?.trim();
              if (category && category !== 'Events') {
                console.log(`[Japantravel] ✅ Extracted category from activity link: ${category}`);
                break;
              }
            }
          }
        }

        return { openingHours, accessInfo, category };
      } catch (domError) {
        console.error('[Japantravel] DOM parsing error:', domError);
        return { openingHours: null, accessInfo: null, category: null };
      }
    };

    const extractedInfo = await extractStructuredInfo(html);
    console.log(`[Japantravel] Extracted structured info:`, {
      openingHours: extractedInfo.openingHours || 'not found',
      accessInfo: extractedInfo.accessInfo || 'not found',
      category: extractedInfo.category || 'not found'
    });

    // HTML 길이를 대폭 늘려서 더 많은 콘텐츠 분석 (50,000 → 100,000자)
    const maxLength = 100000;
    const truncatedHtml = html.length > maxLength ? html.substring(0, maxLength) : html;
    
    console.log(`[Japantravel] Analyzing with LLM (${truncatedHtml.length} chars)...`);

    let extraction;
    try {
      extraction = await base44.integrations.Core.InvokeLLM({
        prompt: `
          다음 japantravel.com 웹페이지에서 축제/이벤트 정보를 매우 상세하게 추출해주세요.
          
          **🔥 DOM에서 직접 추출한 정보 (반드시 사용!):**
          ${extractedInfo.openingHours ? `- 운영시간: "${extractedInfo.openingHours}"` : '- 운영시간: (없음)'}
          ${extractedInfo.accessInfo ? `- 교통/접근 정보: "${extractedInfo.accessInfo}"` : '- 교통/접근 정보: (없음)'}
          ${extractedInfo.category ? `- 카테고리: "${extractedInfo.category}"` : '- 카테고리: (없음)'}
          
          ⚠️ **중요**: 위에 명시된 운영시간, 교통/접근 정보, 카테고리는 DOM에서 정확히 추출한 것입니다. 
          이 값들을 **절대 수정하지 말고 그대로** opening_hours_original, access_info_original, category 필드에 사용하세요!
          
          **🎯 추출 규칙 (매우 중요!):**
          
          1. **카테고리 (Category):**
             - 위에 "DOM에서 직접 추출한 정보"에 카테고리가 있다면, 그 값을 **반드시 그대로** category 필드에 사용하세요.
             - 만약 DOM 추출 값이 없다면, 페이지 내용에서 축제 유형을 찾아 적절한 카테고리를 지정하세요.

          2. **운영시간 (Opening Hours):**
             - 위에 "DOM에서 직접 추출한 정보"에 운영시간이 있다면, 그 값을 **반드시 그대로** opening_hours_original 필드에 사용하세요.
             - 수정하거나 재작성하지 마세요. 원본 형식 그대로 (예: "Time: 21:30 - 00:10")

          3. **교통/접근 정보 (Access Info):**
             - 위에 "DOM에서 직접 추출한 정보"에 교통/접근 정보가 있다면, 그 값을 **반드시 그대로** access_info_original 필드에 사용하세요.
             - 수정하거나 재작성하지 마세요. 정확한 주소 또는 교통 정보 형식 그대로

          4. **원본 언어 감지:**
             - 웹페이지의 주요 텍스트가 어떤 언어로 작성되었는지 감지하세요.
             - original_language 필드에 언어 코드 저장 (ja=일본어, ko=한국어, en=영어, zh=중국어 등).
          
          5. **텍스트 필드 (_original 접미사):**
             - name_original, summary_original, description_original, highlights_original, restrictions_original, recommendations_original
             - **웹페이지의 원본 언어 텍스트를 그대로** 추출해야 합니다.
             - **절대 번역하거나 요약하지 마세요!**
             - description_original은 웹페이지의 축제 소개 전체 내용을 100% 원문 그대로 복사 (최소 10문장 이상, 문단 구분은 \\n\\n 사용).
          
          ${extractedDateInfo.length > 0 ? `
          **🎯 HTML에서 추출한 날짜 정보:**
          ${extractedDateInfo.map(d => `- [${d.source}] ${d.text}`).join('\n')}
          ` : ''}
          
          **날짜 추출 규칙:**
          - HTML에서 추출한 날짜 정보를 최우선으로 사용하여 정확한 YYYY-MM-DD 형식으로 추출합니다.
          - 날짜 정보가 명확하지 않으면 date_status를 "tentative" 또는 "estimated"로 설정합니다.
          
          **영상 추출 규칙:**
          - 실제로 페이지에 임베드되어 재생 가능한 YouTube URL만 추출하세요.
          - video_url 필드: 실제로 재생 가능한 첫 번째 YouTube URL만 넣으세요.
          
          **텍스트 수집 규칙:**
          - description_original: 웹페이지의 축제 설명 전체를 100% 원문 그대로 복사 (절대 요약 금지!)
          - 최소 10문장 이상, 문단 구분 \\n\\n 사용
          
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
                  original_language: { type: "string" },
                  name_original: { type: "string" },
                  summary_original: { type: "string" },
                  description_original: { type: "string" },
                  start_date: { type: "string" },
                  end_date: { type: "string" },
                  date_status: { 
                    type: "string", 
                    enum: ["confirmed", "tentative", "estimated"]
                  },
                  date_confidence: { type: "number" },
                  date_source: { type: "string" },
                  city: { type: "string" },
                  location: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  category: { type: "string" },
                  price: { type: "number" },
                  price_details: { type: "string" },
                  opening_hours_original: { type: "string" },
                  organizer: { type: "string" },
                  contact: {
                    type: "object",
                    properties: {
                      phone: { type: "string" },
                      email: { type: "string" }
                    }
                  },
                  access_info_original: { type: "string" },
                  parking_info_original: { type: "string" },
                  restrictions_original: { type: "array", items: { type: "string" } },
                  recommendations_original: { type: "array", items: { type: "string" } },
                  website: { type: "string" },
                  social_media: {
                    type: "object",
                    properties: {
                      facebook: { type: "string" },
                      instagram: { type: "string" },
                      twitter: { type: "string" },
                      youtube: { type: "string" }
                    }
                  },
                  thumbnail_url: { type: "string" },
                  video_url: { type: "string" },
                  image_gallery_urls: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        originimgurl: { type: "string" },
                        smallimageurl: { type: "string" },
                        imgname: { type: "string" }
                      }
                    }
                  },
                  highlights_original: { type: "array", items: { type: "string" } },
                  schedule: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        time: { type: "string" },
                        activity: { type: "string" },
                        location: { type: "string" }
                      }
                    }
                  },
                  lineup: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        artists: { 
                          type: "array", 
                          items: { type: "string" }
                        }
                      }
                    }
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
                    }
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" }
                  },
                  expected_visitors: { type: "number" }
                }
              }
            }
          }
        }
      });
    } catch (llmError) {
      console.error('[Japantravel] LLM error:', llmError);
      return Response.json({
        success: false,
        error: 'AI 분석 중 오류가 발생했습니다',
        message: llmError.message || '다시 시도해주세요.'
      });
    }

    console.log(`[Japantravel] Extraction completed, found ${extraction.festivals?.length || 0} festivals`);

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

      // CSS 선택자로 추출한 썸네일을 최우선으로 사용
      let thumbnailUrl = extractedImages.thumbnail 
        ? normalizeUrl(extractedImages.thumbnail, url)
        : festival.image_url;
      
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

      // image_gallery_urls 구성
      const imageGalleryUrls = [];
      
      if (extractedImages.thumbnail) {
        const normalizedThumbnail = normalizeUrl(extractedImages.thumbnail, url);
        imageGalleryUrls.push({
          originimgurl: normalizedThumbnail,
          smallimageurl: normalizedThumbnail,
          imgname: `${festival.name_original || 'Festival'} - 메인 이미지`
        });
      }
      
      if (extractedImages.gallery && extractedImages.gallery.length > 0) {
        extractedImages.gallery.forEach((img) => {
          const normalizedUrl = normalizeUrl(img.originimgurl, url);
          if (normalizedUrl !== thumbnailUrl && !imageGalleryUrls.some(g => g.originimgurl === normalizedUrl)) {
            imageGalleryUrls.push({
              originimgurl: normalizedUrl,
              smallimageurl: normalizedUrl,
              imgname: img.imgname || `${festival.name_original} - 이미지`
            });
          }
        });
      }
      
      let mediaUrlsArray = festival.media_urls || [];
      
      if (!videoUrl && extractedYoutubeUrls.length > 0) {
        extractedYoutubeUrls.forEach((ytUrl, idx) => {
          const normalizedYtUrl = normalizeUrl(ytUrl, url);
          if (isValidYoutubeUrl(normalizedYtUrl)) {
            const videoId = extractYoutubeVideoId(normalizedYtUrl);
            if (videoId) {
              const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
              if (idx === 0 && !videoUrl) {
                videoUrl = cleanUrl;
                videoValidationResult = { isValid: true, videoId: videoId, source: "HTML extraction" };
              } else {
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
            return null;
          }
          
          if (media.type === 'youtube') {
            if (isValidYoutubeUrl(normalizedMediaUrl)) {
              const videoId = extractYoutubeVideoId(normalizedMediaUrl);
              if (videoId) {
                normalizedMediaUrl = `https://www.youtube.com/watch?v=${videoId}`;
              } else {
                return null;
              }
            } else {
              return null;
            }
          }
          
          return { ...media, url: normalizedMediaUrl };
        })
        .filter(item => item !== null);

      const websiteUrl = festival.website ? normalizeUrl(festival.website, url) : url;

      const socialMedia = festival.social_media ? {
        facebook: festival.social_media.facebook ? normalizeUrl(festival.social_media.facebook, url) : null,
        instagram: festival.social_media.instagram ? normalizeUrl(festival.social_media.instagram, url) : null,
        twitter: festival.social_media.twitter ? normalizeUrl(festival.social_media.twitter, url) : null,
        youtube: festival.social_media.youtube ? normalizeUrl(festival.social_media.youtube, url) : null,
      } : null;

      return {
        source_url: url,
        original_language: festival.original_language,
        name_original: festival.name_original || null,
        summary_original: festival.summary_original || null,
        description_original: festival.description_original || null,
        country: countryFromSource,
        city: festival.city || null,
        category: extractedInfo.category || festival.category || null,
        start_date: festival.start_date,
        end_date: festival.end_date,
        date_status: festival.date_status || 'confirmed',
        latitude: festival.latitude || null,
        longitude: festival.longitude || null,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
        image_gallery_urls: imageGalleryUrls,
        website: websiteUrl,
        price: festival.price || 0,
        price_details: festival.price_details || null,
        opening_hours_original: extractedInfo.openingHours || festival.opening_hours_original || null,
        access_info_original: extractedInfo.accessInfo || festival.access_info_original || null,
        parking_info_original: festival.parking_info_original || null,
        organizer: festival.organizer || null,
        contact: festival.contact || null,
        social_media: socialMedia,
        highlights_original: festival.highlights_original || [],
        restrictions_original: festival.restrictions_original || [],
        recommendations_original: festival.recommendations_original || [],
        schedule: festival.schedule || [],
        lineup: festival.lineup || [],
        nearby_attractions: festival.nearby_attractions || [],
        tags: festival.tags || [],
        expected_visitors: festival.expected_visitors || null,
        processing_status: 'pending',
        festival_id: null,
        error_message: null,
        extraction_metadata: {
          date_status: festival.date_status || 'confirmed',
          date_confidence: festival.date_confidence || 0,
          date_source: festival.date_source || 'unknown',
          video_validation: videoValidationResult,
          extracted_at: new Date().toISOString(),
          extracted_date_info: extractedDateInfo,
        }
      };
    });

    // JapantravelUrlExtractionRawData 엔티티에 저장
    const savedRecords = [];
    for (const festival of festivals) {
      try {
        const existingRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
          name_original: festival.name_original
        });
        
        let rawRecord;
        if (existingRecords && existingRecords.length > 0) {
          const existingRecord = existingRecords[0];
          rawRecord = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(
            existingRecord.id, 
            festival
          );
          console.log(`[Japantravel] ✅ Updated existing record: ${rawRecord.id}`);
        } else {
          rawRecord = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.create(festival);
          console.log(`[Japantravel] ✅ Created new record: ${rawRecord.id}`);
        }
        
        savedRecords.push(rawRecord);
      } catch (saveError) {
        console.error('[Japantravel] Failed to save/update raw data:', saveError);
      }
    }

    return Response.json({
      success: true,
      source_url: url,
      festivals_found: festivals.length,
      raw_records_saved: savedRecords.length,
      message: `${festivals.length}개의 축제 정보를 추출하여 저장했습니다.`,
      extraction_quality: {
        date_info_found: extractedDateInfo.length,
        category_extracted: extractedInfo.category ? true : false,
        opening_hours_extracted: extractedInfo.openingHours ? true : false,
        access_info_extracted: extractedInfo.accessInfo ? true : false
      }
    });

  } catch (error) {
    console.error('[Japantravel] Extraction error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다',
      message: '다시 시도해주세요.'
    }, { status: 500 });
  }
});