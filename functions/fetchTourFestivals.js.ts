import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        success: false,
        error: 'Unauthorized - Admin only' 
      }, { status: 401 });
    }

    const { areaCode, year, month, numOfRows = 20 } = await req.json();
    
    const apiKey = Deno.env.get("TOUR_API_KEY");
    
    if (!apiKey) {
      console.error('[TourAPI] API Key not found in environment');
      return Response.json({
        success: false,
        error: 'API Key not configured',
        message: 'TourAPI 인증키가 설정되지 않았습니다.'
      }, { status: 500 });
    }
    
    const baseUrl = "https://apis.data.go.kr/B551011/KorService2";
    
    console.log(`[TourAPI] ========== NEW REQUEST ==========`);
    console.log(`[TourAPI] Step 1: Fetch and Store Raw Data`);
    console.log(`[TourAPI] Params:`, { areaCode, year, month, numOfRows });
    
    // 선택한 월의 범위 계산
    let startDateFilter = null;
    let endDateFilter = null;
    let apiEventStartDate = "20200101";
    
    if (year && month) {
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      
      startDateFilter = `${yearNum}${String(monthNum).padStart(2, '0')}01`;
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      endDateFilter = `${yearNum}${String(monthNum).padStart(2, '0')}${lastDay}`;
      apiEventStartDate = startDateFilter;
      
      console.log(`[TourAPI] Target month: ${year}년 ${month}월`);
      console.log(`[TourAPI] Filter range: ${startDateFilter} ~ ${endDateFilter}`);
    }
    
    // API 요청
    const searchParams = new URLSearchParams({
      serviceKey: apiKey,
      numOfRows: "100",
      pageNo: "1",
      MobileOS: "ETC",
      MobileApp: "Festee",
      _type: "json",
      arrange: "R",
      eventStartDate: apiEventStartDate,
    });
    
    if (areaCode && areaCode !== "all") {
      searchParams.append("areaCode", areaCode.toString());
    }
    
    const searchUrl = `${baseUrl}/searchFestival2?${searchParams.toString()}`;
    console.log(`[TourAPI] Request URL:`, searchUrl);
    
    let searchResponse;
    let responseText;
    
    try {
      searchResponse = await fetch(searchUrl);
      responseText = await searchResponse.text();
      
      console.log(`[TourAPI] Response Status: ${searchResponse.status}`);
      console.log(`[TourAPI] Response Length: ${responseText.length} bytes`);
      
    } catch (fetchError) {
      console.error('[TourAPI] Fetch error:', fetchError);
      return Response.json({
        success: false,
        error: 'Network error',
        message: 'TourAPI 서버에 연결할 수 없습니다.',
        details: fetchError.message
      });
    }
    
    if (responseText.trim().startsWith('<?xml') || responseText.trim().startsWith('<!DOCTYPE')) {
      console.error('[TourAPI] Invalid response format');
      return Response.json({
        success: false,
        error: 'Invalid Response',
        message: 'API가 XML 또는 HTML로 응답했습니다. API 키를 확인해주세요.',
        raw_response: responseText.substring(0, 1000)
      });
    }
    
    let searchData;
    try {
      searchData = JSON.parse(responseText);
      console.log(`[TourAPI] ✓ JSON parsed successfully`);
    } catch (parseError) {
      console.error('[TourAPI] JSON parse error:', parseError);
      return Response.json({
        success: false,
        error: 'Invalid JSON response',
        message: 'API 응답을 JSON으로 파싱할 수 없습니다.',
        raw_response: responseText.substring(0, 1000)
      });
    }
    
    const resultCode = searchData.response?.header?.resultCode || searchData.resultCode;
    const resultMsg = searchData.response?.header?.resultMsg || searchData.resultMsg;
    
    console.log(`[TourAPI] Result Code:`, resultCode);
    console.log(`[TourAPI] Result Message:`, resultMsg);
    
    if (resultCode !== "0000" && resultCode !== "00") {
      const errorMessages = {
        '01': '어플리케이션 에러',
        '03': '데이터 없음',
        '10': '잘못된 요청 파라미터',
        '11': '필수 요청 파라미터가 없음',
        '20': '서비스 접근 거부',
        '22': '호출 횟수 초과',
        '30': '등록되지 않은 서비스키',
        '31': '서비스키 기간 만료',
        '32': '서비스키 일시정지',
        '33': '서비스키 등록 해지',
      };
      
      return Response.json({
        success: false,
        error: `API Error: ${resultCode}`,
        message: `TourAPI 오류 [${resultCode}]: ${errorMessages[resultCode] || resultMsg}`,
        result_msg: resultMsg
      });
    }
    
    if (!searchData.response?.body?.items?.item) {
      console.log('[TourAPI] No festivals found');
      return Response.json({
        success: true,
        raw_data_saved: 0,
        message: '조건에 맞는 축제를 찾을 수 없습니다.'
      });
    }
    
    let festivalItems = Array.isArray(searchData.response.body.items.item) 
      ? searchData.response.body.items.item 
      : [searchData.response.body.items.item];
    
    console.log(`[TourAPI] Found ${festivalItems.length} festivals from API`);
    
    // 월 범위 필터링
    if (startDateFilter && endDateFilter) {
      const monthStart = parseInt(startDateFilter);
      const monthEnd = parseInt(endDateFilter);
      
      festivalItems = festivalItems.filter(item => {
        if (!item.eventstartdate || !item.eventenddate) return false;
        const festivalStart = parseInt(item.eventstartdate);
        const festivalEnd = parseInt(item.eventenddate);
        return festivalEnd >= monthStart && festivalStart <= monthEnd;
      });
      
      console.log(`[TourAPI] After filtering: ${festivalItems.length} festivals`);
    }
    
    // 원본 데이터를 TourApiRawData에 저장
    console.log(`[TourAPI] ========== STORING RAW DATA ==========`);
    const savedRawData = [];
    const errors = [];
    
    for (let i = 0; i < festivalItems.length; i++) {
      const item = festivalItems[i];
      
      try {
        console.log(`[TourAPI] Storing ${i + 1}/${festivalItems.length}: ${item.title}`);
        
        // contentId로 기존 데이터 확인
        const existing = await base44.asServiceRole.entities.TourApiRawData.filter({ 
          contentid: item.contentid 
        });
        
        const rawData = {
          contentid: item.contentid,
          contenttypeid: item.contenttypeid || '',
          title: item.title,
          eventstartdate: item.eventstartdate || '',
          eventenddate: item.eventenddate || '',
          addr1: item.addr1 || '',
          addr2: item.addr2 || '',
          firstimage: item.firstimage || '',
          mapx: item.mapx || '',
          mapy: item.mapy || '',
          tel: item.tel || '',
          cat1: item.cat1 || '',
          cat2: item.cat2 || '',
          cat3: item.cat3 || '',
          areacode: areaCode || '',
          sigungucode: item.sigungucode || '',
          raw_search_json: JSON.stringify(item),
          processing_status: 'pending',
          fetch_date: new Date().toISOString()
        };
        
        if (existing.length > 0) {
          // 업데이트
          await base44.asServiceRole.entities.TourApiRawData.update(existing[0].id, rawData);
          savedRawData.push({ ...rawData, id: existing[0].id, isNew: false });
          console.log(`[TourAPI] ✓ Updated existing: ${item.title}`);
        } else {
          // 새로 생성
          const created = await base44.asServiceRole.entities.TourApiRawData.create(rawData);
          savedRawData.push({ ...rawData, id: created.id, isNew: true });
          console.log(`[TourAPI] ✓ Created new: ${item.title}`);
        }
        
      } catch (error) {
        console.error(`[TourAPI] Error storing ${item.title}:`, error);
        errors.push({ 
          festival: item.title, 
          error: error.message 
        });
      }
    }
    
    console.log(`[TourAPI] ========== SUMMARY ==========`);
    console.log(`[TourAPI] API returned: ${festivalItems.length} festivals`);
    console.log(`[TourAPI] Successfully saved: ${savedRawData.length} raw data records`);
    console.log(`[TourAPI] Failed: ${errors.length} records`);
    console.log(`[TourAPI] New records: ${savedRawData.filter(r => r.isNew).length}`);
    console.log(`[TourAPI] Updated records: ${savedRawData.filter(r => !r.isNew).length}`);
    
    return Response.json({
      success: true,
      raw_data_saved: savedRawData.length,
      new_records: savedRawData.filter(r => r.isNew).length,
      updated_records: savedRawData.filter(r => !r.isNew).length,
      raw_data_ids: savedRawData.map(r => r.id),
      message: `${savedRawData.length}개의 원본 데이터를 저장했습니다. 이제 변환 작업을 진행하세요.`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[TourAPI] Function error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류',
      message: 'TourAPI 연동 중 오류가 발생했습니다.',
      details: error.toString(),
      stack: error.stack
    }, { status: 500 });
  }
});