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

            // 약어 월 매핑 (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec)
            const expandMonth = (m) => {
              if (!m) return m;
              const abbr = { jan:'January', feb:'February', mar:'March', apr:'April', may:'May', jun:'June', jul:'July', aug:'August', sep:'September', oct:'October', nov:'November', dec:'December' };
              return abbr[m.toLowerCase().substring(0,3)] || m;
            };

            // 패턴 0: "Mid Apr - Early May 2026" 형식 (early/mid/late + 약어/전체 월)
            const earlyLateAbbr = /(?:early|mid|late|beginning|end)\s+(\w+)\s*[-–]\s*(?:early|mid|late|beginning|end)\s+(\w+)\s+(\d{4})/i;
            let match = dateString.match(earlyLateAbbr);
            if (match) {
              const startMonthFull = expandMonth(match[1]);
              const endMonthFull = expandMonth(match[2]);
              const year = parseInt(match[3]);
              const startMom = moment(`${startMonthFull} 1 ${year}`, "MMMM D YYYY");
              const endMom = moment(`${endMonthFull} 1 ${year}`, "MMMM D YYYY");
              if (startMom.isValid() && endMom.isValid()) {
                startDate = startMom.startOf('month').format("YYYY-MM-DD");
                endDate = endMom.endOf('month').format("YYYY-MM-DD");
                dateStatus = 'estimated';
                console.log(`[Japantravel] Parsed as early/mid/late abbr month range: ${startDate} to ${endDate}`);
              }
            }

            // 패턴 1: "April 8th - April 30th 2026" 또는 "April 8th - 30th 2026" 형식 (구체적인 날짜)
            const dateRangeRegex = /(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:(?:\s*-\s*)(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\s+(\d{4})/;
            if (!startDate) match = dateString.match(dateRangeRegex);
            else match = null;

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
            // 패턴 2: "Early - Late April 2026" 또는 "Mid - Late April 2026" (월 전체 기간 추정)
            else {
              const earlyLatePattern = /(?:early|mid|late|beginning|end)\s*-\s*(?:early|mid|late|beginning|end)\s+(\w+)\s+(\d{4})/i;
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

        // 우선순위 0-A: infoDiv 내 div.address 직접 선택 (가장 확실한 방법)
        const addressDivDirect = infoDiv.querySelector('div.address');
        if (addressDivDirect) {
          const pEl = addressDivDirect.querySelector('p');
          const rawText = pEl ? pEl.textContent?.trim() : (addressDivDirect.textContent || '').replace(/\s+/g, ' ').trim();
          const cleanText = rawText
            ? rawText
                .replace(/\s*(Map|Directions|지도|地図)\s*/gi, '')
                .replace(/\(\s*\)/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
          if (cleanText && cleanText.length > 3) {
            accessInfo = cleanText;
            console.log(`[Japantravel] ✅ Extracted address (div.address direct): ${accessInfo}`);
          }
        }

        // 우선순위 0-B: div.address 클래스 또는 fa-map-marker-alt 아이콘이 있는 div (Japantravel 전용 패턴)
        if (!accessInfo) {
        for (const eventDiv of eventDivs) {
          const hasAddressClass = eventDiv.classList && (eventDiv.classList.contains('address') || eventDiv.className.includes('address'));
          const hasMapMarker = eventDiv.querySelector('i.fa-map-marker-alt, i.fa-map-marker');

          if (hasAddressClass || hasMapMarker) {
            // p 태그의 텍스트 우선
            const pEl = eventDiv.querySelector('p');
            const rawText = pEl ? pEl.textContent?.trim() : (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
            // Map/Directions 링크 텍스트 제거, 빈 괄호 제거
            const cleanText = rawText
              ? rawText
                  .replace(/\s*(Map|Directions|지도|地図)\s*/gi, '')
                  .replace(/\(\s*\)/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
              : '';

            if (cleanText && cleanText.length > 3) {
              accessInfo = cleanText;
              console.log(`[Japantravel] ✅ Extracted address (map-marker/address class pattern): ${accessInfo}`);
              break;
            }
          }
        }
        }

        // 우선순위 1: "Address:", "Location:", "Venue:" 등 명확한 키워드
        if (!accessInfo) {
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

    // ===== 위도/경도 추출 (Google Maps 링크에서) =====
    let extractedLatitude = null;
    let extractedLongitude = null;
    
    // HTML에서 google.com/maps?daddr=LAT,LNG 패턴 찾기
    const mapsLatLngPattern = /google\.com\/maps[^"']*[?&]daddr=([-\d.]+),([-\d.]+)/i;
    const mapsMatch = html.match(mapsLatLngPattern);
    if (mapsMatch) {
      extractedLatitude = parseFloat(mapsMatch[1]);
      extractedLongitude = parseFloat(mapsMatch[2]);
      console.log(`[Japantravel] ✅ Extracted lat/lng from maps link: ${extractedLatitude}, ${extractedLongitude}`);
    }
    
    // 백업: DOM에서 a[href*="maps"] 링크 탐색
    if (extractedLatitude === null) {
      const mapsLinks = doc.querySelectorAll('a[href*="google.com/maps"], a[href*="maps.google"]');
      for (const link of mapsLinks) {
        const href = link.getAttribute('href') || '';
        const domMatch = href.match(/[?&]daddr=([-\d.]+),([-\d.]+)/i);
        if (domMatch) {
          extractedLatitude = parseFloat(domMatch[1]);
          extractedLongitude = parseFloat(domMatch[2]);
          console.log(`[Japantravel] ✅ Extracted lat/lng from DOM maps link: ${extractedLatitude}, ${extractedLongitude}`);
          break;
        }
      }
    }

    // ===== 웹사이트 URL 추출 =====
    // 우선순위 1: div.website 또는 div[class*="website"] 안의 링크 (인스타그램 등 소셜도 포함)
    let websiteUrl = '';
    const websiteDiv = doc.querySelector('div.website, div[class*="website"]');
    if (websiteDiv) {
      const websiteAnchor = websiteDiv.querySelector('a[href]');
      if (websiteAnchor) {
        const href = websiteAnchor.getAttribute('href') || '';
        // japantravel 자체 도메인이 아닌 경우만 사용
        if (href && !href.includes('japantravel.com')) {
          websiteUrl = normalizeUrl(href, url);
          console.log(`[Japantravel] ✅ Extracted website from div.website: ${websiteUrl}`);
        }
      }
    }
    // 우선순위 2: fa-globe 아이콘을 포함하는 부모 컨테이너에서 링크 추출
    if (!websiteUrl) {
      const globeIcon = doc.querySelector('i.fa-globe, i.fa-2x.fa-globe');
      if (globeIcon) {
        // fa-globe의 상위 li 또는 div에서 링크 탐색
        let searchEl = globeIcon.parentElement;
        for (let i = 0; i < 4; i++) {
          if (!searchEl) break;
          const anchor = searchEl.querySelector('a[href]');
          if (anchor) {
            const href = anchor.getAttribute('href') || '';
            if (href && !href.includes('japantravel.com')) {
              websiteUrl = normalizeUrl(href, url);
              console.log(`[Japantravel] ✅ Extracted website from fa-globe parent: ${websiteUrl}`);
              break;
            }
          }
          searchEl = searchEl.parentElement;
        }
      }
    }
    // 우선순위 3: japantravel.com이 아닌 외부 링크 (소셜 제외)
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

    // ===== 주소가 없거나 비표준(역/공원/건물명만 있는 경우)이면 reverse geocoding으로 표준주소 채우기 =====
    let finalAccessInfo = extractedInfo.accessInfo || null;

    // 표준 주소 여부 판별: 번지수, 도로명, 행정구역(Prefecture/City/Ward 등) 포함 여부로 판단
    const isStandardAddress = (addr) => {
      if (!addr) return false;
      // 일본 표준 주소 패턴: 도도부현(Prefecture), 시구정촌(City/Ward/Town/Village) 포함 여부
      const standardPatterns = [
        /prefecture/i,
        /\d+(-\d+)+/,           // 번지 (예: 1-2-3)
        /(?:chome|丁目|番地|号)/i,
        /(?:ku|shi|cho|machi|mura)\b/i,
        /[都道府県市区町村]/,
        /\d+\s+\w+,\s*\w+/,     // 영문 번지+도로명 (예: 1-1 Asuwa, Fukui)
      ];
      return standardPatterns.some(p => p.test(addr));
    };

    const needsReverseGeocode = extractedLatitude && extractedLongitude && !isStandardAddress(finalAccessInfo);

    if (needsReverseGeocode) {
      console.log(`[Japantravel] Address "${finalAccessInfo}" is ${!finalAccessInfo ? 'missing' : 'non-standard'}, trying reverse geocoding with lat=${extractedLatitude}, lng=${extractedLongitude}`);
      try {
        const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
        if (apiKey) {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${extractedLatitude},${extractedLongitude}&language=en&key=${apiKey}`;
          const geocodeRes = await fetch(geocodeUrl);
          const geocodeData = await geocodeRes.json();
          if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
            // establishment/transit_station 등 장소명이 포함되지 않은 결과를 우선 사용
            const cleanResult = geocodeData.results.find(r => {
              const types = r.types || [];
              return !types.includes('establishment') && !types.includes('point_of_interest') && !types.includes('transit_station');
            }) || geocodeData.results[0];

            // formatted_address 대신 address_components에서 직접 영문 주소 조합
            const components = cleanResult.address_components || [];
            const getComp = (types) => {
              const c = components.find(c => types.some(t => c.types?.includes(t)));
              return c ? c.long_name : null;
            };

            // 일본 주소 address_components 구조:
            // sublocality_level_4: 번지 (예: "1")
            // sublocality_level_3: chōme (예: "1-chōme-1")
            // sublocality_level_2: 동 이름 (예: "Chūō")
            // sublocality_level_1: 구 이름
            // locality: 시 이름 (예: "Fukui")
            const sublocality4 = getComp(['sublocality_level_4']);
            const sublocality3 = getComp(['sublocality_level_3']);
            const sublocality2 = getComp(['sublocality_level_2']);
            const sublocality1 = getComp(['sublocality_level_1']);
            const city = getComp(['locality']);
            const postalCode = getComp(['postal_code']);
            const country = getComp(['country']);

            const parts = [];
            // 가장 상세한 번지 정보부터 순서대로 추가
            if (sublocality3) parts.push(sublocality3); // chōme 포함 번지
            else if (sublocality4) parts.push(sublocality4);
            if (sublocality2) parts.push(sublocality2); // 동 이름
            else if (sublocality1) parts.push(sublocality1);
            if (city) parts.push(city);
            if (postalCode) parts.push(postalCode);
            if (country) parts.push(country);

            finalAccessInfo = parts.length >= 3 ? parts.join(', ') : cleanResult.formatted_address;
            console.log(`[Japantravel] ✅ Reverse geocoded standard address: ${finalAccessInfo}`);
          } else {
            console.log(`[Japantravel] Reverse geocoding failed: ${geocodeData.status}`);
          }
        }
      } catch (geoErr) {
        console.error('[Japantravel] Reverse geocoding error:', geoErr.message);
      }
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
      latitude: extractedLatitude,
      longitude: extractedLongitude,
      thumbnail_url: thumbnailUrl,
      video_url: videoUrl,
      image_gallery_urls: imageGalleryUrls,
      website: websiteUrl || url,
      price_yen: extractedInfo.priceYen || null,
      price_details: extractedInfo.priceDetails || null,
      opening_hours: extractedInfo.openingHours || null,
      address: finalAccessInfo,
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