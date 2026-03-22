import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  const VERSION = "v2026-02-10-FINAL";
  const startTime = Date.now();
  const ABSOLUTE_TIME_LIMIT = 30000; // 30초
  const MAX_PAGES = 5; // 🔒 하드코딩
  const MAX_LINKS_PER_PAGE = 8; // 🔒 페이지당 8개
  
  try {
    const base44 = createClientFromRequest(req);
    
    // 관리자 권한 체크
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
    console.log(`[${VERSION}] 🚀 START`);
    console.log(`[${VERSION}] 🔒 MAX_PAGES=${MAX_PAGES}, MAX_LINKS_PER_PAGE=${MAX_LINKS_PER_PAGE}`);
    
    if (!sourceUrlId) {
      return Response.json({ 
        success: false, 
        error: 'sourceUrlId required' 
      }, { status: 400 });
    }

    // FestivalSourceUrl 조회
    const sourceUrl = await base44.asServiceRole.entities.FestivalSourceUrl.get(sourceUrlId);
    if (!sourceUrl) {
      return Response.json({ 
        success: false, 
        error: 'Source not found' 
      }, { status: 404 });
    }

    // 날짜 파라미터 적용
    let baseUrl = sourceUrl.url;
    if (sourceUrl.use_date_parameters && sourceUrl.date_parameter_template && targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      
      baseUrl = sourceUrl.date_parameter_template
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{LAST_DAY}/g, lastDay.toString());
      
      console.log(`[${VERSION}] 📅 URL: ${baseUrl}`);
    }

    const allLinks = [];
    let pagesProcessed = 0;

    // 🔒 정확히 5페이지만 탐색
    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`[${VERSION}] 📄 Processing page ${page}/${MAX_PAGES}`);
      pagesProcessed = page;
      
      // 30초 타임아웃 체크
      if (Date.now() - startTime > ABSOLUTE_TIME_LIMIT) {
        console.log(`[${VERSION}] ⏰ Timeout (30s), stopping at page ${page}`);
        break;
      }
      
      // 페이지 URL 생성
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', page.toString());
      const pageUrl = urlObj.toString();

      // HTML 가져오기
      let html;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`[${VERSION}] ❌ HTTP ${response.status}, stopping`);
          break;
        }
        
        html = await response.text();
      } catch (fetchError) {
        console.error(`[${VERSION}] ❌ Fetch error: ${fetchError.message}, stopping`);
        break;
      }

      // 링크 추출 (페이지당 최대 8개)
      const links = extractLinks(
        html, 
        sourceUrl.container_selector, 
        sourceUrl.link_selector, 
        MAX_LINKS_PER_PAGE
      );
      
      if (links.length === 0) {
        console.log(`[${VERSION}] No links found on page ${page}, stopping`);
        break;
      }

      console.log(`[${VERSION}] ✅ Found ${links.length} links on page ${page}`);
      allLinks.push(...links);

      // 짧은 대기 (서버 부하 방지)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[${VERSION}] ✅ Extraction complete: ${pagesProcessed} pages, ${allLinks.length} total links`);

    // 중복 제거
    const uniqueLinks = [...new Set(allLinks)];
    console.log(`[${VERSION}] 🔍 Unique links: ${uniqueLinks.length}`);
    
    // DB 최적화: 추출된 링크만 필터 쿼리
    const existingMatches = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      source_url: { $in: uniqueLinks }
    });
    const existingUrls = new Set(existingMatches.map(r => r.source_url));
    console.log(`[${VERSION}] 📊 Existing: ${existingUrls.size}, New: ${uniqueLinks.length - existingUrls.size}`);

    // 새 레코드 생성
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
      }
    }

    // 100개씩 청크로 저장
    if (recordsToCreate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < recordsToCreate.length; i += CHUNK_SIZE) {
        const chunk = recordsToCreate.slice(i, i + CHUNK_SIZE);
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.bulkCreate(chunk);
        console.log(`[${VERSION}] 💾 Saved ${Math.min(i + CHUNK_SIZE, recordsToCreate.length)}/${recordsToCreate.length}`);
      }
    }

    // 마지막 사용 시간 업데이트
    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      last_used_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      version: VERSION,
      pages_processed: pagesProcessed,
      max_pages_limit: MAX_PAGES,
      links_per_page_limit: MAX_LINKS_PER_PAGE,
      total_links: allLinks.length,
      unique_links: uniqueLinks.length,
      new_records: recordsToCreate.length,
      message: `✅ ${uniqueLinks.length}개 링크 추출 (${pagesProcessed}/${MAX_PAGES} 페이지, 신규 ${recordsToCreate.length}개)`
    });

  } catch (error) {
    console.error(`[${VERSION}] ❌ Error:`, error);
    return Response.json({ 
      success: false,
      version: VERSION,
      error: error.message
    }, { status: 500 });
  }
});

// 링크 추출 함수
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
      // 🔒 최대 개수 도달시 중단
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
        if (!links.includes(normalized)) {
          links.push(normalized);
        }
      }
    }
  } catch (e) {
    console.error('Parse error:', e);
  }

  return links;
}