import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

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

    // 운영시간과 주소를 DOM에서 직접 추출
    const extractOpeningHoursAndAddress = async (htmlContent) => {
      try {
        const { DOMParser } = await import('https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts');
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        
        let openingHours = null;
        let address = null;

        // 운영시간 추출: <i class="fas fa-2x fa-clock"></i> 다음의 <p> 태그
        const clockIcons = doc.querySelectorAll('i.fa-clock');
        for (const icon of clockIcons) {
          let nextElement = icon.parentElement?.nextElementSibling;
          while (nextElement) {
            if (nextElement.tagName === 'P') {
              const text = nextElement.textContent?.trim();
              if (text && text.includes(':')) {
                openingHours = text;
                console.log(`[Japantravel] ✅ Extracted opening hours: ${openingHours}`);
                break;
              }
            }
            nextElement = nextElement.nextElementSibling;
          }
          if (openingHours) break;
        }

        // 주소 추출: <div class="address event col-xs-12" title="Address"> 안의 <p> 태그
        const addressDiv = doc.querySelector('div.address.event[title="Address"]');
        if (addressDiv) {
          const addressP = addressDiv.querySelector('p');
          if (addressP) {
            // 텍스트만 추출 (링크 제외)
            let addressText = '';
            for (const node of addressP.childNodes) {
              if (node.nodeType === 3) { // Text node
                addressText += node.textContent;
              }
            }
            address = addressText.trim().replace(/\s+/g, ' ');
            console.log(`[Japantravel] ✅ Extracted address: ${address}`);
          }
        }

        return { openingHours, address };
      } catch (domError) {
        console.error('[Japantravel] DOM parsing error for hours/address:', domError);
        return { openingHours: null, address: null };
      }
    };

    const extractedInfo = await extractOpeningHoursAndAddress(html);
    console.log(`[Japantravel] Extracted info:`, {
      openingHours: extractedInfo.openingHours || 'not found',
      address: extractedInfo.address || 'not found'
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
          
          **🎯 추출 규칙 (매우 중요!):**
          
          1. **정보 컨테이너 우선순위:**
             - 모든 중요한 축제 정보는 `<div id="info" class="info row">` 태그 내에 있을 가능성이 높습니다. 이 컨테이너 내부의 정보를 우선적으로 분석하여 데이터를 추출하세요.

          2. **카테고리 (Category) - 우선 추출:**
             - `<ul class="separated-list context-heading-list">` 태그를 찾으세요.
             - 그 안의 4번째 `<li class="separated-list-item">` (index 3)의 텍스트를 `category` 필드에 저장하세요.
             - 예: Activities, Food & Drink, Nature, Culture 등

          3. **🔥 운영시간 (Opening Hours) - DOM 추출 값 사용:**
             - 위에 "DOM에서 직접 추출한 정보"에 운영시간이 있다면, 그 값을 **반드시 그대로** `opening_hours_original` 필드에 사용하세요.
             - 수정하거나 재작성하지 마세요. 원본 형식 그대로 (예: "Time: 21:30 - 00:10")

          4. **🔥 주소 (Address) - DOM 추출 값 사용:**
             - 위에 "DOM에서 직접 추출한 정보"에 주소가 있다면, 그 값을 **반드시 그대로** `access_info_original` 필드에 사용하세요.
             - 수정하거나 재작성하지 마세요. 정확한 주소 형식 그대로 (예: "2 Chome-8-1 Nishishinjuku, Shinjuku City, Tokyo 163-8001, Japan")

          5. **원본 언어 감지:**
             - 웹페이지의 주요 텍스트가 어떤 언어로 작성되었는지 감지하세요.
             - original_language 필드에 언어 코드 저장 (ja=일본어, ko=한국어, en=영어, zh=중국어, th=태국어 등).
          
          4. **텍스트 필드 (_original 접미사):**
             - name_original, summary_original, description_original, highlights_original, restrictions_original, recommendations_original, opening_hours_original, parking_info_original
             - **웹페이지의 원본 언어 텍스트를 그대로** 추출해야 합니다.
             - **절대 번역하거나 요약하지 마세요!**
             - description_original은 웹페이지의 축제 소개 전체 내용을 100% 원문 그대로 복사 (최소 10문장 이상, 문단 구분은 \\n\\n 사용).
          
          3. **URL 필드:**
             - thumbnail_url, video_url, website, social_media
             - 유효한 URL만 추출하고, 필요한 경우 절대 경로로 정규화하세요.
             - video_url은 재생 가능한 YouTube URL만 추출합니다.
          
          4. **날짜:**
             - 아래에 제시된 **HTML에서 추출한 날짜 정보를 최우선으로 사용**하여 정확한 YYYY-MM-DD 형식으로 추출합니다.
             - 날짜 정보가 명확하지 않으면 date_status를 "tentative" 또는 "estimated"로 설정합니다.
             
          5. **기타 필드:**
             - country, city, category, price, organizer, contact, schedule, lineup, nearby_attractions, tags, expected_visitors
             - 웹페이지에서 해당 정보를 정확히 찾아 추출합니다.
          
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
             - 3개만 추출 (가장 핵심적이고 매력적인 내용)
             - highlights_original, highlights_ko, highlights_en 모두 작성
             - 각 항목 2-3문장으로 알차게 작성
          
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
                  original_language: { type: "string", description: "원본 언어 코드 (ja, ko, en, zh, th 등)" },
                  name_original: { type: "string", description: "축제 이름 (원본 언어)" },
                  summary_original: { type: "string", description: "축제 요약 (원본 언어, 1-2줄)" },
                  description_original: { type: "string", description: "축제 설명 (원본 언어, 웹페이지의 모든 설명 텍스트, 절대 요약 금지, 최소 10문장)" },
                  
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
                  
                  price: { type: "number" },
                  price_details: { type: "string", description: "모든 티켓 종류의 가격 상세 정보" },
                  opening_hours_original: { type: "string", description: "운영 시간 (원본 언어)" },
                  organizer: { type: "string", description: "주최/주관 기관" },
                  contact: {
                    type: "object",
                    properties: {
                      phone: { type: "string" },
                      email: { type: "string" }
                    },
                    description: "연락처 정보"
                  },
                  
                  access_info_original: { type: "string", description: "교통 정보 (원본 언어)" },
                  parking_info_original: { type: "string", description: "주차 정보 (원본 언어)" },
                  
                  restrictions_original: { type: "array", items: { type: "string" }, description: "금지사항/주의사항 (원본 언어)" },
                  recommendations_original: { type: "array", items: { type: "string" }, description: "추천 복장/준비물 (원본 언어)" },
                  
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
                  
                  thumbnail_url: { type: "string", description: "썸네일 이미지 URL" },
                  video_url: { type: "string", description: "유효한 YouTube URL만, 없으면 빈 문자열" },
                  image_gallery_urls: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        originimgurl: { type: "string" },
                        smallimageurl: { type: "string" },
                        imgname: { type: "string" }
                      }
                    },
                    description: "이미지 갤러리 URL 목록"
                  },
                  highlights_original: { type: "array", items: { type: "string" }, description: "하이라이트 포인트 (원본 언어)" },
                  
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

      // image_gallery_urls 구성 (originimgurl, smallimageurl, imgname 형식)
      const imageGalleryUrls = [];
      
      // 1. 썸네일 이미지를 맨 앞에 추가 (메인 이미지)
      if (extractedImages.thumbnail) {
        const normalizedThumbnail = normalizeUrl(extractedImages.thumbnail, url);
        imageGalleryUrls.push({
          originimgurl: normalizedThumbnail,
          smallimageurl: normalizedThumbnail,
          imgname: `${festival.name_original || 'Festival'} - 메인 이미지`
        });
        console.log(`[Japantravel] ✅ Added thumbnail as main image (first in gallery)`);
      }
      
      // 2. CSS 선택자로 추출한 본문 갤러리 이미지 추가
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
        console.log(`[Japantravel] ✅ Added ${extractedImages.gallery.length} content images to gallery`);
      }
      
      console.log(`[Japantravel] Total gallery images: ${imageGalleryUrls.length} (1 thumbnail + ${extractedImages.gallery.length} content)`);
      
      // media_urls는 별도로 관리 (YouTube 영상 등)
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

      console.log(`[Japantravel] Festival "${festival.name_original}" extraction:`, {
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
      console.log(`[Japantravel] Festival "${festival.name_original}" extracted fields:`, {
        original_language: festival.original_language,
        description_original_length: festival.description_original?.length || 0,
        summary_original: festival.summary_original?.substring(0, 50),
      });

      return {
        source_url: url,
        original_language: festival.original_language,
        name_original: festival.name_original || null,
        summary_original: festival.summary_original || null,
        description_original: festival.description_original || null,
        country: countryFromSource,
        city: festival.city || null,
        category: festival.category || null,
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
        opening_hours_original: festival.opening_hours_original || null,
        access_info_original: festival.access_info_original || null,
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

    // JapantravelUrlExtractionRawData 엔티티에 저장 (중복 시 업데이트)
    const savedRecords = [];
    for (const festival of festivals) {
      try {
        // 동일한 축제명이 이미 있는지 확인
        const existingRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
          name_original: festival.name_original
        });
        
        let rawRecord;
        if (existingRecords && existingRecords.length > 0) {
          // 기존 레코드 업데이트
          const existingRecord = existingRecords[0];
          rawRecord = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(
            existingRecord.id, 
            festival
          );
          console.log(`[Japantravel] ✅ Updated existing record: ${rawRecord.id} (${festival.name_original})`);
        } else {
          // 새 레코드 생성
          rawRecord = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.create(festival);
          console.log(`[Japantravel] ✅ Created new record: ${rawRecord.id} (${festival.name_original})`);
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
        original_data_check: {
          description_original_length: festivals[0]?.description_original?.length || 0,
          summary_original_length: festivals[0]?.summary_original?.length || 0,
        },
        css_image_extraction: {
          thumbnail_extracted: extractedImages.thumbnail ? true : false,
          gallery_images_count: extractedImages.gallery.length
        }
      }
    });

  } catch (error) {
    console.error('[Japantravel] Extraction error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다',
      message: '다시 시도해주세요.',
      details: error.toString()
    }, { status: 500 });
  }
});