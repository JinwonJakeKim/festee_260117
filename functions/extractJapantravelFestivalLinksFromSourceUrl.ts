import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  const VERSION = "v2026-02-10-2";
  const startTime = Date.now();
  const ABSOLUTE_TIME_LIMIT = 30000;
  const MAX_PAGES = 5;
  const MAX_LINKS_PER_PAGE = 8;
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
    console.log(`[${VERSION}] 🚀 START - Max ${MAX_PAGES} pages, ${MAX_LINKS_PER_PAGE} links/page`);
    
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
      console.log(`[${VERSION}] URL: ${baseUrl}`);
    }

    const allLinks = [];
    let pagesProcessed = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`[${VERSION}] Page ${page}/${MAX_PAGES}`);
      pagesProcessed = page;
      
      if (Date.now() - startTime > ABSOLUTE_TIME_LIMIT) {
        console.log(`[${VERSION}] Timeout, stopping`);
        break;
      }
      
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', page.toString());
      const pageUrl = urlObj.toString();

      let html;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`[${VERSION}] HTTP ${response.status}, stopping`);
          break;
        }
        
        html = await response.text();
      } catch (fetchError) {
        console.error(`[${VERSION}] Fetch error: ${fetchError.message}`);
        break;
      }

      const links = extractLinks(html, sourceUrl.container_selector, sourceUrl.link_selector, MAX_LINKS_PER_PAGE);
      
      if (links.length === 0) {
        console.log(`[${VERSION}] No links, stopping`);
        break;
      }

      console.log(`[${VERSION}] ✅ ${links.length} links found`);
      allLinks.push(...links);

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[NEW VERSION] ✅ Complete: ${pagesProcessed} pages, ${allLinks.length} links`);

    // 중복 제거
    const uniqueLinks = [...new Set(allLinks)];
    console.log(`[NEW VERSION] 🔍 Checking ${uniqueLinks.length} unique links in DB`);
    
    // DB 최적화: 추출된 링크에 대해서만 필터 쿼리
    const existingMatches = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      source_url: { $in: uniqueLinks }
    });
    const existingUrls = new Set(existingMatches.map(r => r.source_url));
    console.log(`[NEW VERSION] 📊 Found ${existingUrls.size} existing, ${uniqueLinks.length - existingUrls.size} new`);

    let newCount = 0;
    const recordsToCreate = [];

    for (const link of uniqueLinks) {
      if (!existingUrls.has(link)) {
        recordsToCreate.push({
          source_url: link,
          country: sourceUrl.country,
          processing_status: 'pending',
          name_original: "",
          city: "",
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        });
        newCount++;
      }
    }

    // 청크로 나눠서 일괄 생성 (한 번에 100개씩)
    if (recordsToCreate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < recordsToCreate.length; i += CHUNK_SIZE) {
        const chunk = recordsToCreate.slice(i, i + CHUNK_SIZE);
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.bulkCreate(chunk);
        console.log(`[NEW VERSION] 💾 Saved ${Math.min(i + CHUNK_SIZE, recordsToCreate.length)}/${recordsToCreate.length}`);
      }
    }

    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      last_used_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      pages_processed: pagesProcessed,
      max_pages_limit: MAX_PAGES,
      total_links: allLinks.length,
      unique_links: uniqueLinks.length,
      new_records: newCount,
      message: `✅ ${uniqueLinks.length}개 링크 추출 (${pagesProcessed}/${MAX_PAGES} 페이지)`
    });

  } catch (error) {
    console.error('[NEW VERSION] ❌ Error:', error);
    return Response.json({ 
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

// 링크 추출 함수 - 페이지당 최대 개수 제한
function extractLinks(html, containerSelector, linkSelector, maxLinks = 8) {
  const links = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc) return [];

    const container = doc.querySelector(containerSelector || 'div.row.small-event-gutter');
    if (!container) return [];

    const linkElements = container.querySelectorAll(linkSelector || 'div.recommended-event-wrapper a');
    
    for (const linkElement of linkElements) {
      // 최대 개수에 도달하면 중단
      if (links.length >= maxLinks) break;
      
      const href = linkElement.getAttribute('href');
      if (!href) continue;

      let absoluteUrl = href;
      if (href.startsWith('/')) {
        absoluteUrl = 'https://en.japantravel.com' + href;
      }

      // 축제 URL 패턴: /prefecture/slug/숫자ID
      const pattern = /^https?:\/\/[a-z]{2}\.japantravel\.com\/[^/?]+\/[^/?]+\/\d{5,}\/?$/;
      
      if (pattern.test(absoluteUrl)) {
        const normalized = absoluteUrl.replace(/\/$/, '');
        // 중복 체크 후 추가
        if (!links.includes(normalized)) {
          links.push(normalized);
        }
      }
    }
  } catch (e) {
    console.error('[NEW VERSION] Parse error:', e);
  }

  return links;
}