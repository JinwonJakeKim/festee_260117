import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth, maxPages: reqMaxPages } = await req.json();
    
    // 🔒 안전장치: maxPages 강제 제한 (최대 5페이지) - 절대 변경 불가!
    const MAX_PAGES_LIMIT = 5;
    const maxPages = 5; // 하드코딩: 항상 5페이지만 탐색
    
    console.log(`[Japantravel] 🔒 HARDCODED maxPages=${maxPages} (requested: ${reqMaxPages})`);
    
    if (!sourceUrlId) {
      return Response.json({ 
        success: false,
        error: 'sourceUrlId is required' 
      }, { status: 400 });
    }

    // FestivalSourceUrl 조회
    const sourceUrl = await base44.asServiceRole.entities.FestivalSourceUrl.get(sourceUrlId);
    
    if (!sourceUrl) {
      return Response.json({
        success: false,
        error: 'Source URL not found'
      }, { status: 404 });
    }

    console.log(`[Japantravel] ================================`);
    console.log(`[Japantravel] 🚀 Starting link extraction`);
    console.log(`[Japantravel] 📄 Source URL: ${sourceUrl.url}`);
    console.log(`[Japantravel] 📊 maxPages LIMIT: ${maxPages} (HARDCODED)`);
    console.log(`[Japantravel] 🎯 Container: ${sourceUrl.container_selector}`);
    console.log(`[Japantravel] 🔗 Link selector: ${sourceUrl.link_selector}`);
    console.log(`[Japantravel] ================================`);
    
    const startTime = Date.now();
    const TIME_LIMIT_MS = 40000; // 40초 제한 (504 타임아웃 방지)
    
    // 날짜 매개변수 처리
    let baseUrl = sourceUrl.url;
    if (sourceUrl.use_date_parameters && sourceUrl.date_parameter_template && targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      
      baseUrl = sourceUrl.date_parameter_template
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{LAST_DAY}/g, lastDay.toString());
      
      console.log(`[Japantravel] Using date-parameterized URL: ${baseUrl}`);
    }

    const allExtractedLinks = [];
    let previousLinks = new Set();
    let totalLinksFound = 0;
    let pagesProcessed = 0;

    // 페이지네이션 처리 - for 루프로 명확히 제한
    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      console.log(`[Japantravel] 🔄 Loop START: page ${currentPage}/${maxPages}`);
      pagesProcessed = currentPage;
      // URL에 페이지 파라미터 추가 (중복 방지)
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', currentPage.toString());
      const pageUrl = urlObj.toString();

      console.log(`[Japantravel] Fetching page ${currentPage}/${maxPages}: ${pageUrl}`);

      let html;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`[Japantravel] Failed to fetch page ${currentPage}: HTTP ${response.status}`);
          break;
        }
        
        html = await response.text();
      } catch (fetchError) {
        console.error(`[Japantravel] Error fetching page ${currentPage}:`, fetchError);
        break;
      }

      // CSS 선택자로 링크 추출
      const links = await extractLinksFromHtml(html, sourceUrl.container_selector, sourceUrl.link_selector, pageUrl);
      
      if (links.length === 0) {
        console.log(`[Japantravel] No links found on page ${currentPage}, stopping`);
        break;
      }

      // 현재 페이지의 링크 Set
      const currentLinks = new Set(links);

      // 이전 페이지와 동일한 링크인지 확인 (마지막 페이지 판단)
      if (currentPage > 1 && areSetsEqual(currentLinks, previousLinks)) {
        console.log(`[Japantravel] Page ${currentPage} has same links as page ${currentPage - 1}, reached last page`);
        break;
      }

      console.log(`[Japantravel] ✅ Found ${links.length} festival links on page ${currentPage}`);
      allExtractedLinks.push(...links);
      totalLinksFound += links.length;

      previousLinks = currentLinks;
      
      // 전체 실행 시간 체크 (타임아웃 방지)
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log(`[Japantravel] ⚠️ Time limit reached (${TIME_LIMIT_MS}ms), stopping loop to prevent 504 error.`);
        break;
      }

      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Japantravel] ================================`);
    console.log(`[Japantravel] ✅ EXTRACTION COMPLETE`);
    console.log(`[Japantravel] 📄 Pages processed: ${pagesProcessed}`);
    console.log(`[Japantravel] 🔗 Total links found: ${totalLinksFound}`);
    console.log(`[Japantravel] ================================`);

    // 중복 제거
    const uniqueLinks = [...new Set(allExtractedLinks)];
    console.log(`[Japantravel] Unique links: ${uniqueLinks.length}`);

    // 기존 JapantravelUrlExtractionRawData 조회
    console.log(`[Japantravel] 🔍 Checking existing records...`);
    const existingRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.list();
    const existingUrls = new Set(existingRecords.map(r => r.source_url));

    let newCount = 0;
    let existingCount = 0;
    let retriedCount = 0;

    // 일괄 생성할 레코드와 업데이트할 레코드 분리
    const recordsToCreate = [];
    const recordsToUpdate = [];

    for (const link of uniqueLinks) {
      if (existingUrls.has(link)) {
        const existingRecord = existingRecords.find(r => r.source_url === link);
        if (existingRecord.processing_status === 'failed') {
          recordsToUpdate.push({ id: existingRecord.id, link });
          retriedCount++;
        } else {
          existingCount++;
        }
      } else {
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

    // 일괄 생성 (최대 10개씩)
    if (recordsToCreate.length > 0) {
      console.log(`[Japantravel] 💾 Creating ${recordsToCreate.length} new records...`);
      for (let i = 0; i < recordsToCreate.length; i += 10) {
        const batch = recordsToCreate.slice(i, i + 10);
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.bulkCreate(batch);
      }
    }

    // 실패한 레코드 업데이트
    if (recordsToUpdate.length > 0) {
      console.log(`[Japantravel] 🔄 Updating ${recordsToUpdate.length} failed records...`);
      for (const { id } of recordsToUpdate) {
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(id, {
          processing_status: 'pending',
          error_message: null
        });
      }
    }

    // FestivalSourceUrl의 last_used_date 업데이트
    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      last_used_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      source_url: sourceUrl.url,
      pages_processed: pagesProcessed,
      max_pages_limit: maxPages,
      total_links_found: totalLinksFound,
      unique_links: uniqueLinks.length,
      new_records: newCount,
      existing_records: existingCount,
      retried_failed: retriedCount,
      message: `✅ ${uniqueLinks.length}개의 축제 링크 추출 완료 (${pagesProcessed}/${maxPages} 페이지 탐색)\n신규: ${newCount}, 기존: ${existingCount}, 재시도: ${retriedCount}`
    });

  } catch (error) {
    console.error('[Japantravel] Link extraction error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Unknown error',
      details: error.toString()
    }, { status: 500 });
  }
});

// HTML에서 링크 추출 (CSS 선택자 사용, DOMParser 활용)
async function extractLinksFromHtml(html, containerSelector, linkSelector, baseUrl) {
  const links = new Set(); // 중복 방지를 위해 Set 사용

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc) {
      console.error('[Japantravel] Failed to parse HTML document.');
      return [];
    }

    // div.row.small-event-gutter 컨테이너를 찾음 (각 페이지당 1개)
    const container = doc.querySelector(containerSelector || 'div.row.small-event-gutter');
    
    if (!container) {
      console.error(`[Japantravel] Container not found with selector: ${containerSelector}`);
      return [];
    }

    console.log(`[Japantravel] Found container, extracting links...`);

    // 컨테이너 안의 축제 링크만 추출 (div.recommended-event-wrapper 안의 a 태그)
    // 기본값을 더 구체적으로 변경하여 축제 링크만 가져오도록 함
    const linkElements = container.querySelectorAll(linkSelector || 'div.recommended-event-wrapper a');
    console.log(`[Japantravel] Found ${linkElements.length} link elements in container`);

    // 각 링크를 확인하고 축제 상세 페이지 링크만 필터링
    for (const linkElement of linkElements) {
      const href = linkElement.getAttribute('href');
      if (!href) continue;

      // 절대 URL로 변환
      let absoluteUrl = href;
      try {
        if (href.startsWith('/')) {
          const base = new URL(baseUrl);
          absoluteUrl = base.origin + href;
        } else if (!href.startsWith('http')) {
          absoluteUrl = new URL(href, baseUrl).href;
        }
      } catch (urlError) {
        console.warn(`[Japantravel] Invalid URL encountered: ${href}, skipping.`);
        continue;
      }

      // japantravel.com의 축제 상세 페이지 패턴 필터링
      // 예: https://en.japantravel.com/tokyo/setagaya-plum-blossom-festival/60941
      // 패턴: https://{language}.japantravel.com/{prefecture}/{festival-slug}/{5자리 이상 숫자ID}
      const festivalUrlPattern = /^https?:\/\/[a-z]{2}\.japantravel\.com\/[^/?]+\/[^/?]+\/\d{5,}\/?$/;

      if (absoluteUrl.match(festivalUrlPattern)) {
        // URL 끝에 슬래시가 있으면 제거하여 정규화
        const normalizedUrl = absoluteUrl.replace(/\/$/, '');
        
        // URL 경로를 분리하여 마지막 부분이 5자리 이상 숫자인지 재확인
        const pathParts = normalizedUrl.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];
        
        // 마지막 부분이 5자리 이상의 순수 숫자인지 확인
        if (/^\d{5,}$/.test(lastPart)) {
          links.add(normalizedUrl);
        }
      }
    }

    console.log(`[Japantravel] Extracted ${links.size} unique festival links from this page`);
  } catch (e) {
    console.error('[Japantravel] Error parsing HTML or extracting links:', e);
  }

  return Array.from(links);
}

// Set 비교 함수
function areSetsEqual(set1, set2) {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
}