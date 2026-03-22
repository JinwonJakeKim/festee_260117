import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin 권한 체크
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[syncTourApiData] Starting TourAPI sync...');

    // 현재 월과 다음 월 계산
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const nextMonthDate = new Date(currentYear, currentMonth, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth() + 1;

    console.log(`[syncTourApiData] Syncing for: ${currentYear}년 ${currentMonth}월, ${nextYear}년 ${nextMonth}월`);

    // 한국 모든 지역 코드
    const areaCodes = ["1", "2", "3", "4", "5", "6", "7", "8", "31", "32", "33", "34", "35", "36", "37", "38", "39"];
    const areaNames = {
      "1": "서울", "2": "인천", "3": "대전", "4": "대구", "5": "광주",
      "6": "부산", "7": "울산", "8": "세종", "31": "경기도", "32": "강원도",
      "33": "충청북도", "34": "충청남도", "35": "경상북도", "36": "경상남도",
      "37": "전라북도", "38": "전라남도", "39": "제주도"
    };

    let totalFetched = 0;
    const fetchResults = [];

    // 1단계: 각 지역별로 원본 데이터 가져오기 (5분 간격)
    for (const areaCode of areaCodes) {
      console.log(`[syncTourApiData] Fetching ${areaNames[areaCode]} (areaCode: ${areaCode})...`);

      try {
        // 현재 월 데이터 가져오기
        const currentResponse = await base44.asServiceRole.functions.invoke('fetchTourFestivals', {
          areaCode: areaCode,
          year: currentYear,
          month: currentMonth,
          numOfRows: 100
        });

        if (currentResponse.data?.success) {
          console.log(`[syncTourApiData] ${areaNames[areaCode]} ${currentYear}년 ${currentMonth}월: ${currentResponse.data.raw_data_saved}개 저장`);
          totalFetched += currentResponse.data.raw_data_saved || 0;
          fetchResults.push({
            area: areaNames[areaCode],
            period: `${currentYear}년 ${currentMonth}월`,
            count: currentResponse.data.raw_data_saved
          });
        }

        // 다음 월 데이터 가져오기
        const nextResponse = await base44.asServiceRole.functions.invoke('fetchTourFestivals', {
          areaCode: areaCode,
          year: nextYear,
          month: nextMonth,
          numOfRows: 100
        });

        if (nextResponse.data?.success) {
          console.log(`[syncTourApiData] ${areaNames[areaCode]} ${nextYear}년 ${nextMonth}월: ${nextResponse.data.raw_data_saved}개 저장`);
          totalFetched += nextResponse.data.raw_data_saved || 0;
          fetchResults.push({
            area: areaNames[areaCode],
            period: `${nextYear}년 ${nextMonth}월`,
            count: nextResponse.data.raw_data_saved
          });
        }

      } catch (error) {
        console.error(`[syncTourApiData] Error fetching ${areaNames[areaCode]}:`, error.message);
        fetchResults.push({
          area: areaNames[areaCode],
          error: error.message
        });
      }

      // 다음 지역 처리 전 5분 대기 (마지막 지역 제외)
      if (areaCode !== areaCodes[areaCodes.length - 1]) {
        console.log('[syncTourApiData] Waiting 5 minutes before next region...');
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      }
    }

    console.log(`[syncTourApiData] 1단계 완료: 총 ${totalFetched}개 원본 데이터 수집`);

    // 2단계: pending 및 failed 상태의 데이터를 10개씩 변환
    console.log('[syncTourApiData] 2단계: 변환 대기 중인 데이터 처리 시작...');

    const rawDataList = await base44.asServiceRole.entities.TourApiRawData.list('-created_date', 1000);
    const pendingData = rawDataList.filter(r => r.processing_status === 'pending' || r.processing_status === 'failed');
    
    console.log(`[syncTourApiData] 변환 대기 중인 데이터: ${pendingData.length}개`);

    const MAX_TRANSFORM_COUNT = 10;
    let transformedCount = 0;
    const transformResults = [];

    // 10개씩 배치로 나누어 변환
    for (let i = 0; i < pendingData.length; i += MAX_TRANSFORM_COUNT) {
      const batch = pendingData.slice(i, i + MAX_TRANSFORM_COUNT);
      const batchIds = batch.map(r => r.id);

      console.log(`[syncTourApiData] 배치 ${Math.floor(i / MAX_TRANSFORM_COUNT) + 1} 변환 시작 (${batchIds.length}개)...`);

      try {
        const transformResponse = await base44.asServiceRole.functions.invoke('transformTourApiData', {
          rawDataIds: batchIds,
          retransform: false
        });

        if (transformResponse.data?.success) {
          const created = transformResponse.data.festivals_created || 0;
          transformedCount += created;
          console.log(`[syncTourApiData] 배치 ${Math.floor(i / MAX_TRANSFORM_COUNT) + 1} 완료: ${created}개 변환`);
          transformResults.push({
            batch: Math.floor(i / MAX_TRANSFORM_COUNT) + 1,
            count: created
          });
        }
      } catch (error) {
        console.error(`[syncTourApiData] 배치 ${Math.floor(i / MAX_TRANSFORM_COUNT) + 1} 변환 실패:`, error.message);
        transformResults.push({
          batch: Math.floor(i / MAX_TRANSFORM_COUNT) + 1,
          error: error.message
        });
      }

      // 다음 배치 처리 전 30초 대기 (마지막 배치 제외)
      if (i + MAX_TRANSFORM_COUNT < pendingData.length) {
        console.log('[syncTourApiData] Waiting 30 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 30 * 1000));
      }
    }

    console.log(`[syncTourApiData] 2단계 완료: 총 ${transformedCount}개 Festival 생성`);

    return Response.json({
      success: true,
      message: 'TourAPI 동기화 완료',
      summary: {
        raw_data_fetched: totalFetched,
        festivals_created: transformedCount,
        fetch_results: fetchResults,
        transform_results: transformResults
      }
    });

  } catch (error) {
    console.error('[syncTourApiData] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});