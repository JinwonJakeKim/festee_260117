import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  console.log('[TourAPI] ========== FUNCTION STARTED ==========');
  
  try {
    // 1. SDK 초기화
    console.log('[TourAPI] Step 1: Initialize SDK');
    const base44 = createClientFromRequest(req);
    
    // 2. 사용자 인증
    console.log('[TourAPI] Step 2: Check user authentication');
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error('[TourAPI] Auth error:', authError);
      return Response.json({ 
        success: false,
        error: 'Authentication failed',
        message: '인증에 실패했습니다.',
        details: authError.message
      }, { status: 401 });
    }
    
    if (!user || user.role !== 'admin') {
      console.error('[TourAPI] User is not admin:', user);
      return Response.json({ 
        success: false,
        error: 'Unauthorized - Admin only',
        message: '관리자 권한이 필요합니다.'
      }, { status: 401 });
    }
    
    console.log('[TourAPI] ✓ User authenticated:', user.email, 'Role:', user.role);

    // 3. Request body 파싱
    console.log('[TourAPI] Step 3: Parse request body');
    let requestBody;
    try {
      const bodyText = await req.text();
      console.log('[TourAPI] Request body text:', bodyText);
      requestBody = JSON.parse(bodyText);
      console.log('[TourAPI] Parsed request body:', requestBody);
    } catch (parseError) {
      console.error('[TourAPI] Request body parse error:', parseError);
      return Response.json({
        success: false,
        error: 'Invalid request body',
        message: '요청 데이터 형식이 올바르지 않습니다.',
        details: parseError.message
      }, { status: 400 });
    }
    
    const { areaCode, year, month, numOfRows = 20 } = requestBody;
    console.log('[TourAPI] Request params:', { areaCode, year, month, numOfRows });
    
    // 4. API 키 확인
    console.log('[TourAPI] Step 4: Check API key');
    const apiKey = Deno.env.get("TOUR_API_KEY");
    
    if (!apiKey) {
      console.error('[TourAPI] API Key not found in environment');
      return Response.json({
        success: false,
        error: 'API Key not configured',
        message: 'TourAPI 인증키가 설정되지 않았습니다.'
      }, { status: 500 });
    }
    
    console.log('[TourAPI] ✓ API Key found');
    
    const baseUrl = "https://apis.data.go.kr/B551011/KorService2";
    
    // 5. 날짜 범위 계산
    console.log('[TourAPI] Step 5: Calculate date range');
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
    
    // 6. API 요청 준비
    console.log('[TourAPI] Step 6: Prepare API request');
    const searchParams = new URLSearchParams({
      serviceKey: apiKey,
      numOfRows: numOfRows.toString(),
      pageNo: "1",
      MobileOS: "ETC",
      MobileApp: "Festee",
      _type: "json",
      arrange: "R",
      eventStartDate: apiEventStartDate,
    });
    
    if (areaCode && areaCode !== "all") {
      searchParams.append("areaCode", areaCode.toString());
      console.log(`[TourAPI] Area code filter: ${areaCode}`);
    }
    
    const searchUrl = `${baseUrl}/searchFestival2?${searchParams.toString()}`;
    console.log(`[TourAPI] Request URL: ${searchUrl.substring(0, 200)}...`);
    
    // 7. API 호출
    console.log('[TourAPI] Step 7: Call TourAPI');
    let searchResponse;
    let responseText;
    
    try {
      searchResponse = await fetch(searchUrl);
      console.log(`[TourAPI] Response status: ${searchResponse.status}`);
      console.log(`[TourAPI] Response status text: ${searchResponse.statusText}`);
      
      responseText = await searchResponse.text();
      console.log(`[TourAPI] Response length: ${responseText.length} bytes`);
      console.log(`[TourAPI] Response preview: ${responseText.substring(0, 500)}...`);
      
    } catch (fetchError) {
      console.error('[TourAPI] Fetch error:', fetchError);
      console.error('[TourAPI] Fetch error stack:', fetchError.stack);
      return Response.json({
        success: false,
        error: 'Network error',
        message: 'TourAPI 서버에 연결할 수 없습니다.',
        details: fetchError.message
      }, { status: 500 });
    }
    
    // 8. 응답 형식 확인
    console.log('[TourAPI] Step 8: Validate response format');
    if (responseText.trim().startsWith('<?xml') || responseText.trim().startsWith('<!DOCTYPE')) {
      console.error('[TourAPI] Invalid response format: XML/HTML');
      return Response.json({
        success: false,
        error: 'Invalid Response',
        message: 'API가 XML 또는 HTML로 응답했습니다. API 키를 확인해주세요.',
        raw_response: responseText.substring(0, 1000)
      }, { status: 500 });
    }
    
    // 9. JSON 파싱
    console.log('[TourAPI] Step 9: Parse JSON response');
    let searchData;
    try {
      searchData = JSON.parse(responseText);
      console.log(`[TourAPI] ✓ JSON parsed successfully`);
      console.log(`[TourAPI] Response structure:`, Object.keys(searchData));
    } catch (parseError) {
      console.error('[TourAPI] JSON parse error:', parseError);
      console.error('[TourAPI] Failed to parse:', responseText.substring(0, 1000));
      return Response.json({
        success: false,
        error: 'Invalid JSON response',
        message: 'API 응답을 JSON으로 파싱할 수 없습니다.',
        raw_response: responseText.substring(0, 1000)
      }, { status: 500 });
    }
    
    // 10. API 응답 코드 확인
    console.log('[TourAPI] Step 10: Check API response code');
    const resultCode = searchData.response?.header?.resultCode || searchData.resultCode;
    const resultMsg = searchData.response?.header?.resultMsg || searchData.resultMsg;
    
    console.log(`[TourAPI] Result Code: ${resultCode}`);
    console.log(`[TourAPI] Result Message: ${resultMsg}`);
    
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
      
      console.error(`[TourAPI] API Error: ${resultCode} - ${errorMessages[resultCode] || resultMsg}`);
      return Response.json({
        success: false,
        error: `API Error: ${resultCode}`,
        message: `TourAPI 오류 [${resultCode}]: ${errorMessages[resultCode] || resultMsg}`,
        result_msg: resultMsg
      }, { status: 400 });
    }
    
    // 11. 데이터 확인
    console.log('[TourAPI] Step 11: Check festival data');
    if (!searchData.response?.body?.items?.item) {
      console.log('[TourAPI] No festivals found in response');
      return Response.json({
        success: true,
        raw_data_saved: 0,
        new_records: 0,
        updated_records: 0,
        message: '조건에 맞는 축제를 찾을 수 없습니다.'
      });
    }
    
    let festivalItems = Array.isArray(searchData.response.body.items.item) 
      ? searchData.response.body.items.item 
      : [searchData.response.body.items.item];
    
    console.log(`[TourAPI] Found ${festivalItems.length} festivals from API`);
    
    // 12. 월 범위 필터링
    console.log('[TourAPI] Step 12: Filter by date range');
    if (startDateFilter && endDateFilter) {
      const monthStart = parseInt(startDateFilter);
      const monthEnd = parseInt(endDateFilter);
      
      const beforeFilter = festivalItems.length;
      festivalItems = festivalItems.filter(item => {
        if (!item.eventstartdate || !item.eventenddate) return false;
        const festivalStart = parseInt(item.eventstartdate);
        const festivalEnd = parseInt(item.eventenddate);
        return festivalEnd >= monthStart && festivalStart <= monthEnd;
      });
      
      console.log(`[TourAPI] Filtered: ${beforeFilter} → ${festivalItems.length} festivals`);
    }
    
    // 13. 데이터베이스에 저장
    console.log('[TourAPI] Step 13: Store raw data in database');
    const savedRawData = [];
    const errors = [];
    let newCount = 0;
    let updatedCount = 0;
    
    for (let i = 0; i < festivalItems.length; i++) {
      const item = festivalItems[i];
      
      try {
        console.log(`[TourAPI] [${i + 1}/${festivalItems.length}] Processing: ${item.title}`);
        
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
          updatedCount++;
          console.log(`[TourAPI] ✓ Updated: ${item.title}`);
        } else {
          // 새로 생성
          const created = await base44.asServiceRole.entities.TourApiRawData.create(rawData);
          savedRawData.push({ ...rawData, id: created.id, isNew: true });
          newCount++;
          console.log(`[TourAPI] ✓ Created: ${item.title}`);
        }
        
      } catch (dbError) {
        console.error(`[TourAPI] DB error for ${item.title}:`, dbError);
        console.error(`[TourAPI] DB error stack:`, dbError.stack);
        errors.push({ 
          festival: item.title, 
          error: dbError.message 
        });
      }
    }
    
    // 14. 최종 결과
    console.log('[TourAPI] ========== SUMMARY ==========');
    console.log(`[TourAPI] API returned: ${festivalItems.length} festivals`);
    console.log(`[TourAPI] Successfully saved: ${savedRawData.length} records`);
    console.log(`[TourAPI] New: ${newCount}, Updated: ${updatedCount}, Failed: ${errors.length}`);
    console.log('[TourAPI] ========== FUNCTION COMPLETED ==========');
    
    return Response.json({
      success: true,
      raw_data_saved: savedRawData.length,
      new_records: newCount,
      updated_records: updatedCount,
      raw_data_ids: savedRawData.map(r => r.id),
      message: `${savedRawData.length}개의 원본 데이터를 저장했습니다. 이제 변환 작업을 진행하세요.`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[TourAPI] ========== FATAL ERROR ==========');
    console.error('[TourAPI] Error type:', error.constructor.name);
    console.error('[TourAPI] Error message:', error.message);
    console.error('[TourAPI] Error stack:', error.stack);
    console.error('[TourAPI] ========================================');
    
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류',
      error_type: error.constructor.name,
      message: 'TourAPI 연동 중 오류가 발생했습니다.',
      details: error.toString(),
      stack: error.stack
    }, { status: 500 });
  }
});