import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import moment from 'npm:moment';

Deno.serve(async (req) => {
  let url = ''; // 최상위 스코프에 선언하여 catch 블록에서도 접근 가능
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const requestData = await req.json();
    url = requestData.url;
    const { rawDataId, imageSelectors } = requestData;
    
    // 다양한 실제 브라우저 User-Agent 배열
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    ];
    
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    if (!url) {
      return Response.json({ 
        success: false,
        error: 'URL is required' 
      }, { status: 400 });
    }

    const imgSelectors = imageSelectors || {
      thumbnail_selector: "div.coverphoto.hidden-xs img.img-responsive",
      thumbnail_attribute: "src",
      content_image_selector: "div.article__content figure.shortcode-photo img",
      content_image_attribute: "data-src"
    };
    
    console.log(`[Japantravel] Fetching content from: ${url}`);

    // japantravel.com은 항상 Japan으로 설정
    let countryFromSource = 'Japan';
    const urlObj = new URL(url);
    const urlHost = urlObj.hostname.toLowerCase();

    // URL에서 언어 코드 감지
    let detectedLanguageFromUrl = null;
    const languageMatch = urlHost.match(/^([a-z]{2})\.japantravel\.com$/);
    if (languageMatch) {
      detectedLanguageFromUrl = languageMatch[1];
      console.log(`[Japantravel] Detected language from URL: ${detectedLanguageFromUrl}`);
    } else if (urlHost === 'japantravel.com' || urlHost === 'www.japantravel.com') {
      detectedLanguageFromUrl = 'en';
      console.log(`[Japantravel] No language subdomain, defaulting to: en`);
    }

    // HTML 가져오기
    let html;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': randomUserAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://www.japantravel.com/',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
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

    // DOM 파서 초기화
    const { DOMParser } = await import('https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // ===== 축제명 추출 =====
    let festivalName = '';
    const h1Title = doc.querySelector('h1');
    if (h1Title) {
      festivalName = h1Title.textContent?.trim() || '';
    }
    console.log(`[Japantravel] Festival name: ${festivalName}`);

    // ===== 요약 추출 (meta description) =====
    let summary = '';
    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc) {
      summary = metaDesc.getAttribute('content')?.trim() || '';
    }
    console.log(`[Japantravel] Summary length: ${summary.length}`);

    // ===== 설명 추출 (article__content의 모든 p 태그 텍스트) =====
    let description = '';
    const contentDiv = doc.querySelector('div.article__content');
    if (contentDiv) {
      const paragraphs = contentDiv.querySelectorAll('p');
      const textParts = [];
      paragraphs.forEach(p => {
        const text = p.textContent?.trim();
        if (text && text.length > 10) {
          textParts.push(text);
        }
      });
      description = textParts.join('\n\n');
    }
    console.log(`[Japantravel] Description length: ${description.length}`);

    // ===== 날짜 정보 추출 및 파싱 =====
    let startDate = null;
    let endDate = null;
    let dateStatus = 'tentative'; // 기본값

    // div#info 안의 모든 .event 요소를 순회하며 날짜 찾기
    const infoDiv = doc.querySelector('div#info');
    if (infoDiv) {
      const eventDivs = infoDiv.querySelectorAll('div.event.col-xs-12');
      for (const eventDiv of eventDivs) {
        // 이 div에 calendar 아이콘이 있는지 확인
        const calendarIcon = eventDiv.querySelector('i.fa-calendar-alt');
        if (calendarIcon) {
          const dateParagraph = eventDiv.querySelector('p');
          if (dateParagraph) {
            const dateString = dateParagraph.textContent?.trim() || '';
            console.log(`[Japantravel] Raw date string from DOM: "${dateString}"`);

            // 패턴 1: "April 8th - April 30th 2026" 또는 "April 8th - 30th 2026" 형식 (구체적인 날짜)
            const dateRangeRegex = /(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:(?:\s*-\s*)(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\s+(\d{4})/;
            let match = dateString.match(dateRangeRegex);

            if (match) {
              const startMonthText = match[1];
              const startDay = parseInt(match[2]);
              const endMonthText = match[3] || startMonthText;
              const endDay = match[4] ? parseInt(match[4]) : startDay;
              const year = parseInt(match[5]);

              if (startMonthText && startDay && year) {
                const startMoment = moment(`${startMonthText} ${startDay} ${year}`, "MMMM D YYYY");
                if (startMoment.isValid()) {
                  startDate = startMoment.format("YYYY-MM-DD");
                }
              }

              if (endMonthText && endDay && year) {
                const endMoment = moment(`${endMonthText} ${endDay} ${year}`, "MMMM D YYYY");
                if (endMoment.isValid()) {
                  endDate = endMoment.format("YYYY-MM-DD");
                }
              }

              if (startDate && endDate) {
                dateStatus = 'confirmed';
              }
            }
            // 패턴 2: "Early - Late April 2026" (월 전체 기간 추정)
            else {
              const earlyLatePattern = /(?:early|late|beginning|end)\s*-\s*(?:early|late|beginning|end)\s+(\w+)\s+(\d{4})/i;
              match = dateString.match(earlyLatePattern);

              if (match) {
                const monthText = match[1];
                const year = parseInt(match[2]);
                const monthMoment = moment(`${monthText} 1 ${year}`, "MMMM D YYYY");

                if (monthMoment.isValid()) {
                  startDate = monthMoment.startOf('month').format("YYYY-MM-DD");
                  endDate = monthMoment.endOf('month').format("YYYY-MM-DD");
                  dateStatus = 'estimated';
                  console.log(`[Japantravel] Parsed as early-late pattern: ${startDate} to ${endDate}`);
                }
              }
              // 패턴 3: "Mid-April 2026" 또는 "Mid April 2026" (월 중순 추정)
              else {
                const midPattern = /mid[\s-]?(\w+)\s+(\d{4})/i;
                match = dateString.match(midPattern);

                if (match) {
                  const monthText = match[1];
                  const year = parseInt(match[2]);
                  const monthMoment = moment(`${monthText} 15 ${year}`, "MMMM D YYYY");

                  if (monthMoment.isValid()) {
                    startDate = monthMoment.clone().subtract(5, 'days').format("YYYY-MM-DD");
                    endDate = monthMoment.clone().add(5, 'days').format("YYYY-MM-DD");
                    dateStatus = 'estimated';
                    console.log(`[Japantravel] Parsed as mid pattern: ${startDate} to ${endDate}`);
                  }
                }
                // 패턴 4: "April 2026" (월만 지정, 월 전체 기간)
                else {
                  const monthOnlyPattern = /^(\w+)\s+(\d{4})$/i;
                  match = dateString.match(monthOnlyPattern);

                  if (match) {
                    const monthText = match[1];
                    const year = parseInt(match[2]);
                    const monthMoment = moment(`${monthText} 1 ${year}`, "MMMM D YYYY");

                    if (monthMoment.isValid()) {
                      startDate = monthMoment.startOf('month').format("YYYY-MM-DD");
                      endDate = monthMoment.endOf('month').format("YYYY-MM-DD");
                      dateStatus = 'estimated';
                      console.log(`[Japantravel] Parsed as month-only pattern: ${startDate} to ${endDate}`);
                    }
                  }
                }
              }
            }

            // 원본 문자열에서 'tentative' 또는 'estimated' 키워드 추가 확인
            if (dateString.toLowerCase().includes('tentative')) {
              dateStatus = 'tentative';
            } else if (dateString.toLowerCase().includes('estimated')) {
              dateStatus = 'estimated';
            }

            break; // 날짜를 찾았으면 더 이상 검색하지 않음
          }
        }
      }
    }
    console.log(`[Japantravel] Parsed dates: Start=${startDate}, End=${endDate}, Status=${dateStatus}`);

    // ===== 도시, 카테고리, 주소, 운영시간, 가격 추출 (기존 extractStructuredInfo 활용) =====
    const extractStructuredInfo = async (htmlContent, doc) => {
      let openingHours = null;
      let accessInfo = null;
      let category = null;
      let city = null;
      let priceYen = null;
      let priceDetails = null;

      const infoDiv = doc.querySelector('div#info');
      const categoryList = doc.querySelector('ul.separated-list.context-heading-list');
      
      // 가격 정보 추출
      if (infoDiv) {
        const eventDivs = infoDiv.querySelectorAll('div.event');
        for (const eventDiv of eventDivs) {
          const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          
          const yenPattern = /¥\s*([\d,]+)/;
          let match = eventDivText.match(yenPattern);
          
          if (match && match[1]) {
            const numericPrice = parseInt(match[1].replace(/,/g, ''));
            if (!isNaN(numericPrice) && numericPrice > 0) {
              priceYen = numericPrice;
              priceDetails = eventDivText;
              break;
            }
          }
        }
      }

      // 운영시간 추출
      if (infoDiv) {
        const eventDivs = infoDiv.querySelectorAll('div.event');
        for (const eventDiv of eventDivs) {
          const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          const keywordTimePattern = /(?:시간|time|duration|營業時間|開催時間)\s*:\s*(.+)/i;
          let match = eventDivText.match(keywordTimePattern);

          if (match && match[1]) {
            openingHours = match[1].trim();
            break;
          }
        }
      }

      // 주소 정보 추출 - 가장 구체적인 패턴부터 우선 순위로 시도
      if (infoDiv) {
        const eventDivs = infoDiv.querySelectorAll('div.event');

        // 우선순위 1: "Address:", "Location:", "Venue:" 등 명확한 키워드
        for (const eventDiv of eventDivs) {
          const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          const keywordPattern = /(?:address|location|venue|場所|住所)\s*[:：]\s*(.+)/i;
          const match = eventDivText.match(keywordPattern);

          if (match && match[1] && match[1].length > 10) {
            accessInfo = match[1].trim();
            console.log(`[Japantravel] ✅ Extracted address (keyword pattern): ${accessInfo}`);
            break;
          }
        }

        // 우선순위 2: 우편번호와 주소 구성요소를 모두 포함하는 완전한 일본 주소
        if (!accessInfo) {
          for (const eventDiv of eventDivs) {
            const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
            const fullAddressPattern = /(\d{3}[\-\s]?\d{4}[,\s]+[\w\-,\s]+(?:都|府|県)[,\s]+[\w\-,\s]+(?:市|区|町|村)[\w\-,\s]*)/i;
            const match = eventDivText.match(fullAddressPattern);

            if (match && match[1] && match[1].length > 20) {
              accessInfo = match[1].trim();
              console.log(`[Japantravel] ✅ Extracted address (full address with postal): ${accessInfo}`);
              break;
            }
          }
        }

        // 우선순위 3: Prefecture/都/府/県으로 끝나는 주소 패턴
        if (!accessInfo) {
          for (const eventDiv of eventDivs) {
            const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
            const prefecturePattern = /(\d+[\s\-][\w\-,\s]+(?:Prefecture|都|府|県))/i;
            const match = eventDivText.match(prefecturePattern);

            if (match && match[1] && match[1].length > 15) {
              accessInfo = match[1].trim();
              console.log(`[Japantravel] ✅ Extracted address (prefecture pattern): ${accessInfo}`);
              break;
            }
          }
        }

        // 우선순위 4: 숫자로 시작하고 쉼표로 구분되는 긴 문자열 (전화번호/웹사이트 등 제외)
        if (!accessInfo) {
          for (const eventDiv of eventDivs) {
            const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();

            // 제외할 키워드 패턴
            const excludeKeywords = /(?:tel|phone|website|email|www\.|http|@|opening|hours|price|¥)/i;

            if (!excludeKeywords.test(eventDivText)) {
              const longStringPattern = /(\d+[\s\-,][\w\-,\s]{25,})/i;
              const match = eventDivText.match(longStringPattern);

              if (match && match[1]) {
                accessInfo = match[1].trim();
                console.log(`[Japantravel] ✅ Extracted address (long string pattern): ${accessInfo}`);
                break;
              }
            }
          }
        }
      }

      // 도시 추출 - 방법 1: breadcrumb 링크에서 직접 추출
      if (categoryList) {
        const links = categoryList.querySelectorAll('li > span.context-heading > a');
        for (const link of links) {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();

          // URL 패턴: /도시명 (예: /toyama, /tokyo)
          const cityUrlPattern = /^https?:\/\/[^\/]+\/([^\/]+)\/?$/;
          const match = href?.match(cityUrlPattern);
          
          if (match && match[1] && text && text.length > 0 && text.length < 30) {
            // 제외할 키워드 (카테고리/일반 페이지)
            const excludeKeywords = ['events', 'activities', 'culture', 'food', 'nature', 'activity', 'history', 'art', 'festival', 'sports', 'nightlife', 'shopping', 'beauty', 'spa'];
            const isNotCategory = !excludeKeywords.some(keyword => 
              text.toLowerCase().includes(keyword) || match[1].toLowerCase().includes(keyword)
            );
            
            if (isNotCategory) {
              city = text;
              console.log(`[Japantravel] ✅ Extracted city from breadcrumb: ${city}`);
              break;
            }
          }
        }
      }
      
      // 도시 추출 - 방법 2: 주소 정보에서 "City" 패턴 추출 (백업)
      if (!city && infoDiv) {
        const eventDivs = infoDiv.querySelectorAll('div.event');
        for (const eventDiv of eventDivs) {
          const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          
          // "Koto City", "Tokyo City" 같은 패턴 매칭
          const cityNamePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+City/;
          const match = eventDivText.match(cityNamePattern);
          
          if (match && match[1]) {
            city = match[1];
            console.log(`[Japantravel] ✅ Extracted city from address (City pattern): ${city}`);
            break;
          }
        }
      }
      
      // 도시 추출 - 방법 3: URL 패턴에서 추출 (최후 백업)
      if (!city && categoryList) {
          const links = categoryList.querySelectorAll('li > span.context-heading > a');
          for (const link of links) {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();

            const cityPattern = /^https?:\/\/[^\/]+\/([^\/]+)\/[^\/]+\/?$/;
            const match = href?.match(cityPattern);
            
            if (match && match[1] && text && text.length > 0 && text.length < 30) {
              const nonCityKeywords = ['events', 'activities', 'culture', 'food', 'nature', 'activity', 'history', 'art', 'festival', 'sports', 'nightlife', 'shopping', 'beauty', 'spa'];
              const isNotCategory = !nonCityKeywords.some(keyword => 
                text.toLowerCase().includes(keyword) || match[1].toLowerCase().includes(keyword)
              );
              
              if (isNotCategory) {
                city = text;
                console.log(`[Japantravel] ✅ Extracted city from URL pattern: ${city}`);
                break;
              }
            }
          }
        }

      // 카테고리 추출
      if (categoryList) {
        const links = categoryList.querySelectorAll('li > span.context-heading > a');
        for (const link of links) {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();

          if (href && text && text !== 'Events' && text.length < 30) {
            const categoryPatterns = ['/culture/', '/food/', '/nature/', '/activity/', '/history/', '/art/', '/festival/', '/sports/'];
            const hasValidPattern = categoryPatterns.some(pattern => href.includes(pattern));

            if (hasValidPattern) {
              category = text;
              break;
            }
          }
        }
      }

      return { openingHours, accessInfo, category, city, priceYen, priceDetails };
    };

    const extractedInfo = await extractStructuredInfo(html, doc);
    console.log(`[Japantravel] Extracted info:`, extractedInfo);

    // ===== 이미지 추출 =====
    const extractImagesWithSelectors = async (doc, selectors) => {
      const images = {
        thumbnail: null,
        gallery: []
      };

      if (selectors.thumbnail_selector && selectors.thumbnail_attribute) {
        const thumbnailElement = doc.querySelector(selectors.thumbnail_selector);
        if (thumbnailElement) {
          const thumbnailUrl = thumbnailElement.getAttribute(selectors.thumbnail_attribute);
          if (thumbnailUrl) {
            images.thumbnail = thumbnailUrl;
            console.log(`[Japantravel] ✅ Extracted thumbnail: ${thumbnailUrl}`);
          }
        }
      }

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
        console.log(`[Japantravel] ✅ Extracted ${images.gallery.length} gallery images`);
      }

      return images;
    };

    const extractedImages = await extractImagesWithSelectors(doc, imgSelectors);

    // ===== YouTube URL 추출 (HTML에서 직접) =====
    const extractYoutubeUrls = (htmlContent) => {
      const youtubeUrls = [];
      const iframePattern = /<iframe[^>]*src=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["'][^>]*>/gi;
      let match;
      while ((match = iframePattern.exec(htmlContent)) !== null) {
        youtubeUrls.push(match[1]);
      }
      return youtubeUrls;
    };

    const extractedYoutubeUrls = extractYoutubeUrls(html);
    console.log(`[Japantravel] Extracted YouTube URLs: ${extractedYoutubeUrls.length}`);

    // ===== URL 정규화 함수 =====
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
        console.error(`Failed to normalize URL: ${inputUrl}`, e);
      }
      return inputUrl;
    };

    // ===== 썸네일 URL 설정 =====
    // fallback 1: div.coverImgWrapper img (모바일 영역에도 있음)
    if (!extractedImages.thumbnail) {
      const coverImgEl = doc.querySelector('div.coverImgWrapper img');
      if (coverImgEl) {
        extractedImages.thumbnail = coverImgEl.getAttribute('src') || coverImgEl.getAttribute('data-src');
        if (extractedImages.thumbnail) {
          console.log(`[Japantravel] ✅ Thumbnail from coverImgWrapper: ${extractedImages.thumbnail}`);
        }
      }
    }
    // fallback 2: og:image 메타태그
    if (!extractedImages.thumbnail) {
      const ogImage = doc.querySelector('meta[property="og:image"]');
      if (ogImage) {
        extractedImages.thumbnail = ogImage.getAttribute('content');
        if (extractedImages.thumbnail) {
          console.log(`[Japantravel] ✅ Thumbnail from og:image: ${extractedImages.thumbnail}`);
        }
      }
    }

    let thumbnailUrl = extractedImages.thumbnail 
      ? normalizeUrl(extractedImages.thumbnail, url)
      : '';

    // ===== 비디오 URL 설정 =====
    let videoUrl = '';
    if (extractedYoutubeUrls.length > 0) {
      videoUrl = normalizeUrl(extractedYoutubeUrls[0], url);
    }

    // ===== 이미지 갤러리 설정 =====
    const imageGalleryUrls = [];
    
    if (extractedImages.thumbnail) {
      const normalizedThumbnail = normalizeUrl(extractedImages.thumbnail, url);
      imageGalleryUrls.push({
        originimgurl: normalizedThumbnail,
        smallimageurl: normalizedThumbnail,
        imgname: `${festivalName || 'Festival'} - 메인 이미지`
      });
    }
    
    if (extractedImages.gallery && extractedImages.gallery.length > 0) {
      extractedImages.gallery.forEach((img) => {
        const normalizedUrl = normalizeUrl(img.originimgurl, url);
        if (normalizedUrl !== thumbnailUrl && !imageGalleryUrls.some(g => g.originimgurl === normalizedUrl)) {
          imageGalleryUrls.push({
            originimgurl: normalizedUrl,
            smallimageurl: normalizedUrl,
            imgname: img.imgname || `${festivalName} - 이미지`
          });
        }
      });
    }

    // ===== 웹사이트 URL 추출 =====
    // 우선순위 1: div.website 안의 fa-globe 아이콘 하위 링크
    let websiteUrl = '';
    const websiteDiv = doc.querySelector('div.website');
    if (websiteDiv) {
      const websiteAnchor = websiteDiv.querySelector('a[href]');
      if (websiteAnchor) {
        websiteUrl = normalizeUrl(websiteAnchor.getAttribute('href') || '', url);
        console.log(`[Japantravel] ✅ Extracted website from div.website: ${websiteUrl}`);
      }
    }
    // 우선순위 2: fa-globe 아이콘을 포함하는 부모 컨테이너에서 링크 추출
    if (!websiteUrl) {
      const globeIcon = doc.querySelector('i.fa-globe');
      if (globeIcon) {
        const parentDiv = globeIcon.parentElement?.parentElement;
        const anchor = parentDiv?.querySelector('a[href]');
        if (anchor) {
          websiteUrl = normalizeUrl(anchor.getAttribute('href') || '', url);
          console.log(`[Japantravel] ✅ Extracted website from fa-globe parent: ${websiteUrl}`);
        }
      }
    }
    // 우선순위 3: japantravel.com이 아닌 외부 링크 (기존 로직)
    if (!websiteUrl) {
      const websiteLink = doc.querySelector('a[href*="http"]:not([href*="japantravel.com"]):not([href*="facebook"]):not([href*="instagram"]):not([href*="twitter"]):not([href*="youtube"])');
      if (websiteLink) {
        websiteUrl = normalizeUrl(websiteLink.getAttribute('href') || '', url);
        console.log(`[Japantravel] ✅ Extracted website from generic link: ${websiteUrl}`);
      }
    }

    // ===== 소셜 미디어 링크 추출 =====
    const socialMedia = {
      facebook: null,
      instagram: null,
      twitter: null,
      youtube: null
    };
    
    const socialLinks = doc.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="youtube.com"]');
    socialLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href?.includes('facebook.com')) socialMedia.facebook = normalizeUrl(href, url);
      else if (href?.includes('instagram.com')) socialMedia.instagram = normalizeUrl(href, url);
      else if (href?.includes('twitter.com')) socialMedia.twitter = normalizeUrl(href, url);
      else if (href?.includes('youtube.com') && !socialMedia.youtube) socialMedia.youtube = normalizeUrl(href, url);
    });

    // ===== 연락처 정보 추출 =====
    let contactPhone = '';
    let contactEmail = '';
    if (infoDiv) {
      const phonePattern = /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      
      const infoText = infoDiv.textContent || '';
      const phoneMatch = infoText.match(phonePattern);
      const emailMatch = infoText.match(emailPattern);
      
      if (phoneMatch) contactPhone = phoneMatch[0];
      if (emailMatch) contactEmail = emailMatch[0];
    }

    // ===== 최종 RawData 객체 생성 (원본 데이터만, 번역 없음) =====
    const currentTime = new Date().toISOString();
    const rawDataRecord = {
      source_url: url,
      original_language: detectedLanguageFromUrl || 'en',
      name_original: festivalName,
      summary_original: summary,
      description_original: description,
      country: countryFromSource,
      city: extractedInfo.city || 'Unknown',
      category: extractedInfo.category || null,
      start_date: startDate,
      end_date: endDate,
      date_status: dateStatus,
      latitude: null,
      longitude: null,
      thumbnail_url: thumbnailUrl,
      video_url: videoUrl,
      image_gallery_urls: imageGalleryUrls,
      website: websiteUrl || url,
      price_yen: extractedInfo.priceYen || null,
      price_details: extractedInfo.priceDetails || null,
      opening_hours: extractedInfo.openingHours || null,
      address: extractedInfo.accessInfo || null,
      parking: null,
      organizer: null,
      contact: contactPhone || contactEmail ? { phone: contactPhone, email: contactEmail } : null,
      social_media: socialMedia,
      schedule: [],
      lineup: [],
      tags: [],
      extract_status: 'processed',
      processing_status: 'pending',
      festival_id: null,
      create_time: currentTime,
      update_time: currentTime
    };

    // ===== JapantravelRawData에 저장 =====
    try {
      const existingRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({
        source_url: url
      });
      
      let rawRecord;
      if (existingRecords && existingRecords.length > 0) {
        const existingRecord = existingRecords[0];
        const updateData = { ...rawDataRecord };
        delete updateData.create_time; // 기존 create_time 유지
        updateData.update_time = new Date().toISOString();
        rawRecord = await base44.asServiceRole.entities.JapantravelRawData.update(
          existingRecord.id, 
          updateData
        );
        console.log(`[Japantravel] ✅ Updated existing record: ${rawRecord.id}`);
      } else {
        rawRecord = await base44.asServiceRole.entities.JapantravelRawData.create(rawDataRecord);
        console.log(`[Japantravel] ✅ Created new record: ${rawRecord.id}`);
      }

      return Response.json({
        success: true,
        source_url: url,
        raw_records_saved: 1,
        message: `축제 정보를 추출하여 저장했습니다: ${festivalName}`,
        extraction_quality: {
          name_extracted: !!festivalName,
          description_length: description.length,
          category_extracted: !!extractedInfo.category,
          images_extracted: imageGalleryUrls.length
        }
      });

    } catch (saveError) {
      console.error('[Japantravel] Failed to save raw data:', saveError);
      
      // 실패 시에도 RawData 레코드 생성/업데이트
      try {
        const currentTime = new Date().toISOString();
        const failedRecord = {
          source_url: url,
          original_language: detectedLanguageFromUrl || 'en',
          name_original: festivalName || 'Unknown',
          country: countryFromSource,
          city: extractedInfo?.city || 'Unknown',
          start_date: startDate,
          end_date: endDate,
          extract_status: 'failed',
          processing_status: 'pending',
          error_message: saveError.message,
          create_time: currentTime,
          update_time: currentTime
        };
        
        const existingRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({
          source_url: url
        });
        
        if (existingRecords && existingRecords.length > 0) {
          const updateData = { ...failedRecord };
          delete updateData.create_time;
          updateData.update_time = new Date().toISOString();
          await base44.asServiceRole.entities.JapantravelRawData.update(
            existingRecords[0].id, 
            updateData
          );
        } else {
          await base44.asServiceRole.entities.JapantravelRawData.create(failedRecord);
        }
      } catch (finalError) {
        console.error('[Japantravel] Failed to save error record:', finalError);
      }
      
      return Response.json({
        success: false,
        error: '데이터 저장 중 오류가 발생했습니다',
        message: saveError.message
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Japantravel] Extraction error:', error);
    
    // 최상위 오류 발생 시에도 RawData 레코드 생성/업데이트
    try {
      if (!url) {
        return Response.json({ 
          success: false,
          error: error.message || '알 수 없는 오류가 발생했습니다',
          message: '다시 시도해주세요.'
        }, { status: 500 });
      }
      
      const base44 = createClientFromRequest(req);
      const currentTime = new Date().toISOString();
      const failedRecord = {
        source_url: url,
        original_language: 'en',
        name_original: 'Unknown',
        country: 'Japan',
        city: 'Unknown',
        start_date: '2026-01-01',
        end_date: '2026-01-01',
        extract_status: 'failed',
        processing_status: 'pending',
        error_message: error.message || '알 수 없는 오류가 발생했습니다',
        create_time: currentTime,
        update_time: currentTime
      };
      
      const existingRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({
        source_url: url
      });
      
      if (existingRecords && existingRecords.length > 0) {
        const updateData = { ...failedRecord };
        delete updateData.create_time;
        updateData.update_time = new Date().toISOString();
        await base44.asServiceRole.entities.JapantravelRawData.update(
          existingRecords[0].id, 
          updateData
        );
      } else {
        await base44.asServiceRole.entities.JapantravelRawData.create(failedRecord);
      }
    } catch (finalError) {
      console.error('[Japantravel] Failed to save error record:', finalError);
    }
    
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다',
      message: '다시 시도해주세요.'
    }, { status: 500 });
  }
});