import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  const startTime = Date.now();
  const ABSOLUTE_TIME_LIMIT = 30000; // 30초 강제 제한
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
    // 🔒 하드코딩: 절대 5페이지만 탐색
    const MAX_PAGES = 5;
    
    console.log(`[NEW VERSION] 🔒 MAX_PAGES=${MAX_PAGES} (HARDCODED)`);
    
    if (!sourceUrlId) {
      return Response.json({ 
        success: false,
        error: 'sourceUrlId is required' 
      }, { status: 400 });
    }

    const sourceUrl = await base44.asServiceRole.entities.FestivalSourceUrl.get(sourceUrlId);
    
    if (!sourceUrl) {
      return Response.json({
        success: false,
        error: 'Source URL not found'
      }, { status: 404 });
    }

    console.log(`[NEW VERSION] 🚀 Starting extraction`);
    console.log(`[NEW VERSION] Container: ${sourceUrl.container_selector}`);
    console.log(`[NEW VERSION] Link selector: ${sourceUrl.link_selector}`);
    
    // 날짜 파라미터 처리
    let baseUrl = sourceUrl.url;
    if (sourceUrl.use_date_parameters && sourceUrl.date_parameter_template && targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      
      baseUrl = sourceUrl.date_parameter_template
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{LAST_DAY}/g, lastDay.toString());
      
      console.log(`[NEW VERSION] URL: ${baseUrl}`);
    }

    const allLinks = [];
    let pagesProcessed = 0;

    // 🔒 for 루프로 명확히 5페이지만
    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`[NEW VERSION] 📄 Page ${page}/${MAX_PAGES}`);
      pagesProcessed = page;
      
      // 시간 체크 - 30초 초과시 즉시 중단
      if (Date.now() - startTime > ABSOLUTE_TIME_LIMIT) {
        console.log(`[NEW VERSION] ⏰ 30초 초과, 강제 중단`);
        break;
      }
      
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', page.toString());
      const pageUrl = urlObj.toString();

      let html;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 페이지당 8초
        
        const response = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`[NEW VERSION] ❌ HTTP ${response.status}, stopping`);
          break;
        }
        
        html = await response.text();
      } catch (fetchError) {
        console.error(`[NEW VERSION] ❌ Fetch error: ${fetchError.message}`);
        break;
      }

      // 링크 추출
      const links = extractLinks(html, sourceUrl.container_selector, sourceUrl.link_selector);
      
      if (links.length === 0) {
        console.log(`[NEW VERSION] No links found, stopping`);
        break;
      }

      console.log(`[NEW VERSION] ✅ Found ${links.length} links`);
      allLinks.push(...links);

      // 짧은 대기
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

// 링크 추출 함수
function extractLinks(html, containerSelector, linkSelector) {
  const links = new Set();

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc) return [];

    const container = doc.querySelector(containerSelector || 'div.row.small-event-gutter');
    if (!container) return [];

    const linkElements = container.querySelectorAll(linkSelector || 'div.recommended-event-wrapper a');
    
    for (const linkElement of linkElements) {
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
        links.add(normalized);
      }
    }
  } catch (e) {
    console.error('[NEW VERSION] Parse error:', e);
  }

  return Array.from(links);
}