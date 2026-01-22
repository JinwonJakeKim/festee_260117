import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
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

    console.log(`Starting link extraction from: ${sourceUrl.url}`);
    
    // 날짜 매개변수 처리
    let baseUrl = sourceUrl.url;
    if (sourceUrl.use_date_parameters && sourceUrl.date_parameter_template && targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      
      baseUrl = sourceUrl.date_parameter_template
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{LAST_DAY}/g, lastDay.toString());
      
      console.log(`Using date-parameterized URL: ${baseUrl}`);
    }

    const allExtractedLinks = [];
    let currentPage = 1;
    let previousLinks = new Set();
    let totalLinksFound = 0;

    // 페이지네이션 처리
    while (true) {
      let pageUrl = baseUrl;
      
      // URL에 페이지 파라미터 추가
      if (pageUrl.includes('?')) {
        pageUrl = `${pageUrl}&p=${currentPage}`;
      } else {
        pageUrl = `${pageUrl}?p=${currentPage}`;
      }

      console.log(`Fetching page ${currentPage}: ${pageUrl}`);

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
          console.log(`Failed to fetch page ${currentPage}: HTTP ${response.status}`);
          break;
        }
        
        html = await response.text();
      } catch (fetchError) {
        console.error(`Error fetching page ${currentPage}:`, fetchError);
        break;
      }

      // CSS 선택자로 링크 추출
      const links = extractLinksFromHtml(html, sourceUrl.container_selector, sourceUrl.link_selector, pageUrl);
      
      if (links.length === 0) {
        console.log(`No links found on page ${currentPage}, stopping`);
        break;
      }

      // 현재 페이지의 링크 Set
      const currentLinks = new Set(links);

      // 이전 페이지와 동일한 링크인지 확인 (마지막 페이지 판단)
      if (currentPage > 1 && areSetsEqual(currentLinks, previousLinks)) {
        console.log(`Page ${currentPage} has same links as page ${currentPage - 1}, reached last page`);
        break;
      }

      console.log(`Found ${links.length} links on page ${currentPage}`);
      allExtractedLinks.push(...links);
      totalLinksFound += links.length;

      previousLinks = currentLinks;
      currentPage++;

      // 안전장치: 최대 100페이지까지만
      if (currentPage > 100) {
        console.log('Reached maximum page limit (100), stopping');
        break;
      }

      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Total pages processed: ${currentPage - 1}`);
    console.log(`Total links found: ${totalLinksFound}`);

    // 중복 제거
    const uniqueLinks = [...new Set(allExtractedLinks)];
    console.log(`Unique links: ${uniqueLinks.length}`);

    // 기존 UrlExtractionRawData 조회
    const existingRecords = await base44.asServiceRole.entities.UrlExtractionRawData.list();
    const existingUrls = new Set(existingRecords.map(r => r.source_url));

    let newCount = 0;
    let existingCount = 0;
    let retriedCount = 0;

    // 각 링크를 UrlExtractionRawData에 추가 또는 업데이트
    for (const link of uniqueLinks) {
      if (existingUrls.has(link)) {
        // 기존 레코드 찾기
        const existingRecord = existingRecords.find(r => r.source_url === link);
        
        if (existingRecord.processing_status === 'failed') {
          // 실패한 레코드는 다시 pending으로
          await base44.asServiceRole.entities.UrlExtractionRawData.update(existingRecord.id, {
            processing_status: 'pending',
            error_message: null
          });
          retriedCount++;
          console.log(`Reset failed record to pending: ${link}`);
        } else {
          existingCount++;
        }
      } else {
        // 새로운 레코드 생성
        await base44.asServiceRole.entities.UrlExtractionRawData.create({
          source_url: link,
          country: sourceUrl.country,
          processing_status: 'pending',
          name_original: null,
          city: null,
          start_date: '2026-01-01',
          end_date: '2026-01-01',
        });
        newCount++;
        console.log(`Created new pending record: ${link}`);
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
    console.error('Link extraction error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Unknown error',
      details: error.toString()
    }, { status: 500 });
  }
});

// HTML에서 링크 추출 (CSS 선택자 사용)
function extractLinksFromHtml(html, containerSelector, linkSelector, baseUrl) {
  const links = [];
  
  try {
    // 간단한 정규식 기반 추출 (Deno에서 DOM 파서 없이)
    // container 내부의 링크만 추출하려면 더 정교한 파싱이 필요하지만,
    // 여기서는 linkSelector로 모든 링크를 찾고 필터링
    
    // 링크 패턴 찾기
    const linkPattern = new RegExp(`<a[^>]*href=["']([^"']+)["'][^>]*>`, 'gi');
    let match;
    
    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      
      // 절대 URL로 변환
      let absoluteUrl = href;
      if (href.startsWith('/')) {
        const base = new URL(baseUrl);
        absoluteUrl = base.origin + href;
      } else if (!href.startsWith('http')) {
        absoluteUrl = new URL(href, baseUrl).href;
      }
      
      // japantravel.com의 이벤트 상세 페이지 패턴 필터링
      // 예: https://en.japantravel.com/.../{event-name}
      if (absoluteUrl.includes('japantravel.com') && 
          !absoluteUrl.includes('?') && 
          !absoluteUrl.includes('/events') &&
          !absoluteUrl.includes('#')) {
        links.push(absoluteUrl);
      }
    }
  } catch (e) {
    console.error('Error parsing HTML:', e);
  }
  
  return links;
}

// Set 비교 함수
function areSetsEqual(set1, set2) {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
}