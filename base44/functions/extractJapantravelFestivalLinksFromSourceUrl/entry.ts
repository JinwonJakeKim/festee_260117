import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const VERSION = "v2026-05-10-API-BASED";
  const startTime = Date.now();
  const ABSOLUTE_TIME_LIMIT = 55000; // 55초
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 401 });
    }

    const { sourceUrlId, targetMonth } = await req.json();
    
    console.log(`[${VERSION}] 🚀 START sourceUrlId=${sourceUrlId}, targetMonth=${targetMonth}`);
    
    if (!sourceUrlId) {
      return Response.json({ success: false, error: 'sourceUrlId required' }, { status: 400 });
    }

    // FestivalSourceUrl 조회
    const sourceUrl = await base44.asServiceRole.entities.FestivalSourceUrl.get(sourceUrlId);
    if (!sourceUrl) {
      return Response.json({ success: false, error: 'Source not found' }, { status: 404 });
    }

    // 날짜 범위 계산
    let fromDate = '';
    let toDate = '';
    if (targetMonth) {
      const [year, month] = targetMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      fromDate = `${year}-${month}-01`;
      toDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    }

    console.log(`[${VERSION}] 📅 Date range: ${fromDate} ~ ${toDate}`);

    // API 기본 파라미터 구성 (japantravel events API)
    // 예시 URL: https://en.japantravel.com/events?type=event&from=2026-06-01&to=2026-06-30
    // 실제 API: https://api.japantravel.com/api/articles?page=N&...
    // FestivalSourceUrl의 url에서 쿼리 파라미터 추출
    const sourceUrlObj = new URL(sourceUrl.url.includes('?') ? sourceUrl.url : sourceUrl.url + '?');
    const baseParams = new URLSearchParams(sourceUrlObj.search);
    
    // 날짜 파라미터 설정
    if (fromDate) baseParams.set('from', fromDate);
    if (toDate) baseParams.set('to', toDate);

    const allLinks = [];
    let pagesProcessed = 0;
    let lastPage = 1;

    // 1페이지 먼저 요청하여 last_page 확인
    const firstApiUrl = `https://api.japantravel.com/api/articles?${baseParams.toString()}&page=1`;
    console.log(`[${VERSION}] 🔎 First page API URL: ${firstApiUrl}`);

    const firstRes = await fetch(firstApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://en.japantravel.com/',
      }
    });

    if (!firstRes.ok) {
      throw new Error(`API first page failed: ${firstRes.status}`);
    }

    const firstData = await firstRes.json();
    lastPage = firstData.meta?.last_page ?? 1;
    
    console.log(`[${VERSION}] 📊 Total pages: ${lastPage}, total items: ${firstData.meta?.total}`);

    // 1페이지 링크 추출
    const firstPageLinks = (firstData.items || []).map(item => item.url).filter(Boolean);
    allLinks.push(...firstPageLinks);
    pagesProcessed = 1;
    console.log(`[${VERSION}] ✅ Page 1: ${firstPageLinks.length} links`);

    // 나머지 페이지 순차 처리
    for (let page = 2; page <= lastPage; page++) {
      // 타임아웃 체크
      if (Date.now() - startTime > ABSOLUTE_TIME_LIMIT) {
        console.log(`[${VERSION}] ⏰ Timeout at page ${page}/${lastPage}`);
        break;
      }

      const apiUrl = `https://api.japantravel.com/api/articles?${baseParams.toString()}&page=${page}`;
      console.log(`[${VERSION}] 🔎 Page ${page}/${lastPage}: ${apiUrl}`);

      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://en.japantravel.com/',
        }
      });

      if (!res.ok) {
        console.log(`[${VERSION}] ❌ HTTP ${res.status} on page ${page}, stopping`);
        break;
      }

      const data = await res.json();
      const pageLinks = (data.items || []).map(item => item.url).filter(Boolean);
      
      console.log(`[${VERSION}] ✅ Page ${page}: ${pageLinks.length} links`);
      allLinks.push(...pageLinks);
      pagesProcessed = page;

      // 서버 부하 방지
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[${VERSION}] ✅ Done: ${pagesProcessed}/${lastPage} pages, ${allLinks.length} total links`);

    // 중복 제거
    const uniqueLinks = [...new Set(allLinks)];
    console.log(`[${VERSION}] 🔍 Unique links: ${uniqueLinks.length}`);

    // 기존 레코드 확인
    const existingMatches = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({
      source_url: { $in: uniqueLinks }
    });
    const existingUrls = new Set(existingMatches.map(r => r.source_url));
    console.log(`[${VERSION}] 📊 Existing: ${existingUrls.size}, New: ${uniqueLinks.length - existingUrls.size}`);

    // 새 레코드 생성
    const recordsToCreate = uniqueLinks
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
      total_pages: lastPage,
      total_links: allLinks.length,
      unique_links: uniqueLinks.length,
      new_records: recordsToCreate.length,
      message: `✅ ${uniqueLinks.length}개 링크 추출 (${pagesProcessed}/${lastPage} 페이지, 신규 ${recordsToCreate.length}개)`
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