import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import moment from 'npm:moment@2.30.1';

// visiteurope.com Terms of Service상 대량 자동 수집 금지 - 이 함수는 /events 첫 페이지만 1회 조회하는
// 관리자 수동 트리거 PoC이며, 페이지네이션 루프나 스케줄러를 포함하지 않음.
const MAX_CANDIDATES = 20;

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function expandMonth(m) {
  const abbr = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  return abbr[(m || '').toLowerCase().substring(0, 3)] || m;
}

// "27 Aug - 13 Sep 2026" / "11-13 Sep 2026" / "5 Jul 2026" 형태의 날짜 텍스트를 파싱
function parseDateRangeText(text) {
  const clean = stripTags(text);

  // 패턴 A: "27 Aug - 13 Sep 2026" (양쪽 월 다름)
  let m = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const start = moment(`${expandMonth(m[2])} ${m[1]} ${m[5]}`, 'MMMM D YYYY');
    const end = moment(`${expandMonth(m[4])} ${m[3]} ${m[5]}`, 'MMMM D YYYY');
    if (start.isValid() && end.isValid()) {
      return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), dateStatus: 'tentative' };
    }
  }

  // 패턴 B: "11-13 Sep 2026" (같은 월)
  m = clean.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const start = moment(`${expandMonth(m[3])} ${m[1]} ${m[4]}`, 'MMMM D YYYY');
    const end = moment(`${expandMonth(m[3])} ${m[2]} ${m[4]}`, 'MMMM D YYYY');
    if (start.isValid() && end.isValid()) {
      return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), dateStatus: 'tentative' };
    }
  }

  // 패턴 C: "5 Jul 2026" (단일 날짜)
  m = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const d = moment(`${expandMonth(m[2])} ${m[1]} ${m[3]}`, 'MMMM D YYYY');
    if (d.isValid()) {
      return { startDate: d.format('YYYY-MM-DD'), endDate: d.format('YYYY-MM-DD'), dateStatus: 'tentative' };
    }
  }

  return { startDate: null, endDate: null, dateStatus: 'tentative' };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const listUrl = 'https://visiteurope.com/events';
    console.log(`[VisitEurope Discover] Fetching: ${listUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Response.json({ success: false, error: `HTTP ${response.status}` }, { status: 200 });
    }

    const html = await response.text();

    // 카드 블록 단위로 분리 ("c-node--card" 로 시작하는 article)
    const cardBlocks = html.split(/<article class="c-node c-node--card/).slice(1);
    console.log(`[VisitEurope Discover] Found ${cardBlocks.length} card blocks`);

    const candidates = [];
    for (const block of cardBlocks.slice(0, MAX_CANDIDATES)) {
      const hrefMatch = block.match(/href="(\/event\/[a-z0-9\-]+)"/);
      if (!hrefMatch) continue;
      const detailUrl = `https://visiteurope.com${hrefMatch[1]}`;

      const titleMatch = block.match(/c-field--name-title[^>]*>\s*([^<]+?)\s*<\/span>/);
      const title = titleMatch ? stripTags(titleMatch[1]) : '';

      // 카드 블록 내 도시(field-title) / 국가(field-country) - 다음 카드로 넘어가기 전 첫 매치만 사용
      const cityMatch = block.match(/c-field--name-field-title[^>]*>\s*([^<]+?)\s*<\/div>/);
      const countryMatch = block.match(/c-field--name-field-country[^>]*>\s*([^<]+?)\s*<\/div>/);
      const city = cityMatch ? stripTags(cityMatch[1]) : '';
      const country = countryMatch ? stripTags(countryMatch[1]) : '';

      const dateTextMatch = block.match(/c-field--ribbon c-field--name-field-start-date[^>]*>([\s\S]*?)<svg/);
      const dateText = dateTextMatch ? stripTags(dateTextMatch[1]) : '';
      const { startDate, endDate, dateStatus } = parseDateRangeText(dateText);

      const leadMatch = block.match(/c-field--name-field-lead[^>]*>\s*([^<]+?)\s*<\/div>/);
      const lead = leadMatch ? stripTags(leadMatch[1]) : '';

      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
      let imageUrl = imgMatch ? imgMatch[1] : '';
      if (imageUrl && imageUrl.startsWith('/')) imageUrl = `https://visiteurope.com${imageUrl}`;
      imageUrl = imageUrl.replace(/&amp;/g, '&');

      if (!title || !detailUrl) continue;

      candidates.push({
        detailUrl, title, city, country, startDate, endDate, dateStatus, lead, imageUrl,
      });
    }

    console.log(`[VisitEurope Discover] Parsed ${candidates.length} candidates`);

    // 기존 레코드 조회 (중복 방지)
    const existing = await base44.asServiceRole.entities.VisitEuropeRawData.filter({});
    const existingUrls = new Set(existing.map(r => r.source_url));

    const getKoreaTime = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const now = getKoreaTime();

    const toCreate = candidates
      .filter(c => !existingUrls.has(c.detailUrl))
      .map(c => ({
        source: 'visiteurope',
        source_url: c.detailUrl,
        source_title: c.title,
        source_country: c.country,
        source_city: c.city,
        source_start_date: c.startDate || undefined,
        source_end_date: c.endDate || undefined,
        date_status: c.dateStatus,
        source_description: c.lead,
        source_image_url: c.imageUrl,
        location_status: 'needs_verification',
        extract_status: 'pending',
        processing_status: 'pending',
        fetched_at: now,
        create_time: now,
        update_time: now,
      }));

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.VisitEuropeRawData.bulkCreate(toCreate);
    }

    return Response.json({
      success: true,
      candidates_found: candidates.length,
      new_records: toCreate.length,
      already_existing: candidates.length - toCreate.length,
      message: `이벤트 목록에서 ${candidates.length}개 후보를 발견했습니다 (신규 ${toCreate.length}개 저장, 기존 ${candidates.length - toCreate.length}개 스킵). 각 후보는 '상세 추출' 탭에서 개별적으로 상세정보를 채워야 합니다.`,
    });
  } catch (error) {
    console.error('[VisitEurope Discover] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}