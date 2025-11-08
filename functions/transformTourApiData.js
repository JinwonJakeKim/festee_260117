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
        console.log(`[Transform] Processing: ${rawData.title} (contentid: ${rawData.contentid})`);
        
        // processing 상태로 변경
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processing'
        });
        
        // Rate limit 방지를 위한 딜레이
        if (i > 0) {
          console.log(`[Transform] Waiting 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500));
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
            'A02070200': '지역축제',
            'A02080': '문화',
            'A02080600': '문화',
            'A02081000': '문화',
            'A02081300': '문화',
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
        
        const cleanHtml = (text) => {
          if (!text) return '';
          return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
        };
        
        let formattedStartDate = formatDate(rawData.eventstartdate);
        let formattedEndDate = formatDate(rawData.eventenddate);
        let detailData = {};
        let introData = {};
        let infoData = [];
        
        // detailCommon2 호출 시도 - 모든 YN 파라미터 제거, 필수 파라미터만 사용
        if (apiKey && rawData.contentid) {
          try {
            const detailParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json"
            });
            
            const detailUrl = `${baseUrl}/detailCommon2?${detailParams.toString()}`;
            console.log(`[Transform] Calling detailCommon2 for contentId: ${rawData.contentid}`);
            
            const detailResponse = await fetch(detailUrl);
            const detailText = await detailResponse.text();
            
            console.log(`[Transform] detailCommon2 response status: ${detailResponse.status}`);
            
            if (detailResponse.ok) {
              try {
                const detailJson = JSON.parse(detailText);
                const resultCode = detailJson.response?.header?.resultCode;
                const resultMsg = detailJson.response?.header?.resultMsg;
                
                console.log(`[Transform] detailCommon2 resultCode: ${resultCode}, resultMsg: ${resultMsg}`);
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = detailJson.response?.body?.items;
                  
                  if (items && items.item) {
                    detailData = Array.isArray(items.item) ? items.item[0] : items.item;
                    
                    console.log(`[Transform] ✓ detailCommon2 success - overview length: ${(detailData.overview || '').length}`);
                    
                    // TourApiRawData에 모든 detailCommon2 정보 저장
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      overview: cleanHtml(detailData.overview || ''),
                      homepage: cleanHomepage(detailData.homepage || ''),
                      telname: detailData.telname || '',
                      zipcode: detailData.zipcode || '',
                      firstimage2: detailData.firstimage2 || '',
                      raw_detail_json: JSON.stringify(detailData)
                    });
                  } else {
                    console.log(`[Transform] ⚠ detailCommon2 returned no items`);
                  }
                } else {
                  console.log(`[Transform] ✗ detailCommon2 failed with code: ${resultCode}, message: ${resultMsg}`);
                }
              } catch (parseError) {
                console.error(`[Transform] detailCommon2 JSON parse error:`, parseError.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailCommon2 error: ${e.message}`);
          }
          
          // 딜레이
          await new Promise(resolve => setTimeout(resolve, 500));
          
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
            console.log(`[Transform] Calling detailIntro2 for contentId: ${rawData.contentid}`);
            
            const introResponse = await fetch(introUrl);
            const introText = await introResponse.text();
            
            console.log(`[Transform] detailIntro2 response status: ${introResponse.status}`);
            
            if (introResponse.ok) {
              try {
                const introJson = JSON.parse(introText);
                const resultCode = introJson.response?.header?.resultCode;
                const resultMsg = introJson.response?.header?.resultMsg;
                
                console.log(`[Transform] detailIntro2 resultCode: ${resultCode}, resultMsg: ${resultMsg}`);
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = introJson.response?.body?.items;
                  
                  if (items && items.item) {
                    introData = Array.isArray(items.item) ? items.item[0] : items.item;
                    
                    console.log(`[Transform] ✓ detailIntro2 success - program length: ${(introData.program || '').length}`);
                    
                    // 날짜 업데이트
                    if (introData.eventstartdate) {
                      formattedStartDate = formatDate(introData.eventstartdate) || formattedStartDate;
                    }
                    if (introData.eventenddate) {
                      formattedEndDate = formatDate(introData.eventenddate) || formattedEndDate;
                    }
                    
                    // TourApiRawData에 모든 detailIntro2 정보 저장
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      playtime: cleanHtml(introData.playtime || ''),
                      eventplace: cleanHtml(introData.eventplace || ''),
                      eventhomepage: cleanHomepage(introData.eventhomepage || ''),
                      sponsor1: introData.sponsor1 || '',
                      sponsor1tel: introData.sponsor1tel || '',
                      sponsor2: introData.sponsor2 || '',
                      sponsor2tel: introData.sponsor2tel || '',
                      agelimit: introData.agelimit || '',
                      bookingplace: cleanHtml(introData.bookingplace || ''),
                      discountinfofestival: cleanHtml(introData.discountinfofestival || ''),
                      festivalgrade: introData.festivalgrade || '',
                      placeinfo: cleanHtml(introData.placeinfo || ''),
                      program: cleanHtml(introData.program || ''),
                      spendtimefestival: introData.spendtimefestival || '',
                      subevent: cleanHtml(introData.subevent || ''),
                      usetimefestival: cleanHtml(introData.usetimefestival || ''),
                      raw_intro_json: JSON.stringify(introData)
                    });
                  } else {
                    console.log(`[Transform] ⚠ detailIntro2 returned no items`);
                  }
                } else {
                  console.log(`[Transform] ✗ detailIntro2 failed with code: ${resultCode}, message: ${resultMsg}`);
                }
              } catch (parseError) {
                console.error(`[Transform] detailIntro2 JSON parse error:`, parseError.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailIntro2 error: ${e.message}`);
          }
          
          // 딜레이
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailInfo2 호출 시도 (추가 상세 정보)
          try {
            const infoParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              contentTypeId: "15",
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
            });
            
            const infoUrl = `${baseUrl}/detailInfo2?${infoParams.toString()}`;
            console.log(`[Transform] Calling detailInfo2 for contentId: ${rawData.contentid}`);
            
            const infoResponse = await fetch(infoUrl);
            const infoText = await infoResponse.text();
            
            console.log(`[Transform] detailInfo2 response status: ${infoResponse.status}`);
            
            if (infoResponse.ok) {
              try {
                const infoJson = JSON.parse(infoText);
                const resultCode = infoJson.response?.header?.resultCode;
                const resultMsg = infoJson.response?.header?.resultMsg;
                
                console.log(`[Transform] detailInfo2 resultCode: ${resultCode}, resultMsg: ${resultMsg}`);
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = infoJson.response?.body?.items;
                  
                  if (items && items.item) {
                    infoData = Array.isArray(items.item) ? items.item : [items.item];
                    
                    console.log(`[Transform] ✓ detailInfo2 success - ${infoData.length} detail items found`);
                    console.log(`[Transform] detailInfo2 sample:`, JSON.stringify(infoData[0] || {}).substring(0, 300));
                  } else {
                    console.log(`[Transform] ⚠ detailInfo2 returned no items`);
                  }
                } else {
                  console.log(`[Transform] ✗ detailInfo2 failed with code: ${resultCode}, message: ${resultMsg}`);
                }
              } catch (parseError) {
                console.error(`[Transform] detailInfo2 JSON parse error:`, parseError.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailInfo2 error: ${e.message}`);
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
        
        // 상세 설명 구성
        let fullDescription = '';
        
        // overview가 있으면 메인 설명으로 사용
        if (detailData.overview || rawData.overview) {
          fullDescription += cleanHtml(detailData.overview || rawData.overview) + '\n\n';
        }
        
        // 행사 프로그램 추가
        if (introData.program) {
          fullDescription += '📋 행사 프로그램\n' + cleanHtml(introData.program) + '\n\n';
        }
        
        // 부대행사 추가
        if (introData.subevent) {
          fullDescription += '🎪 부대행사\n' + cleanHtml(introData.subevent) + '\n\n';
        }
        
        // 행사장 위치 안내 추가
        if (introData.placeinfo) {
          fullDescription += '📍 행사장 안내\n' + cleanHtml(introData.placeinfo) + '\n\n';
        }
        
        // 할인 정보 추가
        if (introData.discountinfofestival) {
          fullDescription += '💰 할인 정보\n' + cleanHtml(introData.discountinfofestival) + '\n\n';
        }
        
        // detailInfo2에서 가져온 추가 정보 반영
        if (infoData && infoData.length > 0) {
          console.log(`[Transform] Processing ${infoData.length} detailInfo2 items`);
          
          // detailInfo2는 반복 정보를 제공하므로 각 항목을 처리
          const infoSections = {};
          
          infoData.forEach(item => {
            // infoname과 infotext를 사용하여 정보 구성
            const infoName = cleanHtml(item.infoname || '');
            const infoText = cleanHtml(item.infotext || '');
            
            if (infoName && infoText) {
              if (!infoSections[infoName]) {
                infoSections[infoName] = [];
              }
              infoSections[infoName].push(infoText);
            }
          });
          
          // 섹션별로 description에 추가
          Object.keys(infoSections).forEach(sectionName => {
            const sectionContent = infoSections[sectionName].join('\n');
            fullDescription += `\n📌 ${sectionName}\n${sectionContent}\n`;
          });
          
          if (Object.keys(infoSections).length > 0) {
            fullDescription += '\n';
            console.log(`[Transform] ✓ Added ${Object.keys(infoSections).length} sections from detailInfo2`);
          }
        }
        
        // fallback: 제목만 있으면 제목 사용
        if (!fullDescription.trim()) {
          fullDescription = rawData.title;
          console.log(`[Transform] ⚠ No detailed description available, using title only`);
        } else {
          console.log(`[Transform] ✓ Built description with ${fullDescription.length} characters`);
        }
        
        // 웹사이트 결정 (eventhomepage 우선, 없으면 homepage 사용)
        const websiteUrl = cleanHomepage(introData.eventhomepage || detailData.homepage || rawData.homepage || '');
        
        // 주최자 정보 구성
        let organizerInfo = '';
        if (introData.sponsor1 || rawData.sponsor1) {
          organizerInfo = introData.sponsor1 || rawData.sponsor1;
          if (introData.sponsor2) {
            organizerInfo += ` / ${introData.sponsor2}`;
          }
        }
        
        // 연락처 구성
        const phoneNumber = detailData.tel || rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '';
        
        // Festival 엔티티 생성
        const festival = {
          name: detailData.title || rawData.title,
          description: fullDescription.trim(),
          summary: (detailData.overview || rawData.overview) ? cleanHtml(detailData.overview || rawData.overview).substring(0, 200) : rawData.title,
          country: '대한민국',
          city: extractCity(detailData.addr1 || rawData.addr1),
          category: mapCategory(rawData.cat3),
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          latitude: latitude,
          longitude: longitude,
          thumbnail_url: detailData.firstimage || rawData.firstimage || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
          video_url: '',
          website: websiteUrl,
          price: 0,
          opening_hours: cleanHtml(introData.playtime || rawData.playtime || introData.usetimefestival || ''),
          access_info: (detailData.addr1 || rawData.addr1) ? `${detailData.addr1 || rawData.addr1} ${detailData.addr2 || rawData.addr2 || ''}`.trim() : '',
          parking_info: cleanHtml(introData.parkingfee || introData.parkingfestival || ''),
          organizer: organizerInfo,
          contact: {
            phone: phoneNumber,
            email: ''
          },
          highlights: [],
          lineup: [],
          tags: ['국내축제', '한국관광공사', extractCity(detailData.addr1 || rawData.addr1)],
          star_rating: 0,
          likes_count: 0,
          catches_count: 0,
          restrictions: introData.agelimit ? [`관람연령: ${introData.agelimit}`] : [],
          recommendations: introData.spendtimefestival ? [`관람 소요시간: ${introData.spendtimefestival}`] : []
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
        
        console.log(`[Transform] ✓ SUCCESS: ${festival.name} created (description: ${fullDescription.length} chars)`);
        
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