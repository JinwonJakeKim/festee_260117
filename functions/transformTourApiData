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

    const { rawDataIds } = await req.json();
    
    if (!rawDataIds || rawDataIds.length === 0) {
      return Response.json({
        success: false,
        error: 'No data to transform',
        message: '변환할 원본 데이터가 없습니다.'
      }, { status: 400 });
    }
    
    console.log(`[Transform] ========== START TRANSFORMATION ==========`);
    console.log(`[Transform] Processing ${rawDataIds.length} raw data records`);
    
    const apiKey = Deno.env.get("TOUR_API_KEY");
    const baseUrl = "https://apis.data.go.kr/B551011/KorService2";
    
    const festivals = [];
    const errors = [];
    
    for (let i = 0; i < rawDataIds.length; i++) {
      const rawDataId = rawDataIds[i];
      
      try {
        console.log(`[Transform] ========== Processing ${i + 1}/${rawDataIds.length} ==========`);
        
        // TourApiRawData 가져오기
        const rawDataList = await base44.asServiceRole.entities.TourApiRawData.filter({ id: rawDataId });
        
        if (rawDataList.length === 0) {
          console.error(`[Transform] Raw data not found: ${rawDataId}`);
          errors.push({ id: rawDataId, error: 'Raw data not found' });
          continue;
        }
        
        const rawData = rawDataList[0];
        console.log(`[Transform] Processing: ${rawData.title}`);
        
        // processing 상태로 변경
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processing'
        });
        
        // Rate limit 방지를 위한 딜레이
        if (i > 0) {
          console.log(`[Transform] Waiting 300ms...`);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // 헬퍼 함수들
        const extractCity = (addr) => {
          if (!addr) return '서울';
          const match = addr.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
          if (match) {
            if (match[1] === '경기') {
              const cityMatch = addr.match(/경기도?\s+([^\s]+시)/);
              return cityMatch ? cityMatch[1].replace('시', '') : '경기';
            }
            return match[1];
          }
          return '서울';
        };
        
        const mapCategory = (cat3code) => {
          const categoryMap = {
            'A0207': '음악',
            'A0208': '문화',
            'A02070': '음악',
            'A02080': '문화',
          };
          return categoryMap[cat3code] || '지역축제';
        };
        
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr.length !== 8) return null;
          return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        };
        
        const cleanHomepage = (homepage) => {
          if (!homepage) return '';
          return homepage.replace(/<[^>]*>/g, '').trim();
        };
        
        let formattedStartDate = formatDate(rawData.eventstartdate);
        let formattedEndDate = formatDate(rawData.eventenddate);
        let detailData = {};
        let introData = {};
        
        // detailCommon2 호출 시도
        if (apiKey) {
          try {
            const detailParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
              defaultYN: "Y",
              firstImageYN: "Y",
              areacodeYN: "Y",
              addrinfoYN: "Y",
              mapinfoYN: "Y",
              overviewYN: "Y",
            });
            
            const detailUrl = `${baseUrl}/detailCommon2?${detailParams.toString()}`;
            const detailResponse = await fetch(detailUrl);
            
            if (detailResponse.ok) {
              const detailText = await detailResponse.text();
              const detailJson = JSON.parse(detailText);
              
              if (detailJson.response?.header?.resultCode === "0000" || detailJson.response?.header?.resultCode === "00") {
                detailData = detailJson.response?.body?.items?.item?.[0] || detailJson.response?.body?.items?.item || {};
                
                // TourApiRawData에 저장
                await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                  overview: detailData.overview || '',
                  homepage: detailData.homepage || '',
                  raw_detail_json: JSON.stringify(detailData)
                });
                
                console.log(`[Transform] ✓ detailCommon2 success`);
              }
            }
          } catch (e) {
            console.log(`[Transform] detailCommon2 error: ${e.message}`);
          }
          
          // 딜레이
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // detailIntro2 호출 시도
          try {
            const introParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              contentTypeId: "15",
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
            });
            
            const introUrl = `${baseUrl}/detailIntro2?${introParams.toString()}`;
            const introResponse = await fetch(introUrl);
            
            if (introResponse.ok) {
              const introText = await introResponse.text();
              const introJson = JSON.parse(introText);
              
              if (introJson.response?.header?.resultCode === "0000" || introJson.response?.header?.resultCode === "00") {
                introData = introJson.response?.body?.items?.item?.[0] || introJson.response?.body?.items?.item || {};
                
                // 날짜 업데이트
                if (introData.eventstartdate) {
                  formattedStartDate = formatDate(introData.eventstartdate) || formattedStartDate;
                }
                if (introData.eventenddate) {
                  formattedEndDate = formatDate(introData.eventenddate) || formattedEndDate;
                }
                
                // TourApiRawData에 저장
                await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                  playtime: introData.playtime || '',
                  eventplace: introData.eventplace || '',
                  sponsor1: introData.sponsor1 || '',
                  sponsor1tel: introData.sponsor1tel || '',
                  raw_intro_json: JSON.stringify(introData)
                });
                
                console.log(`[Transform] ✓ detailIntro2 success`);
              }
            }
          } catch (e) {
            console.log(`[Transform] detailIntro2 error: ${e.message}`);
          }
        }
        
        // 날짜 검증
        if (!formattedStartDate || !formattedEndDate) {
          console.error(`[Transform] ✗ REJECTED: ${rawData.title} - Missing dates`);
          await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
            processing_status: 'failed',
            error_message: 'Missing start_date or end_date'
          });
          errors.push({ 
            id: rawDataId, 
            festival: rawData.title, 
            error: 'Missing dates' 
          });
          continue;
        }
        
        const longitude = (detailData.mapx || rawData.mapx) ? parseFloat(detailData.mapx || rawData.mapx) : null;
        const latitude = (detailData.mapy || rawData.mapy) ? parseFloat(detailData.mapy || rawData.mapy) : null;
        
        // Festival 엔티티 생성
        const festival = {
          name: detailData.title || rawData.title,
          description: detailData.overview || rawData.overview || rawData.title,
          country: '대한민국',
          city: extractCity(detailData.addr1 || rawData.addr1),
          category: mapCategory(rawData.cat3),
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          latitude: latitude,
          longitude: longitude,
          thumbnail_url: detailData.firstimage || rawData.firstimage || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
          video_url: '',
          website: cleanHomepage(detailData.homepage || rawData.homepage || ''),
          price: 0,
          opening_hours: introData.playtime || rawData.playtime || introData.usetimefestival || '',
          access_info: (detailData.addr1 || rawData.addr1) ? `${detailData.addr1 || rawData.addr1} ${detailData.addr2 || rawData.addr2 || ''}`.trim() : '',
          parking_info: introData.parkingfee || introData.parkingfestival || '',
          organizer: introData.sponsor1 || rawData.sponsor1 || introData.sponsor2 || '',
          contact: {
            phone: detailData.tel || rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '',
            email: ''
          },
          highlights: [],
          lineup: [],
          tags: ['국내축제', '한국관광공사', extractCity(detailData.addr1 || rawData.addr1)],
          star_rating: 0,
          likes_count: 0,
          catches_count: 0
        };
        
        // Festival 생성
        const createdFestival = await base44.asServiceRole.entities.Festival.create(festival);
        festivals.push(createdFestival);
        
        // TourApiRawData 상태 업데이트
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processed',
          festival_id: createdFestival.id,
          error_message: ''
        });
        
        console.log(`[Transform] ✓ SUCCESS: ${festival.name} created`);
        
      } catch (error) {
        console.error(`[Transform] Exception for ${rawDataId}:`, error);
        
        try {
          await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
            processing_status: 'failed',
            error_message: error.message
          });
        } catch (updateError) {
          console.error(`[Transform] Failed to update error status:`, updateError);
        }
        
        errors.push({ 
          id: rawDataId, 
          error: error.message 
        });
      }
    }
    
    console.log(`[Transform] ========== SUMMARY ==========`);
    console.log(`[Transform] Processed: ${rawDataIds.length} raw data records`);
    console.log(`[Transform] Successfully created: ${festivals.length} festivals`);
    console.log(`[Transform] Failed: ${errors.length} records`);
    
    return Response.json({
      success: true,
      festivals_created: festivals.length,
      festivals: festivals,
      message: `${festivals.length}개의 축제가 생성되었습니다.`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[Transform] Function error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류',
      message: '데이터 변환 중 오류가 발생했습니다.',
      details: error.toString(),
      stack: error.stack
    }, { status: 500 });
  }
});