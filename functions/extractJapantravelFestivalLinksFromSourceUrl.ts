import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:deno-dom/deno-dom-wasm';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth, maxPages = 10 } = await req.json();
    
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

    console.log(`[Japantravel] Starting link extraction from: ${sourceUrl.url}`);
    console.log(`[Japantravel] Container selector: ${sourceUrl.container_selector}`);
    console.log(`[Japantravel] Link selector: ${sourceUrl.link_selector}`);
    
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
    let currentPage = 1;
    let previousLinks = new Set();
    let totalLinksFound = 0;

    // 페이지네이션 처리
    while (currentPage <= maxPages) {
      // URL에 페이지 파라미터 추가 (중복 방지)
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set('p', currentPage.toString());
      const pageUrl = urlObj.toString();

      console.log(`[Japantravel] Fetching page ${currentPage}: ${pageUrl}`);

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

      console.log(`[Japantravel] Found ${links.length} links on page ${currentPage}`);
      allExtractedLinks.push(...links);
      totalLinksFound += links.length;

      previousLinks = currentLinks;
      currentPage++;

      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Japantravel] Total pages processed: ${currentPage - 1}`);
    console.log(`[Japantravel] Total links found: ${totalLinksFound}`);

    // 중복 제거
    const uniqueLinks = [...new Set(allExtractedLinks)];
    console.log(`[Japantravel] Unique links: ${uniqueLinks.length}`);

    // 기존 JapantravelUrlExtractionRawData 조회
    const existingRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.list();
    const existingUrls = new Set(existingRecords.map(r => r.source_url));

    let newCount = 0;
    let existingCount = 0;
    let retriedCount = 0;

    // 각 링크를 JapantravelUrlExtractionRawData에 추가 또는 업데이트
    for (const link of uniqueLinks) {
      if (existingUrls.has(link)) {
        // 기존 레코드 찾기
        const existingRecord = existingRecords.find(r => r.source_url === link);
        
        if (existingRecord.processing_status === 'failed') {
          // 실패한 레코드는 다시 pending으로
          await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(existingRecord.id, {
            processing_status: 'pending',
            error_message: null
          });
          retriedCount++;
          console.log(`[Japantravel] Reset failed record to pending: ${link}`);
        } else {
          existingCount++;
        }
      } else {
        // 새로운 레코드 생성 - null 대신 빈 문자열 사용
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.create({
          source_url: link,
          country: sourceUrl.country,
          processing_status: 'pending',
          name_original: "",
          city: "",
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        });
        newCount++;
        console.log(`[Japantravel] Created new pending record: ${link}`);
      }
    }

    // FestivalSourceUrl의 last_used_date 업데이트
    await base44.asServiceRole.entities.FestivalSourceUrl.update(sourceUrlId, {
      last_used_date: new Date().toISOString()
    });

    return Response.json({
      success: true,
      source_url: sourceUrl.url,
      pages_processed: currentPage - 1,
      total_links_found: totalLinksFound,
      unique_links: uniqueLinks.length,
      new_records: newCount,
      existing_records: existingCount,
      retried_failed: retriedCount,
      message: `${uniqueLinks.length}개의 축제 링크를 추출했습니다. (신규: ${newCount}, 기존: ${existingCount}, 재시도: ${retriedCount})`
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

    // 컨테이너 안의 모든 링크 요소 찾기 (페이지당 8개 예상)
    const linkElements = container.querySelectorAll(linkSelector || 'a');
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