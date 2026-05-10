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

    // API 파라미터 구성 - type=event 고정, 날짜 파라미터만 추가
    const buildApiUrl = (page) => {
      const params = new URLSearchParams({ type: 'event', page: String(page) });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      return `https://api.japantravel.com/api/articles?${params.toString()}`;
    };

    const allLinks = [];
    let pagesProcessed = 0;
    let lastPage = 1;

    // 1페이지 먼저 요청하여 last_page 확인
    const firstApiUrl = buildApiUrl(1);
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

    // API 응답 구조 전체 디버깅
    console.log(`[${VERSION}] 🔍 firstData keys: ${Object.keys(firstData).join(', ')}`);
    console.log(`[${VERSION}] 🔍 firstData.meta: ${JSON.stringify(firstData.meta)}`);
    const firstItems = firstData.items || firstData.data || firstData.results || firstData.articles || [];
    console.log(`[${VERSION}] 🔍 firstItems.length: ${firstItems.length}`);
    if (firstItems.length > 0) {
      console.log(`[${VERSION}] 🔍 First item keys: ${Object.keys(firstItems[0]).join(', ')}`);
      console.log(`[${VERSION}] 🔍 First item sample: ${JSON.stringify(firstItems[0]).substring(0, 500)}`);
    } else {
      // items가 없으면 전체 응답 확인
      console.log(`[${VERSION}] 🔍 Full response (first 1000 chars): ${JSON.stringify(firstData).substring(0, 1000)}`);
    }

    // URL 필드 자동 감지 (url, permalink, slug, link 순서로 시도)
    const extractUrl = (item) => {
      let url = null;
      if (item.url) url = item.url;
      else if (item.permalink) url = item.permalink;
      else if (item.slug) url = `https://en.japantravel.com/event/${item.slug}`;
      else if (item.link) url = item.link;
      else if (item.id) url = `https://en.japantravel.com/events/${item.id}`;
      
      if (!url) return null;
      // en.en. 중복 방지
      return url.replace('https://en.en.japantravel.com/', 'https://en.japantravel.com/');
    };

    const firstPageLinks = firstItems.map(extractUrl).filter(Boolean);
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

      const apiUrl = buildApiUrl(page);
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
      const pageItems = data.data || data.items || data.results || data.articles || [];
      const pageLinks = pageItems.map(extractUrl).filter(Boolean);
      
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

    // 기존 레코드 확인 (JapantravelLinks)
    const existingMatches = await base44.asServiceRole.entities.JapantravelLinks.filter({
      url: { $in: uniqueLinks }
    });
    const existingUrls = new Set(existingMatches.map(r => r.url));
    console.log(`[${VERSION}] 📊 Existing: ${existingUrls.size}, New: ${uniqueLinks.length - existingUrls.size}`);

    const now = new Date().toISOString();

    // 새 레코드 생성
    const recordsToCreate = uniqueLinks
      .filter(link => !existingUrls.has(link))
      .map(link => ({
        url: link,
        country: sourceUrl.country,
        source_url_id: sourceUrlId,
        processing_status: 'pending',
        create_time: now,
        update_time: now,
      }));

    // 100개씩 청크로 저장
    if (recordsToCreate.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < recordsToCreate.length; i += CHUNK_SIZE) {
        const chunk = recordsToCreate.slice(i, i + CHUNK_SIZE);
        await base44.asServiceRole.entities.JapantravelLinks.bulkCreate(chunk);
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