import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  const VERSION = "NEW-FUNCTION-2026";
  const startTime = Date.now();
  const MAX_PAGES = 5;
  const MAX_LINKS_PER_PAGE = 8;
  const TIME_LIMIT = 30000;
  
  console.log(`[${VERSION}] 🚀 NEW FUNCTION STARTED - Max ${MAX_PAGES} pages, ${MAX_LINKS_PER_PAGE} links/page`);
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
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
    console.log(`[${VERSION}] URL: ${baseUrl}`);

    const allLinks = [];
    
    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`[${VERSION}] 📄 Page ${page}/${MAX_PAGES}`);
      
      if (Date.now() - startTime > TIME_LIMIT) {
        console.log(`[${VERSION}] ⏰ Timeout`);
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
      
      let pageLinks = 0;
      for (const linkElement of linkElements) {
        if (pageLinks >= MAX_LINKS_PER_PAGE) break;
        
        const href = linkElement.getAttribute('href');
        if (!href) continue;

        let url = href.startsWith('/') ? 'https://en.japantravel.com' + href : href;
        
        if (/^https?:\/\/[a-z]{2}\.japantravel\.com\/[^/?]+\/[^/?]+\/\d{5,}\/?$/.test(url)) {
          url = url.replace(/\/$/, '');
          if (!allLinks.includes(url)) {
            allLinks.push(url);
            pageLinks++;
          }
        }
      }
      
      console.log(`[${VERSION}] ✅ ${pageLinks} links from page ${page}`);
      if (pageLinks === 0) break;
      
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[${VERSION}] Total: ${allLinks.length} links`);

    const existing = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      source_url: { $in: allLinks }
    });
    const existingUrls = new Set(existing.map(r => r.source_url));

    const toCreate = allLinks
      .filter(link => !existingUrls.has(link))
      .map(link => ({
        source_url: link,
        country: sourceUrl.country,
        processing_status: 'pending',
        name_original: "",
        city: "",
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      }));

    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += 100) {
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.bulkCreate(
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
      total_links: allLinks.length,
      new_records: toCreate.length,
      message: `✅ ${allLinks.length}개 링크 (신규 ${toCreate.length}개)`
    });

  } catch (error) {
    console.error(`[${VERSION}] Error:`, error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});