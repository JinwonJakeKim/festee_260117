import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import moment from 'npm:moment';

Deno.serve(async (req) => {
  let url = '';

  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const requestData = await req.json();
    url = requestData.url;

    if (!url) {
      return Response.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    console.log(`[Japantravel] Fetching: ${url}`);

    // URL에서 언어 코드 감지
    const urlObj = new URL(url);
    const languageMatch = urlObj.hostname.match(/^([a-z]{2})\.japantravel\.com$/);
    const detectedLanguage = languageMatch ? languageMatch[1] : 'en';

    // HTML 가져오기
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Response.json({ success: false, error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    console.log(`[Japantravel] Fetched ${html.length} chars`);

    // ===== data-page JSON 파싱 (Inertia.js SPA 구조) =====
    const dataPageMatch = html.match(/id="app"\s+data-page="([^"]+)"/);
    if (!dataPageMatch) {
      return Response.json({ success: false, error: 'data-page attribute not found. Page structure may have changed.' });
    }

    // HTML entity decode
    const jsonStr = dataPageMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'");

    const pageData = JSON.parse(jsonStr);
    const props = pageData.props || {};
    const article = props.article || {};

    console.log(`[Japantravel] Article keys: ${Object.keys(article).join(', ')}`);

    // ===== 축제명 =====
    const festivalName = article.title || article.name || '';
    console.log(`[Japantravel] Name: ${festivalName}`);

    // ===== 요약 =====
    // article.summary / meta_description이 사이트 공통 설명일 경우 제외
    const SITE_GENERIC_PHRASES = [
      'japan travel', 'japantravel', 'official guide', 'things to do in japan',
      'plan your next japan trip', 'local info', 'tourism guides'
    ];
    const isSiteGeneric = (text) => {
      if (!text) return true;
      const lower = text.toLowerCase();
      return SITE_GENERIC_PHRASES.some(phrase => lower.includes(phrase));
    };
    const rawSummary = article.summary || article.meta_description || '';
    let summary = isSiteGeneric(rawSummary) ? '' : rawSummary;

    // ===== 설명 =====
    // content/body는 HTML일 수 있으므로 태그 제거
    const rawDescription = article.content || article.body || article.description || '';
    const description = rawDescription.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`[Japantravel] Description length: ${description.length}`);

    // ===== LLM으로 summary 생성 (description이 있고 summary가 비어있는 경우) =====
    if (!summary && description.length > 50) {
      try {
        console.log(`[Japantravel] Generating summary via LLM...`);
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `You are a festival information summarizer. Based on the following festival description, write a concise 2-3 sentence summary in English that captures what the festival is, where/when it happens, and what makes it special. Do NOT include any website branding or generic tourism phrases. Write only about this specific festival.

Festival name: ${festivalName}
Description: ${description.substring(0, 2000)}

Write only the summary, nothing else.`,
        });
        if (llmResult && typeof llmResult === 'string' && llmResult.trim().length > 10) {
          summary = llmResult.trim();
          console.log(`[Japantravel] LLM summary generated (${summary.length} chars)`);
        }
      } catch (e) {
        console.error('[Japantravel] LLM summary generation failed:', e.message);
      }
    }

    // ===== 날짜 파싱 =====
    let startDate = null;
    let endDate = null;
    let dateStatus = 'confirmed';

    // article에서 날짜 직접 추출
    if (article.start_date || article.startDate || article.event_start) {
      const raw = article.start_date || article.startDate || article.event_start;
      const m = moment(raw);
      if (m.isValid()) startDate = m.format('YYYY-MM-DD');
    }
    if (article.end_date || article.endDate || article.event_end) {
      const raw = article.end_date || article.endDate || article.event_end;
      const m = moment(raw);
      if (m.isValid()) endDate = m.format('YYYY-MM-DD');
    }

    // 날짜가 없으면 event_date 객체 파싱 시도 (예: {start: "...", end: "..."})
    if (!startDate) {
      const eventDate = article.event_date;
      if (eventDate && typeof eventDate === 'object') {
        console.log(`[Japantravel] event_date object: ${JSON.stringify(eventDate)}`);
        const s = moment(eventDate.start || eventDate.from || eventDate.date_start || eventDate.startDate);
        const e = moment(eventDate.end || eventDate.to || eventDate.date_end || eventDate.endDate);
        if (s.isValid()) { startDate = s.format('YYYY-MM-DD'); dateStatus = 'confirmed'; }
        if (e.isValid()) endDate = e.format('YYYY-MM-DD');
      } else if (typeof eventDate === 'string' && eventDate) {
        console.log(`[Japantravel] Parsing date string: "${eventDate}"`);
        const parsed = parseDateString(eventDate);
        startDate = parsed.startDate;
        endDate = parsed.endDate;
        dateStatus = parsed.dateStatus;
      }
    }
    // date_string fallback
    if (!startDate) {
      const dateString = article.date_string || article.dates || '';
      if (dateString && typeof dateString === 'string') {
        const parsed = parseDateString(dateString);
        startDate = parsed.startDate;
        endDate = parsed.endDate;
        dateStatus = parsed.dateStatus;
      }
    }

    // 동일 날짜면 endDate = startDate
    if (startDate && !endDate) endDate = startDate;

    console.log(`[Japantravel] Dates: ${startDate} ~ ${endDate} (${dateStatus})`);

    // ===== 도시 =====
    // article.city는 객체일 수 있음: {id, name, code, name_en, ...}
    const cityObj = article.city || article.prefecture || {};
    let city = typeof cityObj === 'string' ? cityObj : (cityObj.name_en || cityObj.name || '');
    // URL 경로에서 도시 추출 (예: /kyoto/kyoto-art-fireworks/...)
    if (!city) {
      const pathMatch = urlObj.pathname.match(/^\/([^\/]+)\//);
      if (pathMatch) city = capitalize(pathMatch[1].replace(/-/g, ' '));
    }

    // ===== 카테고리 =====
    const category = article.category?.name || article.category || article.type || null;

    // ===== 썸네일 =====
    // assets.japantravel.com/photo/...webp 패턴, 가장 큰 해상도 우선 선택
    let thumbnailUrl = '';

    // article.cover가 1440x960 등 가장 큰 이미지이므로 최우선
    const imageCandidates = [
      article.cover,
      article.bigcover,
      article.image,
      article.medium_thumbnail,
      article.thumbnail,
      article.cover_image,
      article.main_image,
      article.small_thumbnail,
    ].filter(u => typeof u === 'string' && /^https:\/\/assets\.japantravel\.com\/photo\/.+\.webp$/.test(u));

    if (imageCandidates.length > 0) {
      // 해상도 숫자(WxH) 기준으로 가장 큰 것 선택
      thumbnailUrl = imageCandidates.sort((a, b) => {
        const sizeA = (a.match(/\/(\d+)x(\d+)!\//) || [0, 0, 0]);
        const sizeB = (b.match(/\/(\d+)x(\d+)!\//) || [0, 0, 0]);
        return (parseInt(sizeB[1]) * parseInt(sizeB[2])) - (parseInt(sizeA[1]) * parseInt(sizeA[2]));
      })[0];
    } else {
      // HTML 전체에서 탐색 후 가장 큰 해상도 선택
      const htmlMatches = html.match(/https:\/\/assets\.japantravel\.com\/photo\/[^\s"']+\.webp/g) || [];
      if (htmlMatches.length > 0) {
        thumbnailUrl = htmlMatches.sort((a, b) => {
          const sizeA = (a.match(/\/(\d+)x(\d+)!\//) || [0, 0, 0]);
          const sizeB = (b.match(/\/(\d+)x(\d+)!\//) || [0, 0, 0]);
          return (parseInt(sizeB[1]) * parseInt(sizeB[2])) - (parseInt(sizeA[1]) * parseInt(sizeA[2]));
        })[0];
      }
    }
    // 패턴을 찾지 못하면 thumbnailUrl은 빈 문자열 유지

    console.log(`[Japantravel] Thumbnail: ${thumbnailUrl || '(없음)'}`);

    // ===== 이미지 갤러리 =====
    const imageGalleryUrls = [];
    if (thumbnailUrl) {
      imageGalleryUrls.push({ originimgurl: thumbnailUrl, smallimageurl: thumbnailUrl, imgname: `${festivalName} - 메인` });
    }
    const galleryImages = article.images || article.gallery || article.photos || [];
    if (Array.isArray(galleryImages)) {
      galleryImages.forEach((img, i) => {
        const imgUrl = typeof img === 'string' ? img : (img.url || img.src || img.original || '');
        if (imgUrl && imgUrl !== thumbnailUrl) {
          const fullUrl = imgUrl.startsWith('/') ? `https://en.japantravel.com${imgUrl}` : imgUrl;
          imageGalleryUrls.push({ originimgurl: fullUrl, smallimageurl: fullUrl, imgname: `${festivalName} - 이미지 ${i + 1}` });
        }
      });
    }

    // ===== 위도/경도 =====
    let latitude = article.latitude || article.lat || null;
    let longitude = article.longitude || article.lng || article.lon || null;

    // lat/lng가 없으면 Google Maps 링크에서 추출 (HTML에서)
    if (!latitude) {
      const mapsMatch = html.match(/google\.com\/maps[^"']*[?&]daddr=([-\d.]+),([-\d.]+)/i);
      if (mapsMatch) {
        latitude = parseFloat(mapsMatch[1]);
        longitude = parseFloat(mapsMatch[2]);
      }
    }

    // ===== 가격 =====
    let priceYen = article.event_general_price || article.price || article.admission || null;
    let priceDetails = article.price_details || article.price_info || null;
    if (priceYen && typeof priceYen === 'string') {
      const m = priceYen.match(/[\d,]+/);
      priceYen = m ? parseInt(m[0].replace(/,/g, '')) : null;
    } else if (priceYen && typeof priceYen === 'number') {
      // already numeric
    }

    // ===== 기타 =====
    // websites는 언어코드 키 객체 (예: {"ja": "https://...", "en": "https://..."})
    let websiteFromObj = null;
    if (article.websites && typeof article.websites === 'object' && !Array.isArray(article.websites)) {
      for (const lang of Object.keys(article.websites)) {
        const u = article.websites[lang];
        if (u && typeof u === 'string') { websiteFromObj = u; break; }
      }
    }
    const website = article.website || websiteFromObj || article.external_url || null;
    const openingHours = article.opening_hours || article.hours || null;
    const address = article.address_en || article.address || article.location || article.event_venue?.name_en || article.event_venue?.name || null;

    // ===== YouTube URL =====
    let videoUrl = '';
    if (article.youtubeVideoId) {
      videoUrl = `https://www.youtube.com/watch?v=${article.youtubeVideoId}`;
    } else {
      const iframeMatch = html.match(/<iframe[^>]*src="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"[^>]*>/i);
      if (iframeMatch) videoUrl = iframeMatch[1];
    }

    // ===== 소셜 미디어 =====
    const socialMedia = {
      facebook: article.facebook || null,
      instagram: article.instagram || null,
      twitter: article.twitter || null,
      youtube: article.youtube || null,
    };

    // ===== Reverse Geocoding (주소 없고 좌표 있는 경우) =====
    let finalAccessInfo = address;
    if (!finalAccessInfo && latitude && longitude) {
      try {
        const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
        if (apiKey) {
          const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=en&key=${apiKey}`);
          const geoData = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results?.[0]) {
            finalAccessInfo = geoData.results[0].formatted_address;
            console.log(`[Japantravel] Reverse geocoded: ${finalAccessInfo}`);
          }
        }
      } catch (e) {
        console.error('[Japantravel] Reverse geocode error:', e.message);
      }
    }

    // ===== 최종 레코드 저장 =====
    const currentTime = new Date().toISOString();
    const rawDataRecord = {
      source_url: url,
      original_language: detectedLanguage,
      name_original: festivalName,
      summary_original: summary,
      description_original: description,
      country: 'Japan',
      city: city || 'Unknown',
      category: category,
      start_date: startDate || '2026-01-01',
      end_date: endDate || '2026-12-31',
      date_status: dateStatus,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      thumbnail_url: thumbnailUrl,
      video_url: videoUrl,
      image_gallery_urls: imageGalleryUrls,
      website: website || null,
      price_yen: priceYen,
      price_details: priceDetails,
      opening_hours: openingHours,
      address: finalAccessInfo,
      social_media: socialMedia,
      extract_status: 'processed',
      processing_status: 'pending',
      festival_id: null,
      create_time: currentTime,
      update_time: currentTime
    };

    // 기존 레코드 확인 후 upsert
    const existing = await base44.asServiceRole.entities.JapantravelRawData.filter({ source_url: url });
    let savedRecord;
    if (existing && existing.length > 0) {
      const updateData = { ...rawDataRecord };
      delete updateData.create_time;
      updateData.update_time = new Date().toISOString();
      savedRecord = await base44.asServiceRole.entities.JapantravelRawData.update(existing[0].id, updateData);
      console.log(`[Japantravel] ✅ Updated: ${savedRecord.id}`);
    } else {
      savedRecord = await base44.asServiceRole.entities.JapantravelRawData.create(rawDataRecord);
      console.log(`[Japantravel] ✅ Created: ${savedRecord.id}`);
    }

    // JapantravelLinks 상태 업데이트 (성공)
    try {
      const matchingLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({ url: url });
      if (matchingLinks && matchingLinks.length > 0) {
        await base44.asServiceRole.entities.JapantravelLinks.update(matchingLinks[0].id, {
          processing_status: 'processed',
          raw_data_id: savedRecord.id,
          error_message: null,
          update_time: new Date().toISOString()
        });
        console.log(`[Japantravel] ✅ JapantravelLinks updated to processed: ${matchingLinks[0].id}`);
      }
    } catch (e) {
      console.error('[Japantravel] Failed to update JapantravelLinks:', e.message);
    }

    return Response.json({
      success: true,
      source_url: url,
      raw_data_id: savedRecord.id,
      message: `추출 완료: ${festivalName}`,
      extraction_quality: {
        name_extracted: !!festivalName,
        description_length: description.length,
        dates_extracted: !!(startDate && endDate),
        city_extracted: !!(city && city !== 'Unknown'),
        images_count: imageGalleryUrls.length,
        lat_lng_extracted: !!(latitude && longitude),
      }
    });

  } catch (error) {
    console.error('[Japantravel] Error:', error);

    // 에러 레코드 저장
    if (url) {
      try {
        const base44 = createClientFromRequest(req);
        const currentTime = new Date().toISOString();
        const existing = await base44.asServiceRole.entities.JapantravelRawData.filter({ source_url: url });
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
          error_message: error.message,
          create_time: currentTime,
          update_time: currentTime
        };
        if (existing && existing.length > 0) {
          const u = { ...failedRecord }; delete u.create_time;
          await base44.asServiceRole.entities.JapantravelRawData.update(existing[0].id, u);
        } else {
          await base44.asServiceRole.entities.JapantravelRawData.create(failedRecord);
        }
      } catch (e) {
        console.error('[Japantravel] Failed to save error record:', e.message);
      }

      // JapantravelLinks 상태 업데이트 (실패)
      try {
        const matchingLinks = await base44.asServiceRole.entities.JapantravelLinks.filter({ url: url });
        if (matchingLinks && matchingLinks.length > 0) {
          await base44.asServiceRole.entities.JapantravelLinks.update(matchingLinks[0].id, {
            processing_status: 'failed',
            error_message: error.message || 'Unknown error',
            update_time: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error('[Japantravel] Failed to update JapantravelLinks on error:', e.message);
      }
    }

    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

// ===== 날짜 문자열 파싱 헬퍼 =====
function parseDateString(dateString) {
  let startDate = null, endDate = null, dateStatus = 'tentative';

  const expandMonth = (m) => {
    const abbr = { jan:'January', feb:'February', mar:'March', apr:'April', may:'May', jun:'June', jul:'July', aug:'August', sep:'September', oct:'October', nov:'November', dec:'December' };
    return abbr[m?.toLowerCase()?.substring(0,3)] || m;
  };

  // 패턴 1: "April 8th - April 30th 2026"
  const rangeMatch = dateString.match(/(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*(?:(\w+)\s+)?(\d{1,2})(?:st|nd|rd|th)?)?\s+(\d{4})/);
  if (rangeMatch) {
    const sm = expandMonth(rangeMatch[1]);
    const sd = parseInt(rangeMatch[2]);
    const em = expandMonth(rangeMatch[3] || rangeMatch[1]);
    const ed = rangeMatch[4] ? parseInt(rangeMatch[4]) : sd;
    const yr = parseInt(rangeMatch[5]);
    if (sm && sd && yr) {
      const s = moment(`${sm} ${sd} ${yr}`, 'MMMM D YYYY');
      const e = moment(`${em} ${ed} ${yr}`, 'MMMM D YYYY');
      if (s.isValid()) { startDate = s.format('YYYY-MM-DD'); dateStatus = 'confirmed'; }
      if (e.isValid()) endDate = e.format('YYYY-MM-DD');
    }
  }

  // 패턴 2: "Early - Late April 2026"
  if (!startDate) {
    const elMatch = dateString.match(/(?:early|mid|late|beginning|end)\s*[-–]\s*(?:early|mid|late|beginning|end)\s+(\w+)\s+(\d{4})/i);
    if (elMatch) {
      const m = moment(`${expandMonth(elMatch[1])} 1 ${elMatch[2]}`, 'MMMM D YYYY');
      if (m.isValid()) {
        startDate = m.startOf('month').format('YYYY-MM-DD');
        endDate = m.clone().endOf('month').format('YYYY-MM-DD');
        dateStatus = 'estimated';
      }
    }
  }

  // 패턴 3: "April 2026"
  if (!startDate) {
    const moMatch = dateString.match(/^(\w+)\s+(\d{4})$/i);
    if (moMatch) {
      const m = moment(`${expandMonth(moMatch[1])} 1 ${moMatch[2]}`, 'MMMM D YYYY');
      if (m.isValid()) {
        startDate = m.startOf('month').format('YYYY-MM-DD');
        endDate = m.clone().endOf('month').format('YYYY-MM-DD');
        dateStatus = 'estimated';
      }
    }
  }

  if (dateString.toLowerCase().includes('tentative')) dateStatus = 'tentative';

  return { startDate, endDate, dateStatus };
}

function capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}