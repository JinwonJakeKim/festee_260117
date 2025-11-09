
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
    
    // 중복 문장 제거
    const removeDuplicates = (text) => {
      if (!text) return '';
      
      const sentences = text.split(/(?<=[.!?])\s+/);
      const seen = new Set();
      const result = [];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed || trimmed.length < 5) {
          result.push(trimmed);
          continue;
        }
        
        const normalized = trimmed
          .replace(/[\s,.!?;:()[\]{}'"]/g, '')
          .toLowerCase();
        
        if (normalized.length < 15) {
          result.push(trimmed);
          continue;
        }
        
        let isDuplicate = false;
        for (const existing of seen) {
          const similarity = normalized.length / existing.length;
          
          if (normalized === existing) {
            isDuplicate = true;
            console.log(`[Transform] 🗑️ Exact duplicate: ${trimmed.substring(0, 40)}...`);
            break;
          }
          
          if (similarity > 0.95 && (normalized.includes(existing) || existing.includes(normalized))) {
            isDuplicate = true;
            console.log(`[Transform] 🗑️ Similar duplicate: ${trimmed.substring(0, 40)}...`);
            break;
          }
        }
        
        if (!isDuplicate) {
          seen.add(normalized);
          result.push(trimmed);
        }
      }
      
      return result.join(' ');
    };
    
    // 텍스트 포맷팅 - 완전히 새로운 접근 방식
    const formatText = (text) => {
      if (!text) return '';
      
      console.log(`[FormatText] 📝 Input length: ${text.length} chars`);
      console.log(`[FormatText] Input preview: ${text.substring(0, 100)}...`);
      
      // 1. 모든 개행을 공백으로 변환 (처음부터 다시 시작)
      text = text.replace(/\n+/g, ' ');
      
      // 2. 연속 공백 제거
      text = text.replace(/\s{2,}/g, ' ');
      
      // 3. 이모지 및 특수 키워드 앞뒤로 개행 추가
      const specialKeywords = [
        '📋', '🎪', '📍', '💰', '📌', '🎉', '🎊', '🎭', '🎨', '🎵',
        '행사내용:', '행사 내용:', '부대행사:', '부대 행사:',
        '프로그램:', '주요 프로그램:', '주요프로그램:',
        '주요내용:', '주요 내용:', '공연시간:', '운영시간:',
        '참가대상:', '참여대상:', '행사장소:', '행사 장소:',
        '행사일정:', '일정:', '시간:', '장소:'
      ];
      
      specialKeywords.forEach(keyword => {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\s*(${escapedKeyword})\\s*`, 'gi');
        text = text.replace(regex, '\n\n$1\n');
      });
      
      // 4. 한국어 문장 끝 감지 및 개행 추가 (핵심!)
      // "다.", "요.", "니다.", "습니다." 뒤에 한글이 오면 개행
      text = text.replace(/(다\.|요\.|니다\.|습니다\.|요!\s|다!\s|까\?)\s+([가-힣A-Z0-9])/g, '$1\n\n$2');
      
      // 5. 마침표, 느낌표, 물음표 뒤에 대문자나 한글이 오면 개행
      text = text.replace(/([.!?])\s+([가-힣A-Z][가-힣a-z])/g, '$1\n\n$2');
      
      // 6. 숫자 리스트 앞에 개행 추가
      text = text.replace(/\s+(\d+\.\s+[가-힣])/g, '\n\n$1');
      
      // 7. 불렛 포인트 앞에 개행 추가
      text = text.replace(/\s+(○|-|\*|•)\s+/g, '\n$1 ');
      
      // 8. 섹션 제목 (대괄호 등) 앞뒤 개행
      text = text.replace(/\s*(\[.+?\]|【.+?】)\s*/g, '\n\n$1\n\n');
      
      // 9. 날짜 형식 앞에 개행
      text = text.replace(/\s+(\d{4}년|\d{1,2}월\s*\d{1,2}일)/g, '\n\n$1');
      
      // 10. 과도한 개행 정리
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // 11. 각 줄 trim
      const lines = text.split('\n');
      const trimmedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
      text = trimmedLines.join('\n');
      
      const outputText = text.trim();
      const paragraphBreaks = (outputText.match(/\n\n/g) || []).length;
      const singleBreaks = (outputText.match(/\n(?![\n])/g) || []).length; // Count single line breaks, not including second \n of \n\n
      
      console.log(`[FormatText] ✓ Output length: ${outputText.length} chars`);
      console.log(`[FormatText] ✓ Paragraph breaks (\\n\\n): ${paragraphBreaks}`);
      console.log(`[FormatText] ✓ Single breaks (\\n): ${singleBreaks}`);
      console.log(`[FormatText] Output preview: ${outputText.substring(0, 150)}...`);
      
      return outputText;
    };
    
    // AI 기반 요약 및 하이라이트 생성
    const generateSummaryAndHighlights = async (festivalName, overview, additionalInfo) => {
      try {
        console.log(`[Transform] 🤖 Generating AI summary and highlights...`);
        
        // 컨텍스트 구성
        let context = `축제명: ${festivalName}\n\n`;
        context += `상세 설명:\n${overview}\n\n`;
        
        if (additionalInfo.program) {
          context += `프로그램:\n${additionalInfo.program}\n\n`;
        }
        if (additionalInfo.placeinfo) {
          context += `행사장 정보:\n${additionalInfo.placeinfo}\n\n`;
        }
        
        const prompt = `다음은 한국 축제에 대한 정보입니다. 이 축제를 사용자에게 매력적으로 소개하기 위해:

1. **요약**: 축제의 핵심을 1-2문장으로 간결하고 매력적으로 요약해주세요. (최대 120자)
2. **하이라이트**: 이 축제의 주요 특징이나 볼거리를 3-4개의 짧은 포인트로 정리해주세요. 각 포인트는 한 문장으로 간결하게 작성해주세요.

${context}

응답 형식은 반드시 다음 JSON 스키마를 따라주세요.`;

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: false,
          response_json_schema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "1-2문장의 축제 요약 (최대 120자)"
              },
              highlights: {
                type: "array",
                items: { type: "string" },
                description: "3-4개의 하이라이트 포인트"
              }
            },
            required: ["summary", "highlights"]
          }
        });
        
        console.log(`[Transform] ✓ AI generated summary: ${result.summary?.substring(0, 60)}...`);
        console.log(`[Transform] ✓ AI generated ${result.highlights?.length || 0} highlights`);
        
        return {
          summary: result.summary || overview.substring(0, 120),
          highlights: result.highlights || []
        };
        
      } catch (error) {
        console.error(`[Transform] AI generation error:`, error.message);
        // AI 실패 시 폴백: 기존 방식
        const fallbackSummary = overview.substring(0, 120) + (overview.length > 120 ? '...' : '');
        return {
          summary: fallbackSummary,
          highlights: []
        };
      }
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
        
        // ===== Overview 처리 =====
        const overview = detailData.overview || rawData.overview || '';
        let cleanedOverview = cleanHtml(overview);
        cleanedOverview = removeDuplicates(cleanedOverview);
        
        console.log(`[Transform] Overview length: ${cleanedOverview.length} chars`);
        
        // ===== AI 기반 요약 및 하이라이트 생성 =====
        const aiResult = await generateSummaryAndHighlights(
          rawData.title,
          cleanedOverview,
          {
            program: introData.program,
            placeinfo: introData.placeinfo
          }
        );
        
        const summary = aiResult.summary;
        const highlights = aiResult.highlights;
        
        // ===== 설명 구성 (섹션별) =====
        const sections = [];
        const usedContent = new Set();
        
        // Overview 정규화 버전 저장
        if (cleanedOverview) {
          const normalizedOverview = cleanedOverview
            .replace(/[\s,.!?;:()[\]{}'"]/g, '')
            .toLowerCase()
            .substring(0, 150);
          usedContent.add(normalizedOverview);
        }
        
        // 콘텐츠 추가 헬퍼
        const addSection = (title, content) => {
          if (!content) return false;
          
          const cleaned = cleanHtml(content);
          if (!cleaned || cleaned.length < 20) return false;
          
          const normalized = cleaned
            .replace(/[\s,.!?;:()[\]{}'"]/g, '')
            .toLowerCase()
            .substring(0, 150);
          
          for (const used of usedContent) {
            if (normalized === used) {
              console.log(`[Transform] 🗑️ Exact duplicate section: ${title}`);
              return false;
            }
            
            const longer = normalized.length > used.length ? normalized : used;
            const shorter = normalized.length > used.length ? used : normalized;
            
            if (longer.includes(shorter) && shorter.length / longer.length > 0.9) {
              console.log(`[Transform] 🗑️ Similar section skipped: ${title}`);
              return false;
            }
          }
          
          usedContent.add(normalized);
          
          if (title) {
            sections.push(`${title}\n${cleaned}`);
          } else {
            sections.push(cleaned);
          }
          
          return true;
        };
        
        // 프로그램 정보 추가
        if (introData.program) {
          addSection('📋 행사 프로그램', introData.program);
        }
        
        // 부대행사
        if (introData.subevent) {
          addSection('🎪 부대행사', introData.subevent);
        }
        
        // 행사장 안내
        if (introData.placeinfo) {
          addSection('📍 행사장 안내', introData.placeinfo);
        }
        
        // 할인 정보
        if (introData.discountinfofestival) {
          addSection('💰 할인 정보', introData.discountinfofestival);
        }
        
        // detailInfo2 정보
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
        
        // 최종 설명: Overview + 추가 섹션들
        console.log(`[Transform] 📄 Building final description...`);
        
        // Overview는 포맷팅 적용
        let formattedOverview = formatText(cleanedOverview);
        console.log(`[Transform] ✓ Formatted overview: ${formattedOverview.length} chars`);
        
        let fullDescription = formattedOverview;
        
        if (sections.length > 0) {
          console.log(`[Transform] 📋 Adding ${sections.length} additional sections...`);
          // 각 섹션도 포맷팅 적용하고, 섹션 간 확실한 구분을 위해 \n\n 사용
          const formattedSections = sections.map((section, idx) => {
            const formatted = formatText(section);
            console.log(`[Transform]   Section ${idx + 1}: ${formatted.length} chars`);
            return formatted;
          });
          
          // 섹션들을 \n\n으로 확실하게 구분하여 연결
          fullDescription += '\n\n' + formattedSections.join('\n\n');
        }
        
        if (!fullDescription.trim()) {
          fullDescription = rawData.title;
        }
        
        console.log(`[Transform] ✅ FINAL Description:`);
        console.log(`[Transform]   - Total length: ${fullDescription.length} chars`);
        console.log(`[Transform]   - Paragraph breaks (\\n\\n): ${(fullDescription.match(/\n\n/g) || []).length}`);
        console.log(`[Transform]   - Single breaks (\\n): ${(fullDescription.match(/\n(?![\n])/g) || []).length}`);
        console.log(`[Transform]   - Preview: ${fullDescription.substring(0, 200)}...`);
        
        console.log(`[Transform] ✓ Summary: ${summary.length} chars - "${summary}"`);
        console.log(`[Transform] ✓ Highlights: ${highlights.length} items`);
        highlights.forEach((h, idx) => console.log(`[Transform]   ${idx + 1}. ${h}`));
        
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
          highlights: highlights,
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
