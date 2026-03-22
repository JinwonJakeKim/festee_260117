import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { 
      list_page_url, 
      container_selector = 'div.row.small-event-gutter',
      link_selector = 'a'
    } = await req.json();
    
    if (!list_page_url) {
      return Response.json({ 
        success: false,
        error: 'list_page_url is required' 
      }, { status: 400 });
    }

    console.log(`[List Extraction] Starting batch extraction from: ${list_page_url}`);
    console.log(`[List Extraction] Container: ${container_selector}, Link: ${link_selector}`);

    // 1. 목록 페이지 HTML 가져오기
    let html;
    try {
      const response = await fetch(list_page_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      
      html = await response.text();
      console.log(`[List Extraction] Fetched HTML (${html.length} chars)`);
    } catch (fetchError) {
      console.error('[List Extraction] Fetch error:', fetchError);
      return Response.json({
        success: false,
        error: `Failed to fetch list page: ${fetchError.message}`
      }, { status: 500 });
    }

    // 2. 축제 링크 추출 (정규식 사용)
    const festivalLinks = [];
    const baseUrl = new URL(list_page_url);
    
    try {
      // container_selector 영역 찾기 (간단한 정규식)
      const containerPattern = container_selector
        .replace(/\./g, '\\.')
        .replace(/\s+/g, '\\s+');
      
      const containerRegex = new RegExp(`<div[^>]*class=["'][^"']*${containerPattern.split('.').pop()}[^"']*["'][^>]*>(.*?)</div>`, 'gis');
      const containerMatches = html.match(containerRegex);
      
      if (containerMatches && containerMatches.length > 0) {
        console.log(`[List Extraction] Found ${containerMatches.length} container matches`);
        
        // 각 컨테이너에서 링크 추출
        for (const container of containerMatches) {
          const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
          let linkMatch;
          
          while ((linkMatch = linkRegex.exec(container)) !== null) {
            let href = linkMatch[1];
            
            // 상대 경로를 절대 경로로 변환
            if (href.startsWith('/')) {
              href = `${baseUrl.origin}${href}`;
            } else if (!href.startsWith('http')) {
              href = `${baseUrl.origin}/${href}`;
            }
            
            // 중복 제거 및 유효한 링크만 추가
            if (href.includes(baseUrl.hostname) && !festivalLinks.includes(href)) {
              festivalLinks.push(href);
            }
          }
        }
      } else {
        console.log('[List Extraction] Container not found, searching all links');
        
        // 컨테이너를 찾지 못한 경우 전체 페이지에서 링크 추출
        const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
        let linkMatch;
        
        while ((linkMatch = linkRegex.exec(html)) !== null) {
          let href = linkMatch[1];
          
          if (href.startsWith('/')) {
            href = `${baseUrl.origin}${href}`;
          } else if (!href.startsWith('http')) {
            href = `${baseUrl.origin}/${href}`;
          }
          
          // /events/ 또는 /event/ 경로를 포함하는 링크만 (필터링)
          if (href.includes(baseUrl.hostname) && 
              (href.includes('/event') || href.includes('/festival')) && 
              !festivalLinks.includes(href) &&
              href !== list_page_url) {
            festivalLinks.push(href);
          }
        }
      }
      
      console.log(`[List Extraction] Extracted ${festivalLinks.length} festival links`);
    } catch (parseError) {
      console.error('[List Extraction] Parse error:', parseError);
      return Response.json({
        success: false,
        error: `Failed to parse HTML: ${parseError.message}`,
        links_found: 0
      }, { status: 500 });
    }

    if (festivalLinks.length === 0) {
      return Response.json({
        success: false,
        error: 'No festival links found on the page',
        message: 'Try adjusting the CSS selectors or check the page structure',
        links_found: 0
      });
    }

    // 3. 각 링크에 대해 extractFestivalFromUrl 호출
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < festivalLinks.length; i++) {
      const festivalUrl = festivalLinks[i];
      console.log(`[List Extraction] Processing ${i + 1}/${festivalLinks.length}: ${festivalUrl}`);
      
      try {
        const extractResult = await base44.functions.invoke('extractFestivalFromUrl', { 
          url: festivalUrl 
        });
        
        if (extractResult.data?.success) {
          successCount++;
          results.push({
            url: festivalUrl,
            success: true,
            festivals_found: extractResult.data.festivals_found || 0
          });
        } else {
          failCount++;
          results.push({
            url: festivalUrl,
            success: false,
            error: extractResult.data?.error || 'Unknown error'
          });
        }
      } catch (extractError) {
        console.error(`[List Extraction] Error extracting ${festivalUrl}:`, extractError);
        failCount++;
        results.push({
          url: festivalUrl,
          success: false,
          error: extractError.message
        });
      }

      // API 호출 간 짧은 지연 (rate limiting 방지)
      if (i < festivalLinks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[List Extraction] Batch completed: ${successCount} success, ${failCount} failed`);

    return Response.json({
      success: true,
      message: `일괄 추출 완료: ${festivalLinks.length}개 링크 중 ${successCount}개 성공`,
      links_found: festivalLinks.length,
      extraction_results: {
        total: festivalLinks.length,
        success: successCount,
        failed: failCount
      },
      results: results
    });

  } catch (error) {
    console.error('[List Extraction] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});