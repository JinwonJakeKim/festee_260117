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
        let introData = {};
        
        // detailCommon2는 YN 파라미터를 모두 거부하므로 생략
        // detailIntro2만 호출하여 가능한 정보를 가져옴
        
        // detailIntro2 호출
        if (apiKey && rawData.contentid) {
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
            console.log(`[Transform] detailIntro2 response (first 500 chars): ${introText.substring(0, 500)}`);
            
            if (introResponse.ok) {
              try {
                const introJson = JSON.parse(introText);
                const resultCode = introJson.response?.header?.resultCode;
                const resultMsg = introJson.response?.header?.resultMsg;
                
                console.log(`[Transform] detailIntro2 resultCode: ${resultCode}, resultMsg: ${resultMsg}`);
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = introJson.response?.body?.items;
                  console.log(`[Transform] detailIntro2 items structure:`, JSON.stringify(items).substring(0, 200));
                  
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
        
        const longitude = rawData.mapx ? parseFloat(rawData.mapx) : null;
        const latitude = rawData.mapy ? parseFloat(rawData.mapy) : null;
        
        // 상세 설명 구성 - detailIntro2 정보 위주로
        let fullDescription = '';
        
        // 행사 장소 정보
        if (introData.eventplace || rawData.addr1) {
          fullDescription += '📍 행사 장소\n';
          if (introData.eventplace) {
            fullDescription += cleanHtml(introData.eventplace) + '\n';
          }
          if (rawData.addr1 && rawData.addr1 !== introData.eventplace) {
            fullDescription += `주소: ${rawData.addr1} ${rawData.addr2 || ''}`.trim() + '\n';
          }
          fullDescription += '\n';
        }
        
        // 운영 시간
        if (introData.playtime) {
          fullDescription += '🕐 운영 시간\n' + cleanHtml(introData.playtime) + '\n\n';
        }
        
        // 행사 프로그램
        if (introData.program) {
          fullDescription += '📋 행사 프로그램\n' + cleanHtml(introData.program) + '\n\n';
        }
        
        // 부대행사
        if (introData.subevent) {
          fullDescription += '🎪 부대행사\n' + cleanHtml(introData.subevent) + '\n\n';
        }
        
        // 행사장 위치 안내
        if (introData.placeinfo) {
          fullDescription += '📍 행사장 안내\n' + cleanHtml(introData.placeinfo) + '\n\n';
        }
        
        // 이용 요금
        if (introData.usetimefestival) {
          fullDescription += '💰 이용 요금\n' + cleanHtml(introData.usetimefestival) + '\n\n';
        }
        
        // 할인 정보
        if (introData.discountinfofestival) {
          fullDescription += '💳 할인 정보\n' + cleanHtml(introData.discountinfofestival) + '\n\n';
        }
        
        // 예약 안내
        if (introData.bookingplace) {
          fullDescription += '📞 예약 안내\n' + cleanHtml(introData.bookingplace) + '\n\n';
        }
        
        // 주최/주관 정보
        if (introData.sponsor1) {
          fullDescription += '🏢 주최/주관\n';
          fullDescription += `주최: ${introData.sponsor1}`;
          if (introData.sponsor1tel) {
            fullDescription += ` (${introData.sponsor1tel})`;
          }
          fullDescription += '\n';
          if (introData.sponsor2) {
            fullDescription += `주관: ${introData.sponsor2}`;
            if (introData.sponsor2tel) {
              fullDescription += ` (${introData.sponsor2tel})`;
            }
            fullDescription += '\n';
          }
          fullDescription += '\n';
        }
        
        // fallback: 제목과 기본 정보만 있으면 간단한 설명 생성
        if (!fullDescription.trim()) {
          fullDescription = `${rawData.title}\n\n`;
          if (rawData.addr1) {
            fullDescription += `📍 ${rawData.addr1}\n`;
          }
          if (introData.playtime) {
            fullDescription += `🕐 ${cleanHtml(introData.playtime)}\n`;
          }
          if (introData.usetimefestival) {
            fullDescription += `💰 ${cleanHtml(introData.usetimefestival)}\n`;
          }
          console.log(`[Transform] ⚠ Limited info available, created basic description`);
        }
        
        console.log(`[Transform] ✓ Built description: ${fullDescription.length} characters`);
        
        // 요약 생성
        let summary = rawData.title;
        if (introData.eventplace) {
          summary += ` - ${cleanHtml(introData.eventplace)}에서 개최`;
        }
        if (introData.usetimefestival && introData.usetimefestival.includes('무료')) {
          summary += ' (무료 입장)';
        }
        
        // 웹사이트 결정
        const websiteUrl = cleanHomepage(introData.eventhomepage || rawData.homepage || '');
        
        // 주최자 정보 구성
        let organizerInfo = '';
        if (introData.sponsor1 || rawData.sponsor1) {
          organizerInfo = introData.sponsor1 || rawData.sponsor1;
          if (introData.sponsor2) {
            organizerInfo += ` / ${introData.sponsor2}`;
          }
        }
        
        // 연락처 구성
        const phoneNumber = rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '';
        
        // Festival 엔티티 생성
        const festival = {
          name: rawData.title,
          description: fullDescription.trim(),
          summary: summary.substring(0, 200),
          country: '대한민국',
          city: extractCity(rawData.addr1),
          category: mapCategory(rawData.cat3),
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          latitude: latitude,
          longitude: longitude,
          thumbnail_url: rawData.firstimage || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
          video_url: '',
          website: websiteUrl,
          price: 0,
          opening_hours: cleanHtml(introData.playtime || rawData.playtime || introData.usetimefestival || ''),
          access_info: rawData.addr1 ? `${rawData.addr1} ${rawData.addr2 || ''}`.trim() : '',
          parking_info: cleanHtml(introData.parkingfee || introData.parkingfestival || ''),
          organizer: organizerInfo,
          contact: {
            phone: phoneNumber,
            email: ''
          },
          highlights: [],
          lineup: [],
          tags: ['국내축제', '한국관광공사', extractCity(rawData.addr1)],
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