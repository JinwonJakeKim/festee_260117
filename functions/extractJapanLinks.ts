import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts';

Deno.serve(async (req) => {
  const VERSION = "AUTO-DETECT-V2";
  const startTime = Date.now();
  const MAX_PESSIMISTIC_PAGES = 50; // 무한 루프 방지용 최대값
  const MAX_LINKS_PER_PAGE = 8;
  const TIME_LIMIT = 30000;
  
  console.log(`[${VERSION}] START - Auto-detect or manual pages`);
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth, maxPages } = await req.json();
    
    if (!sourceUrlId) {
      return Response.json({ success: false, error: 'sourceUrlId required' }, { status: 400 });
    }

    const sourceUrl = await base44.asServiceRole.entities.FestivalSourceUrl.get(sourceUrlId);
    if (!sourceUrl) {
      return Response.json({ success: false, error: 'Source not found' }, { status: 404 });
    }

    let baseUrl = sourceUrl.url;
    if (sourceUrl.use_date_parameters && sourceUrl.date_parameter_template && targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      baseUrl = sourceUrl.date_parameter_template
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{LAST_DAY}/g, lastDay.toString());
    }
    
    // maxPages 처리: "auto" 또는 null이면 자동 감지, 숫자면 그 페이지까지만
    const useAutoDetect = !maxPages || maxPages === "auto";
    const maxPagesToProcess = useAutoDetect ? MAX_PESSIMISTIC_PAGES : parseInt(maxPages);
    
    console.log(`[${VERSION}] URL: ${baseUrl}`);
    console.log(`[${VERSION}] Mode: ${useAutoDetect ? 'Auto-detect' : `Manual (${maxPagesToProcess} pages)`}`);

    const allLinks = [];
    let prevPageLinks = null;
    let actualPagesProcessed = 0;
    
    for (let page = 1; page <= maxPagesToProcess; page++) {
      console.log(`[${VERSION}] Page ${page}/${useAutoDetect ? '?' : maxPagesToProcess}`);
      
      if (Date.now() - startTime > TIME_LIMIT) {
        console.log(`[${VERSION}] Timeout`);
        break;
      }
      
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', page.toString());
      const pageUrl = urlObj.toString();

      let html;
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
        
        if (!response.ok) break;
        html = await response.text();
      } catch (e) {
        console.error(`[${VERSION}] Fetch error: ${e.message}`);
        break;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      if (!doc) break;

      const container = doc.querySelector(sourceUrl.container_selector || 'div.row.small-event-gutter');
      if (!container) break;

      const linkElements = container.querySelectorAll(sourceUrl.link_selector || 'div.recommended-event-wrapper a');
      
      const currentPageLinks = [];
      for (const linkElement of linkElements) {
        const href = linkElement.getAttribute('href');
        if (!href) continue;

        let url = href.startsWith('/') ? 'https://en.japantravel.com' + href : href;
        
        if (/^https?:\/\/[a-z]{2}\.japantravel\.com\/[^/?]+\/[^/?]+\/\d{5,}\/?$/.test(url)) {
          url = url.replace(/\/$/, '');
          currentPageLinks.push(url);
        }
      }
      
      // 자동 감지 모드: 이전 페이지와 현재 페이지의 링크가 동일한지 확인
      if (useAutoDetect && page > 1 && prevPageLinks && currentPageLinks.length > 0) {
        const currentHash = JSON.stringify(currentPageLinks.sort());
        const prevHash = JSON.stringify(prevPageLinks.sort());
        
        if (currentHash === prevHash) {
          console.log(`[${VERSION}] Page ${page} is identical to page ${page - 1}. Last page detected!`);
          break;
        }
      }
      
      // 링크가 하나도 없으면 중단
      if (currentPageLinks.length === 0) {
        console.log(`[${VERSION}] No links found on page ${page}. Stopping.`);
        break;
      }
      
      // 중복 제거하면서 전체 링크에 추가
      let pageLinksAdded = 0;
      for (const url of currentPageLinks) {
        if (!allLinks.includes(url) && pageLinksAdded < MAX_LINKS_PER_PAGE) {
          allLinks.push(url);
          pageLinksAdded++;
        }
      }
      
      console.log(`[${VERSION}] ${pageLinksAdded} new links from page ${page} (total: ${currentPageLinks.length} links on page)`);
      
      prevPageLinks = currentPageLinks;
      actualPagesProcessed++;
      
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[${VERSION}] Processed ${actualPagesProcessed} pages, Total: ${allLinks.length} unique links`);

    const existing = await base44.asServiceRole.entities.JapantravelLinks.filter({
      url: { $in: allLinks }
    });
    const existingUrls = new Set(existing.map(r => r.url));

    const now = new Date().toISOString();
    const toCreate = allLinks
      .filter(link => !existingUrls.has(link))
      .map(link => ({
        url: link,
        country: sourceUrl.country,
        source_url_id: sourceUrlId,
        processing_status: 'pending',
        create_time: now,
        update_time: now,
      }));

    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += 100) {
        await base44.asServiceRole.entities.JapantravelLinks.bulkCreate(
          toCreate.slice(i, i + 100)
        );
      }
    }

    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      last_used_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      version: VERSION,
      mode: useAutoDetect ? 'auto-detect' : 'manual',
      actual_pages_processed: actualPagesProcessed,
      total_links: allLinks.length,
      new_records: toCreate.length,
      message: `${useAutoDetect ? '자동 감지' : `${maxPagesToProcess}페이지 지정`}: ${actualPagesProcessed}개 페이지에서 ${allLinks.length}개 링크 추출 완료 (신규 ${toCreate.length}개)`
    });

  } catch (error) {
    console.error(`[${VERSION}] Error:`, error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});