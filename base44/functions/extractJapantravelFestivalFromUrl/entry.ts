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
      return Response.json({ success: false, error: '[Parse 실패] data-page 속성 없음 - 페이지 구조가 변경되었거나 SPA가 아닌 정적 페이지로 렌더링됨' });
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

    // ===== Article stub 감지 =====
    const rawContent = article.content || article.body || article.description || '';
    if (rawContent && rawContent.trim().toLowerCase().includes('article stub')) {
      console.log(`[Japantravel] ⚠️ Article stub detected - description is placeholder only`);
      // stub이어도 계속 진행하되, 나중에 extraction_quality에 반영
    }

    // ===== 축제명 =====
    // 1순위: article.title (가장 정확, 연도 포함 버전)
    // 2순위: article.event_name_en (이벤트 영문명)
    // 3순위: article.name
    // 4순위: props.schema.metadata.title 또는 article.metadata.title에서 ' - ' 앞부분 추출
    let festivalName = article.title || article.event_name_en || article.name || '';

    if (!festivalName) {
      const metaTitle = props.schema?.metadata?.title || article.metadata?.title || '';
      if (metaTitle) {
        festivalName = metaTitle.split(' - ')[0].trim();
        console.log(`[Japantravel] Name from metadata.title: ${festivalName}`);
      }
    }
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
    // japantravel 이미지 CDN URL 패턴 (2026-07-27 이전: assets.japantravel.com, 이후: a0/a1/a2.cdn.japantravel.com)
    // 경로 패턴: /photo/<id>-<hash>/<W>x<H>!/name.webp  (신규 패턴은 ! 대신 URL-encoded %21 사용)
    const japantravelImgRegex = /^https:\/\/(?:assets|[a-z0-9]+\.cdn)\.japantravel\.com\/photo\/.+\.(webp|jpg|jpeg|png)$/i;
    const japantravelImgHtmlRegex = /https:\/\/(?:assets|[a-z0-9]+\.cdn)\.japantravel\.com\/photo\/[^\s"']+\.(?:webp|jpg|jpeg|png)/gi;
    // 사이즈 추출 정규식: /WxH!/ (구 패턴) 또는 /WxH%21/ (신규 URL-encoded 패턴)
    const imageSizeRegex = /\/(\d+)x(\d+)(?:!|%21)\//;

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
    ].filter(u => typeof u === 'string' && japantravelImgRegex.test(u));

    if (imageCandidates.length > 0) {
      // 해상도 숫자(WxH) 기준으로 가장 큰 것 선택
      thumbnailUrl = imageCandidates.sort((a, b) => {
        const sizeA = (a.match(imageSizeRegex) || [0, 0, 0]);
        const sizeB = (b.match(imageSizeRegex) || [0, 0, 0]);
        return (parseInt(sizeB[1]) * parseInt(sizeB[2])) - (parseInt(sizeA[1]) * parseInt(sizeA[2]));
      })[0];
    } else {
      // HTML 전체에서 탐색 후 가장 큰 해상도 선택
      const htmlMatches = html.match(japantravelImgHtmlRegex) || [];
      if (htmlMatches.length > 0) {
        thumbnailUrl = htmlMatches.sort((a, b) => {
          const sizeA = (a.match(imageSizeRegex) || [0, 0, 0]);
          const sizeB = (b.match(imageSizeRegex) || [0, 0, 0]);
          return (parseInt(sizeB[1]) * parseInt(sizeB[2])) - (parseInt(sizeA[1]) * parseInt(sizeA[2]));
        })[0];
      }
    }
    // 썸네일을 찾지 못한 경우 og:image/twitter:image 메타에서 시도 (최후 폴백)
    if (!thumbnailUrl) {
      const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      const twitterImgMatch = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);
      const metaUrl = twitterImgMatch?.[1] || ogImageMatch?.[1];
      if (metaUrl && japantravelImgRegex.test(metaUrl)) {
        thumbnailUrl = metaUrl;
        console.log(`[Japantravel] Thumbnail from meta (og/twitter:image): ${thumbnailUrl}`);
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
    let latitude = article.latitude || article.lat || article.location?.lat || null;
    let longitude = article.longitude || article.lng || article.lon || article.location?.lng || null;

    // lat/lng가 없으면 Google Maps 링크에서 추출 (HTML에서)
    if (!latitude) {
      const mapsMatch = html.match(/google\.com\/maps[^"']*[?&]daddr=([-\d.]+),([-\d.]+)/i);
      if (mapsMatch) {
        latitude = parseFloat(mapsMatch[1]);
        longitude = parseFloat(mapsMatch[2]);
      }
    }

    // ===== 가격 =====
    // 0을 유효한 값으로 취급하고, "무료"와 "미확인"을 명확히 구분한다 (article.event_general_price || ... 방식 금지)
    const priceResult = determinePriceStatus(article, html);
    const priceStatus = priceResult.status; // 'free' | 'paid' | 'unknown'
    let priceYen = priceResult.priceYen;
    let priceDetails = article.price_details || article.price_info || null;

    console.log(`[Japantravel Price] event_free: ${article.event_free} | event_general_price: ${article.event_general_price} | source: ${priceResult.source} | status: ${priceStatus} | price_yen: ${priceYen}`);

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
    const address = article.address_en || article.address || article.event_venue?.name_en || article.event_venue?.name || null;

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

    // 주소는 원본 데이터 그대로 사용 (Geocoding은 변환 단계에서 처리)
    const finalAccessInfo = address;

    // ===== 최종 레코드 저장 =====
    const getKoreaTime = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const currentTime = getKoreaTime();
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
      price_status: priceStatus,
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
      // 재추출 시 기존 Festival 연결과 변환 상태를 보존한다.
      // 가격 재검증 때문에 festival_id가 null로 덮이거나 processed 레코드가 다시 pending으로 바뀌면 안 된다.
      updateData.festival_id = existing[0].festival_id || null;
      updateData.processing_status = existing[0].processing_status || rawDataRecord.processing_status;
      updateData.update_time = getKoreaTime();
      savedRecord = await base44.asServiceRole.entities.JapantravelRawData.update(existing[0].id, updateData);
      console.log(`[Japantravel] ✅ Updated: ${savedRecord.id} (festival_id preserved: ${updateData.festival_id || 'none'})`);
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
          update_time: getKoreaTime()
        });
        console.log(`[Japantravel] ✅ JapantravelLinks updated to processed: ${matchingLinks[0].id}`);
      }
    } catch (e) {
      console.error('[Japantravel] Failed to update JapantravelLinks:', e.message);
    }

    const isStub = description.toLowerCase().includes('article stub');
    const missingFields = [];
    if (!festivalName) missingFields.push('name');
    if (!startDate || !endDate) missingFields.push('dates');
    if (!city || city === 'Unknown') missingFields.push('city');
    if (description.length === 0) missingFields.push('description');
    if (isStub) missingFields.push('description(stub - placeholder only)');

    return Response.json({
      success: true,
      source_url: url,
      raw_data_id: savedRecord.id,
      message: `추출 완료: ${festivalName}`,
      extraction_quality: {
        name_extracted: !!festivalName,
        description_length: description.length,
        is_stub: isStub,
        dates_extracted: !!(startDate && endDate),
        city_extracted: !!(city && city !== 'Unknown'),
        images_count: imageGalleryUrls.length,
        lat_lng_extracted: !!(latitude && longitude),
        missing_fields: missingFields,
        quality_note: missingFields.length > 0 ? `주의: ${missingFields.join(', ')} 필드 누락 또는 불완전` : '정상 추출',
      }
    });

  } catch (error) {
    console.error('[Japantravel] Error:', error);

    // 에러 레코드 저장
    if (url) {
      try {
        const base44 = createClientFromRequest(req);
        const currentTime = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
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
            update_time: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19)
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

// ===== 가격 판정 (free / paid / unknown) =====
// 우선순위: 1) article.event_free  2) article.event_general_price(0도 유효값으로 취급)
//          3) article의 다른 가격 필드  4) JSON-LD Event.offers  5) 렌더링된 [title="Price"] (fallback/validation 용도)
// "모르는 가격을 무료라고 표시하지 않는다"가 핵심 원칙: 근거가 없으면 반드시 unknown.
function determinePriceStatus(article, html) {
  const FREE_TEXT_PATTERN = /\b(free entry|free admission|admission free|no admission fee|free of charge)\b/i;
  const FREE_TEXT_PATTERN_JA = /(無料|入場無料)/;

  const parseNumericPrice = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const m = val.match(/[\d,]+(?:\.\d+)?/);
      if (m) return parseFloat(m[0].replace(/,/g, ''));
    }
    return null;
  };

  // 1순위: article.event_free 명시
  if (article.event_free === true) {
    const gp = parseNumericPrice(article.event_general_price);
    return { status: 'free', priceYen: (typeof gp === 'number' && !isNaN(gp)) ? gp : 0, source: 'article.event_free' };
  }

  // 2순위: article.event_general_price - undefined/null 여부를 명시적으로 판정 (0을 버리지 않음)
  const hasEventGeneralPrice = article.event_general_price !== null && article.event_general_price !== undefined;
  if (hasEventGeneralPrice) {
    const gp = parseNumericPrice(article.event_general_price);
    if (typeof gp === 'number' && !isNaN(gp) && gp > 0) {
      return { status: 'paid', priceYen: gp, source: 'article.event_general_price' };
    }
    // gp === 0이지만 event_free !== true → 무조건 free로 단정하지 않고 다른 source를 계속 확인
  }

  // 3순위: article의 다른 가격 관련 필드 (price / admission / price_details / price_info)
  const candidateFields = [article.price, article.admission, article.price_details, article.price_info];
  for (const field of candidateFields) {
    if (typeof field === 'string' && field.trim()) {
      if (FREE_TEXT_PATTERN.test(field) || FREE_TEXT_PATTERN_JA.test(field)) {
        return { status: 'free', priceYen: 0, source: 'article price field (explicit free text)' };
      }
      const val = parseNumericPrice(field);
      if (typeof val === 'number' && !isNaN(val) && val > 0) {
        return { status: 'paid', priceYen: val, source: 'article price field (numeric)' };
      }
    } else if (typeof field === 'number' && field > 0) {
      return { status: 'paid', priceYen: field, source: 'article price field (numeric)' };
    }
  }

  // 4순위: JSON-LD Event.offers.price / priceCurrency
  try {
    const jsonLdBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of jsonLdBlocks) {
      const inner = block.match(/>([\s\S]*?)<\/script>/i);
      if (!inner) continue;
      let data;
      try {
        data = JSON.parse(inner[1]);
      } catch {
        continue;
      }
      const candidates = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
      for (const node of candidates) {
        const offer = node?.offers;
        if (!offer) continue;
        const offerObj = Array.isArray(offer) ? offer[0] : offer;
        const offerPrice = parseNumericPrice(offerObj?.price);
        if (typeof offerPrice === 'number' && !isNaN(offerPrice) && offerPrice > 0) {
          return { status: 'paid', priceYen: offerPrice, source: 'JSON-LD Event.offers.price' };
        }
        // offers.price === 0 하나만으로는 free 확정하지 않음 (article.event_free가 더 강한 근거)
      }
    }
  } catch (e) {
    console.warn('[Japantravel Price] JSON-LD parse error:', e.message);
  }

  // 5순위(fallback/validation 용도): 렌더링된 Information > [title="Price"] row
  const priceRowMatch = html.match(/title=["']Price["'][^>]*>([\s\S]{0,300}?)<\/div>/i);
  if (priceRowMatch) {
    const rowText = priceRowMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\bfree\b/i.test(rowText)) {
      return { status: 'free', priceYen: 0, source: 'Information[title="Price"] (Free)' };
    }
    const val = parseNumericPrice(rowText);
    if (typeof val === 'number' && !isNaN(val) && val > 0) {
      return { status: 'paid', priceYen: val, source: 'Information[title="Price"] (numeric)' };
    }
  }

  // 어떤 source에서도 무료/유료를 확인할 수 없음 → 반드시 unknown (0이나 free로 임의 처리 금지)
  return { status: 'unknown', priceYen: null, source: 'none' };
}