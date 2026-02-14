import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { url, rawDataId, imageSelectors } = await req.json();
    
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
      thumbnail_selector: "div.coverphoto figure.coverImgWrapper img",
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

    // ===== 날짜 정보 추출 =====
    const extractDateInfo = (htmlContent) => {
      const dateInfo = [];
      const cleanHtml = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                       .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // When: 키워드 근처 텍스트
      const whenPattern = /When[:\s]+([^<>\n]{5,100})/gi;
      let match;
      while ((match = whenPattern.exec(cleanHtml)) !== null) {
        dateInfo.push(match[1].trim().replace(/\s+/g, ' '));
      }
      
      // Date: 키워드
      const datePattern = /Date[:\s]+([^<>\n]{5,100})/gi;
      while ((match = datePattern.exec(cleanHtml)) !== null) {
        dateInfo.push(match[1].trim().replace(/\s+/g, ' '));
      }
      
      return dateInfo.length > 0 ? dateInfo : ['Date information not found'];
    };

    const extractedDateInfo = extractDateInfo(html);
    const dateString = extractedDateInfo[0] || '';
    console.log(`[Japantravel] Extracted date info: ${dateString}`);

    // 간단한 날짜 파싱 (예: "Jan 15 - 20, 2026")
    let startDate = '2026-01-01';
    let endDate = '2026-01-01';
    let dateStatus = 'tentative';

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

      // 주소 정보 추출
      if (infoDiv) {
        const eventDivs = infoDiv.querySelectorAll('div.event');
        for (const eventDiv of eventDivs) {
          const eventDivText = (eventDiv.textContent || '').replace(/\s+/g, ' ').trim();
          
          // 패턴 1: "Address:", "Location:", "Venue:" 키워드로 시작
          const addressPattern = /(?:address|location|venue)\s*:\s*(.+)/i;
          let match = eventDivText.match(addressPattern);
          
          if (match && match[1]) {
            accessInfo = match[1].trim();
            break;
          }
          
          // 패턴 2: 일본 주소 형식 (숫자로 시작하고 Prefecture 또는 우편번호 포함)
          const japanAddressPattern = /(\d+[\s\-][\w\-,\s]+(?:Prefecture|都|府|県|市|区|町|村)[\w\-,\s]*(?:\d{3}[\-\s]?\d{4})?)/i;
          match = eventDivText.match(japanAddressPattern);
          
          if (match && match[1] && match[1].length > 20) {
            accessInfo = match[1].trim();
            break;
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
    let websiteUrl = '';
    const websiteLink = doc.querySelector('a[href*="http"]:not([href*="japantravel.com"]):not([href*="facebook"]):not([href*="instagram"]):not([href*="twitter"]):not([href*="youtube"])');
    if (websiteLink) {
      websiteUrl = normalizeUrl(websiteLink.getAttribute('href') || '', url);
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
    const infoDiv = doc.querySelector('div#info');
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