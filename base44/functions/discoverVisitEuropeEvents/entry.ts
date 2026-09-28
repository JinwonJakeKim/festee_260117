import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import moment from 'npm:moment@2.30.1';

// visiteurope.com /events 페이지는 Drupal 코어 표준 페이저를 사용한다 (data-drupal-views-infinite-scroll-pager).
// "See more" 버튼은 실제로는 <a href="?page=N" rel="next">이므로, 별도 AJAX/JS 실행 없이
// 동일한 ?page=N 쿼리스트링을 순차적으로 GET 요청하면 웹사이트 사용자가 "See more"를
// 끝까지 눌렀을 때 보는 것과 동일한 전체 목록을 얻을 수 있음 (확인: page=0~6, 이후 pager 사라짐).
// 이 함수는 관리자가 수동으로 트리거하는 1회성 실행이며, 스케줄러에는 연결되어 있지 않음.
const MAX_PAGES = 60; // 무한루프 방지용 safety limit (정상 수집을 제한하지 않는 넉넉한 값)
const PAGE_DELAY_MS = 600; // 페이지 요청 사이 지연 (서버 부담 완화)
const FETCH_RETRIES = 2; // 페이지당 재시도 횟수 (429/5xx/timeout)

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

// 한 페이지의 HTML에서 이벤트 카드들과 "다음 페이지 존재 여부"를 추출
function parseEventsPage(html) {
  const cardBlocks = html.split(/<article class="c-node c-node--card/).slice(1);

  const candidates = [];
  for (const block of cardBlocks) {
    const hrefMatch = block.match(/href="(\/event\/[a-z0-9\-]+)"/);
    if (!hrefMatch) continue;
    const detailUrl = `https://visiteurope.com${hrefMatch[1]}`;

    const titleMatch = block.match(/c-field--name-title[^>]*>\s*([^<]+?)\s*<\/span>/);
    const title = titleMatch ? stripTags(titleMatch[1]) : '';

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

    candidates.push({ detailUrl, title, city, country, startDate, endDate, dateStatus, lead, imageUrl });
  }

  // Drupal 코어 페이저: <a class="button c-button" href="?page=N" title="Load more items" rel="next">See more</a>
  const hasNext = /<a class="button c-button" href="[^"]*"\s+title="Load more items"\s+rel="next">/.test(html);

  return { candidates, hasNext };
}

async function fetchEventsPage(page) {
  const url = page === 0 ? 'https://visiteurope.com/events' : `https://visiteurope.com/events?page=${page}`;

  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
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

      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${response.status}`;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      return { ok: true, html };
    } catch (err) {
      lastError = err.message;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { ok: false, error: lastError || 'Unknown fetch error' };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    console.log('[VisitEurope Discover] Starting full pagination discovery');

    const seenUrls = new Set();
    const allCandidates = [];
    const pageStats = [];
    let stoppedReason = 'no_more_pages';

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await fetchEventsPage(page);

      if (!result.ok) {
        console.error(`[VisitEurope Discover] Page ${page} fetch failed: ${result.error}`);
        stoppedReason = `fetch_error: ${result.error}`;
        pageStats.push({ page, found: 0, new: 0, error: result.error });
        break;
      }

      const { candidates, hasNext } = parseEventsPage(result.html);
      let newCount = 0;
      for (const c of candidates) {
        if (!seenUrls.has(c.detailUrl)) {
          seenUrls.add(c.detailUrl);
          allCandidates.push(c);
          newCount++;
        }
      }

      pageStats.push({ page, found: candidates.length, new: newCount });
      console.log(`[VisitEurope Discover] Page ${page}: found ${candidates.length}, new ${newCount}, hasNext ${hasNext}`);

      if (candidates.length === 0) {
        stoppedReason = 'empty_page';
        break;
      }
      if (!hasNext) {
        stoppedReason = 'no_more_pages';
        break;
      }
      if (page === MAX_PAGES - 1) {
        stoppedReason = 'max_pages_reached';
        break;
      }

      await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    }

    console.log(`[VisitEurope Discover] Total unique candidates: ${allCandidates.length} (stopped: ${stoppedReason})`);

    // 기존 레코드 조회 (중복 방지) - source_url 기준 (VisitEuropeRawData 기존 중복 판별 로직 그대로 사용)
    const existing = await base44.asServiceRole.entities.VisitEuropeRawData.filter({});
    const existingUrls = new Set(existing.map(r => r.source_url));

    const getKoreaTime = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const now = getKoreaTime();

    const toCreate = allCandidates
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

    const alreadyExisting = allCandidates.length - toCreate.length;
    const pageSummaryLines = pageStats.map(p => `Page ${p.page + 1}: ${p.found}개 발견${p.error ? ` (오류: ${p.error})` : ''}`);

    return Response.json({
      success: true,
      pages_fetched: pageStats.length,
      stopped_reason: stoppedReason,
      page_stats: pageStats,
      candidates_found: allCandidates.length,
      new_records: toCreate.length,
      already_existing: alreadyExisting,
      message: [
        `VisitEurope 전체 이벤트 발견 완료 (총 ${pageStats.length}페이지 조회)`,
        ...pageSummaryLines,
        '',
        `총 발견: ${allCandidates.length}`,
        `신규: ${toCreate.length}`,
        `기존(중복 제외): ${alreadyExisting}`,
      ].join('\n'),
    });
  } catch (error) {
    console.error('[VisitEurope Discover] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}