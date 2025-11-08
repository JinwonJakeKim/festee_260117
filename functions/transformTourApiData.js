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
    
    // ========== 유틸리티 함수들 ==========
    
    const cleanHtml = (text) => {
      if (!text) return '';
      return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
    };
    
    const cleanHomepage = (homepage) => {
      if (!homepage) return '';
      return homepage.replace(/<[^>]*>/g, '').trim();
    };
    
    // 중복 문장 제거 (개선됨)
    const removeDuplicates = (text) => {
      if (!text) return '';
      
      // 먼저 문장들을 분리 (마침표, 느낌표, 물음표 기준)
      const sentences = text.split(/(?<=[.!?])\s+/);
      const seen = new Set();
      const result = [];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;
        
        // 문장을 정규화 (공백, 구두점 제거 후 소문자화)
        const normalized = trimmed
          .replace(/[\s,.!?;:()[\]{}'"]/g, '')
          .toLowerCase();
        
        // 최소 길이 체크 (너무 짧은 문장은 중복 체크 안함)
        if (normalized.length < 10) {
          result.push(trimmed);
          continue;
        }
        
        // 중복 체크
        let isDuplicate = false;
        for (const existing of seen) {
          // 유사도 체크 (80% 이상 같으면 중복으로 간주)
          if (normalized === existing || 
              normalized.includes(existing) || 
              existing.includes(normalized)) {
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate) {
          seen.add(normalized);
          result.push(trimmed);
        } else {
          console.log(`[Transform] 🗑️ Removed duplicate: ${trimmed.substring(0, 50)}...`);
        }
      }
      
      return result.join(' ');
    };
    
    // 텍스트 포맷팅 (개선됨)
    const formatText = (text) => {
      if (!text) return '';
      
      // 1. HTML 태그 제거
      text = cleanHtml(text);
      
      // 2. 중복 문장 제거
      text = removeDuplicates(text);
      
      // 3. 여러 개행을 2개로 통일
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // 4. 숫자 목록 앞에 개행 추가 (1. 2. 3. 등)
      text = text.replace(/([^\n])(\d+\.\s)/g, '$1\n\n$2');
      
      // 5. 불렛 포인트 앞에 개행 추가 (○, -, *, • 등)
      text = text.replace(/([^\n])(○|-|\*|•)\s/g, '$1\n$2 ');
      
      // 6. 괄호로 묶인 제목 앞뒤로 개행
      text = text.replace(/([^\n])(\[.+?\]|【.+?】)/g, '$1\n\n$2\n');
      
      // 7. 주요 키워드 뒤에 개행
      const keywords = [
        '행사내용:', '행사 내용:', '부대행사:', '부대 행사:',
        '프로그램:', '주요 프로그램:', '주요프로그램:',
        '주요내용:', '주요 내용:', '공연시간:', '운영시간:',
        '참가대상:', '참여대상:', '행사장소:', '행사 장소:'
      ];
      
      keywords.forEach(keyword => {
        const regex = new RegExp(`([^\n])(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        text = text.replace(regex, '$1\n\n$2\n');
      });
      
      // 8. 여러 공백을 하나로
      text = text.replace(/ {2,}/g, ' ');
      
      // 9. 줄 끝 공백 제거
      text = text.split('\n').map(line => line.trim()).join('\n');
      
      // 10. 시작과 끝 공백 제거
      return text.trim();
    };
    
    // 스마트 요약 생성 (개선됨)
    const createSummary = (text, maxLength = 350) => {
      if (!text) return '';
      
      // HTML 제거 및 중복 제거
      text = cleanHtml(text);
      text = removeDuplicates(text);
      
      // 이미 짧으면 그대로
      if (text.length <= maxLength) {
        return text.trim();
      }
      
      // 문장 단위로 분리
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
      
      let summary = '';
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if ((summary + ' ' + trimmed).length <= maxLength) {
          summary += (summary ? ' ' : '') + trimmed;
        } else {
          break;
        }
      }
      
      // 최소 하나의 문장은 포함
      if (!summary && sentences.length > 0) {
        summary = sentences[0].substring(0, maxLength - 3) + '...';
      }
      
      return summary.trim() || text.substring(0, maxLength - 3).trim() + '...';
    };
    
    // ========== 메인 처리 로직 ==========
    
    for (let i = 0; i < rawDataIds.length; i++) {
      const rawDataId = rawDataIds[i];
      
      try {
        console.log(`[Transform] ========== Processing ${i + 1}/${rawDataIds.length} ==========`);
        
        const rawDataList = await base44.asServiceRole.entities.TourApiRawData.filter({ id: rawDataId });
        
        if (rawDataList.length === 0) {
          console.error(`[Transform] Raw data not found: ${rawDataId}`);
          errors.push({ id: rawDataId, error: 'Raw data not found' });
          continue;
        }
        
        const rawData = rawDataList[0];
        console.log(`[Transform] Processing: ${rawData.title} (contentid: ${rawData.contentid})`);
        
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processing'
        });
        
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // ===== 보조 함수들 =====
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
            'A0207': '음악', 'A0208': '문화', 'A02070': '음악',
            'A02070200': '지역축제', 'A02080': '문화',
            'A02080600': '문화', 'A02081000': '문화', 'A02081300': '문화',
          };
          return categoryMap[cat3code] || '지역축제';
        };
        
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr.length !== 8) return null;
          return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        };
        
        let formattedStartDate = formatDate(rawData.eventstartdate);
        let formattedEndDate = formatDate(rawData.eventenddate);
        let detailData = {};
        let introData = {};
        let infoData = [];
        let imageGallery = [];
        
        // ===== API 호출들 =====
        
        // detailCommon2
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
            const detailResponse = await fetch(detailUrl);
            const detailText = await detailResponse.text();
            
            if (detailResponse.ok) {
              try {
                const detailJson = JSON.parse(detailText);
                const resultCode = detailJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = detailJson.response?.body?.items;
                  if (items && items.item) {
                    detailData = Array.isArray(items.item) ? items.item[0] : items.item;
                    console.log(`[Transform] ✓ detailCommon2 success`);
                    
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      overview: cleanHtml(detailData.overview || ''),
                      homepage: cleanHomepage(detailData.homepage || ''),
                      raw_detail_json: JSON.stringify(detailData)
                    });
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailCommon2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailCommon2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailIntro2
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
            const introText = await introResponse.text();
            
            if (introResponse.ok) {
              try {
                const introJson = JSON.parse(introText);
                const resultCode = introJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = introJson.response?.body?.items;
                  if (items && items.item) {
                    introData = Array.isArray(items.item) ? items.item[0] : items.item;
                    console.log(`[Transform] ✓ detailIntro2 success`);
                    
                    if (introData.eventstartdate) {
                      formattedStartDate = formatDate(introData.eventstartdate) || formattedStartDate;
                    }
                    if (introData.eventenddate) {
                      formattedEndDate = formatDate(introData.eventenddate) || formattedEndDate;
                    }
                    
                    await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
                      playtime: cleanHtml(introData.playtime || ''),
                      program: cleanHtml(introData.program || ''),
                      raw_intro_json: JSON.stringify(introData)
                    });
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailIntro2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailIntro2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailInfo2
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
            const infoResponse = await fetch(infoUrl);
            const infoText = await infoResponse.text();
            
            if (infoResponse.ok) {
              try {
                const infoJson = JSON.parse(infoText);
                const resultCode = infoJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = infoJson.response?.body?.items;
                  if (items && items.item) {
                    infoData = Array.isArray(items.item) ? items.item : [items.item];
                    console.log(`[Transform] ✓ detailInfo2 success - ${infoData.length} items`);
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailInfo2 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailInfo2 error:`, e.message);
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // detailImage1
          try {
            const imageParams = new URLSearchParams({
              serviceKey: apiKey,
              contentId: rawData.contentid,
              MobileOS: "ETC",
              MobileApp: "Festee",
              _type: "json",
              imageYN: "Y",
              subImageYN: "Y"
            });
            
            const imageUrl = `${baseUrl}/detailImage1?${imageParams.toString()}`;
            const imageResponse = await fetch(imageUrl);
            const imageText = await imageResponse.text();
            
            if (imageResponse.ok) {
              try {
                const imageJson = JSON.parse(imageText);
                const resultCode = imageJson.response?.header?.resultCode;
                
                if (resultCode === "0000" || resultCode === "00") {
                  const items = imageJson.response?.body?.items;
                  if (items && items.item) {
                    const imageItems = Array.isArray(items.item) ? items.item : [items.item];
                    imageGallery = imageItems
                      .map(img => ({
                        originimgurl: img.originimgurl || '',
                        smallimageurl: img.smallimageurl || img.originimgurl || '',
                        imgname: cleanHtml(img.imgname || '')
                      }))
                      .filter(img => img.originimgurl);
                    
                    console.log(`[Transform] ✓ detailImage1 success - ${imageGallery.length} images`);
                  }
                }
              } catch (e) {
                console.error(`[Transform] detailImage1 parse error:`, e.message);
              }
            }
          } catch (e) {
            console.error(`[Transform] detailImage1 error:`, e.message);
          }
        }
        
        // ===== 날짜 검증 =====
        if (!formattedStartDate || !formattedEndDate) {
          console.error(`[Transform] ✗ REJECTED: ${rawData.title} - Missing dates`);
          await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
            processing_status: 'failed',
            error_message: 'Missing start_date or end_date'
          });
          errors.push({ id: rawDataId, festival: rawData.title, error: 'Missing dates' });
          continue;
        }
        
        // ===== 설명 구성 (중복 제거 강화) =====
        const sections = [];
        const usedContent = new Set();
        
        // 콘텐츠 추가 헬퍼 (중복 체크)
        const addSection = (title, content) => {
          if (!content) return false;
          
          const formatted = formatText(content);
          if (!formatted || formatted.length < 20) return false;
          
          // 정규화된 버전으로 중복 체크
          const normalized = formatted
            .replace(/[\s,.!?;:()[\]{}'"]/g, '')
            .toLowerCase()
            .substring(0, 100); // 첫 100자로 비교
          
          // 이미 사용된 내용인지 확인
          for (const used of usedContent) {
            if (normalized === used || 
                normalized.includes(used) || 
                used.includes(normalized)) {
              console.log(`[Transform] 🗑️ Skipped duplicate section: ${title}`);
              return false;
            }
          }
          
          usedContent.add(normalized);
          
          if (title) {
            sections.push(`${title}\n${formatted}`);
          } else {
            sections.push(formatted);
          }
          
          return true;
        };
        
        // 1. Overview (메인 설명)
        const overview = detailData.overview || rawData.overview;
        if (overview) {
          addSection('', overview);
        }
        
        // 2. 프로그램
        if (introData.program) {
          addSection('📋 행사 프로그램', introData.program);
        }
        
        // 3. 부대행사
        if (introData.subevent) {
          addSection('🎪 부대행사', introData.subevent);
        }
        
        // 4. 행사장 안내
        if (introData.placeinfo) {
          addSection('📍 행사장 안내', introData.placeinfo);
        }
        
        // 5. 할인 정보
        if (introData.discountinfofestival) {
          addSection('💰 할인 정보', introData.discountinfofestival);
        }
        
        // 6. detailInfo2 정보
        if (infoData && infoData.length > 0) {
          const infoSections = {};
          
          infoData.forEach(item => {
            const infoName = cleanHtml(item.infoname || '');
            const infoText = cleanHtml(item.infotext || '');
            
            if (infoName && infoText && infoText.length > 10) {
              if (!infoSections[infoName]) {
                infoSections[infoName] = [];
              }
              infoSections[infoName].push(infoText);
            }
          });
          
          Object.keys(infoSections).forEach(sectionName => {
            const content = infoSections[sectionName].join('\n');
            addSection(`📌 ${sectionName}`, content);
          });
        }
        
        // 최종 설명 결합
        let fullDescription = sections.join('\n\n');
        
        if (!fullDescription.trim()) {
          fullDescription = rawData.title;
        }
        
        console.log(`[Transform] ✓ Description: ${fullDescription.length} chars, ${sections.length} sections`);
        
        // ===== 요약 생성 =====
        const summary = createSummary(overview || fullDescription, 350);
        console.log(`[Transform] ✓ Summary: ${summary.length} chars`);
        
        // ===== 기타 정보 =====
        const longitude = (detailData.mapx || rawData.mapx) ? parseFloat(detailData.mapx || rawData.mapx) : null;
        const latitude = (detailData.mapy || rawData.mapy) ? parseFloat(detailData.mapy || rawData.mapy) : null;
        const websiteUrl = cleanHomepage(introData.eventhomepage || detailData.homepage || rawData.homepage || '');
        
        let organizerInfo = '';
        if (introData.sponsor1 || rawData.sponsor1) {
          organizerInfo = introData.sponsor1 || rawData.sponsor1;
          if (introData.sponsor2) {
            organizerInfo += ` / ${introData.sponsor2}`;
          }
        }
        
        const phoneNumber = detailData.tel || rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '';
        
        // ===== Festival 엔티티 생성 =====
        const festival = {
          name: detailData.title || rawData.title,
          description: fullDescription,
          summary: summary,
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
          opening_hours: formatText(introData.playtime || rawData.playtime || introData.usetimefestival || ''),
          access_info: (detailData.addr1 || rawData.addr1) ? `${detailData.addr1 || rawData.addr1} ${detailData.addr2 || rawData.addr2 || ''}`.trim() : '',
          parking_info: formatText(introData.parkingfee || introData.parkingfestival || ''),
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
          recommendations: introData.spendtimefestival ? [`관람 소요시간: ${introData.spendtimefestival}`] : [],
          image_gallery_urls: imageGallery
        };
        
        const createdFestival = await base44.asServiceRole.entities.Festival.create(festival);
        festivals.push(createdFestival);
        
        await base44.asServiceRole.entities.TourApiRawData.update(rawDataId, {
          processing_status: 'processed',
          festival_id: createdFestival.id,
          error_message: ''
        });
        
        console.log(`[Transform] ✓ SUCCESS: ${festival.name}`);
        
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
        
        errors.push({ id: rawDataId, error: error.message });
      }
    }
    
    console.log(`[Transform] ========== SUMMARY ==========`);
    console.log(`[Transform] Processed: ${rawDataIds.length}`);
    console.log(`[Transform] Success: ${festivals.length}`);
    console.log(`[Transform] Failed: ${errors.length}`);
    
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
      message: '데이터 변환 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
});