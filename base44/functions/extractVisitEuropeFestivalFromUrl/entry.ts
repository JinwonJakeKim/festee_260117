import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getKoreaTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

export default async function(req) {
  let url = '';
  let base44;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const requestData = await req.json();
    url = requestData.url;
    if (!url || !url.includes('visiteurope.com/event/')) {
      return Response.json({ success: false, error: 'visiteurope.com/event/ 형식의 URL이 필요합니다' }, { status: 400 });
    }

    console.log(`[VisitEurope] Fetching: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Response.json({ success: false, error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    console.log(`[VisitEurope] Fetched ${html.length} chars`);

    // ===== JSON-LD (schema.org Article) - 보조 소스: 대표이미지, 설명 폴백 =====
    let ldHeadline = '', ldDescription = '', ldImageUrl = '';
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const graph = ld['@graph'] || [ld];
        const article = graph.find(n => n['@type'] === 'Article');
        const image = graph.find(n => n['@type'] === 'ImageObject');
        if (article) { ldHeadline = article.headline || ''; ldDescription = article.description || ''; }
        if (image) ldImageUrl = image.contentUrl || image.url || '';
      } catch (e) {
        console.warn('[VisitEurope] JSON-LD parse failed:', e.message);
      }
    }

    // ===== 제목 =====
    const titleMatch = html.match(/<h1[^>]*>[\s\S]*?c-field--name-title[^>]*>\s*([^<]+?)\s*<\/span>/);
    let title = titleMatch ? stripTags(titleMatch[1]) : '';
    if (!title) {
      const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
      title = ogTitleMatch ? stripTags(ogTitleMatch[1]) : ldHeadline;
    }

    // ===== 장소(도시)/국가 - c-info-box__place 블록 기준 =====
    const placeBlockMatch = html.match(/c-info-box__place[\s\S]*?c-info-box__decor/);
    const placeBlock = placeBlockMatch ? placeBlockMatch[0] : '';
    const cityMatch = placeBlock.match(/c-field--name-field-title[^>]*>\s*([^<]+?)\s*<\/div>/);
    const city = cityMatch ? stripTags(cityMatch[1]) : '';
    const countryLinkMatch = placeBlock.match(/countries\/[^"]+"[^>]*>\s*([^<]+?)\s*<\/a>/);
    const country = countryLinkMatch ? stripTags(countryLinkMatch[1]) : '';

    // ===== 날짜 - time[datetime] 속성 (ISO, 가장 정확한 소스) =====
    const startBlockMatch = html.match(/field-start-date[\s\S]{0,400}?datetime="([^"]+)"/);
    const endBlockMatch = html.match(/field-end-date[\s\S]{0,400}?datetime="([^"]+)"/);
    const startDate = startBlockMatch ? startBlockMatch[1].split('T')[0] : null;
    const endDate = endBlockMatch ? endBlockMatch[1].split('T')[0] : (startDate || null);
    const dateStatus = (startDate && endDate) ? 'confirmed' : 'tentative';

    // ===== 설명 =====
    const descBlockMatch = html.match(/class="text-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="c-field c-field--name-field-links|<\/div>\s*<\/div>\s*<\/div>)/);
    let description = descBlockMatch ? stripTags(descBlockMatch[1]) : '';
    if (!description || description.length < 20) description = stripTags(ldDescription);

    // ===== 공식 웹사이트 (visiteurope.com 자체 링크 제외) =====
    const linksBlockMatch = html.match(/c-field--name-field-links[\s\S]{0,600}/);
    let website = null;
    if (linksBlockMatch) {
      const linkMatch = linksBlockMatch[0].match(/href="(https?:\/\/(?!visiteurope\.com)[^"]+)"/);
      if (linkMatch) website = linkMatch[1];
    }

    // ===== 대표 이미지 =====
    let imageUrl = ldImageUrl;
    if (!imageUrl) {
      const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
      imageUrl = ogImageMatch ? ogImageMatch[1] : '';
    }
    if (imageUrl && imageUrl.startsWith('/')) imageUrl = `https://visiteurope.com${imageUrl}`;
    imageUrl = imageUrl.replace(/&amp;/g, '&');

    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!city) missingFields.push('city');
    if (!country) missingFields.push('country');
    if (!startDate) missingFields.push('dates');
    if (!description) missingFields.push('description');

    const now = getKoreaTime();
    const rawDataRecord = {
      source: 'visiteurope',
      source_url: url,
      source_title: title,
      source_country: country,
      source_city: city,
      source_start_date: startDate || undefined,
      source_end_date: endDate || undefined,
      date_status: dateStatus,
      source_description: description,
      source_image_url: imageUrl,
      website: website || undefined,
      location_status: 'needs_verification',
      extract_status: 'processed',
      processing_status: 'pending',
      error_message: null,
      fetched_at: now,
      update_time: now,
    };

    const existing = await base44.asServiceRole.entities.VisitEuropeRawData.filter({ source_url: url });
    let savedRecord;
    if (existing && existing.length > 0) {
      savedRecord = await base44.asServiceRole.entities.VisitEuropeRawData.update(existing[0].id, rawDataRecord);
    } else {
      savedRecord = await base44.asServiceRole.entities.VisitEuropeRawData.create({ ...rawDataRecord, create_time: now });
    }

    return Response.json({
      success: true,
      raw_data_id: savedRecord.id,
      message: `추출 완료: ${title || '(제목 없음)'}`,
      extraction_quality: {
        name_extracted: !!title,
        city_extracted: !!city,
        country_extracted: !!country,
        dates_extracted: !!(startDate && endDate),
        description_length: description.length,
        image_found: !!imageUrl,
        website_found: !!website,
        missing_fields: missingFields,
        quality_note: missingFields.length > 0 ? `주의: ${missingFields.join(', ')} 필드 누락` : '정상 추출',
      },
    });
  } catch (error) {
    console.error('[VisitEurope] Error:', error);

    if (url && base44) {
      try {
        const now = getKoreaTime();
        const existing = await base44.asServiceRole.entities.VisitEuropeRawData.filter({ source_url: url });
        const failedRecord = {
          source: 'visiteurope',
          source_url: url,
          extract_status: 'failed',
          processing_status: 'pending',
          error_message: error.message,
          fetched_at: now,
          update_time: now,
        };
        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.VisitEuropeRawData.update(existing[0].id, failedRecord);
        } else {
          await base44.asServiceRole.entities.VisitEuropeRawData.create({ ...failedRecord, create_time: now });
        }
      } catch (e) {
        console.error('[VisitEurope] Failed to save error record:', e.message);
      }
    }

    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}