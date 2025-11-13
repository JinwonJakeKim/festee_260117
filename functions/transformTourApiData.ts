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
    
    // 웹사이트 URL 파싱 - 여러 개의 링크 분리
    const parseWebsiteUrls = (homepage) => {
      if (!homepage) return '';
      
      // HTML 태그 제거
      let cleaned = homepage.replace(/<[^>]*>/g, '').trim();
      
      // 여러 URL 패턴 찾기
      const urlPattern = /(https?:\/\/[^\s\)]+)/gi;
      const matches = cleaned.match(urlPattern);
      
      if (matches && matches.length > 1) {
        // 여러 개의 URL이 있는 경우 첫 번째만 반환
        console.log(`[Transform] 📎 Found ${matches.length} URLs, using first one: ${matches[0]}`);
        return matches[0].trim();
      } else if (matches && matches.length === 1) {
        return matches[0].trim();
      }
      
      // URL 패턴이 없으면 원본 반환
      return cleaned;
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
    
    // 텍스트 포맷팅 - 이모티콘 줄바꿈 제거
    const formatText = (text) => {
      if (!text) return '';
      
      console.log(`[FormatText] 📝 Input length: ${text.length} chars`);
      
      // 1. 모든 개행을 공백으로 변환
      text = text.replace(/\n+/g, ' ');
      
      // 2. 연속 공백 제거
      text = text.replace(/\s{2,}/g, ' ');
      
      // 3. '숫자.' 바로 뒤의 불필요한 공백/줄바꿈 정리
      // '1. 메인프로그램' 형태로 만들기
      text = text.replace(/(\d+)\.\s+/g, '$1. ');
      
      // 4. 특수 키워드(텍스트) 앞뒤로 개행 추가 - 이모지 제외
      const specialKeywords = [
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
      
      // 5. 한국어 문장 끝 감지 및 개행 추가
      text = text.replace(/(다\.|요\.|니다\.|습니다\.|요!\s|다!\s|까\?)\s+([가-힣A-Z0-9])/g, '$1\n\n$2');
      
      // 6. 마침표, 느낌표, 물음표 뒤에 대문자나 한글이 오면 개행
      text = text.replace(/([.!?])\s+([가-힣A-Z][가-힣a-z])/g, '$1\n\n$2');
      
      // 7. 숫자 리스트 앞에 개행 추가 (하지만 숫자 뒤는 한 칸만)
      text = text.replace(/([^\d])\s*(\d+\.\s+)/g, '$1\n\n$2');
      
      // 8. 불렛 포인트 앞에 개행 추가
      text = text.replace(/\s+(○|-|\*|•)\s+/g, '\n$1 ');
      
      // 9. 섹션 제목 (대괄호 등) 앞뒤 개행
      text = text.replace(/\s*(\[.+?\]|【.+?】)\s*/g, '\n\n$1\n\n');
      
      // 10. 날짜 형식 앞에 개행
      text = text.replace(/\s+(\d{4}년|\d{1,2}월\s*\d{1,2}일)/g, '\n\n$1');
      
      // 11. 과도한 개행 정리
      text = text.replace(/\n{3,}/g, '\n\n');
      
      // 12. 각 줄 trim
      const lines = text.split('\n');
      const trimmedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
      text = trimmedLines.join('\n');
      
      const outputText = text.trim();
      console.log(`[FormatText] ✓ Output length: ${outputText.length} chars`);
      
      return outputText;
    };
    
    // ========== 개선된 일정 추출 함수 ==========
    const extractSchedule = (text, programText) => {
      if (!text && !programText) return [];
      
      console.log(`[ExtractSchedule] 🎯 Starting enhanced schedule extraction...`);
      
      const fullText = (text || '') + '\n' + (programText || '');
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const schedule = [];
      const operatingHoursKeywords = ['평일', '주말', '매일', '운영시간', '관람시간', '이용시간', '오픈', '개장'];
      
      // 날짜 패턴 (예: "10월 31일", "10/31", "첫째 날", "Day 1")
      const datePatterns = [
        /(\d{1,2}월\s*\d{1,2}일)/,
        /(\d{1,2}\/\d{1,2})/,
        /(첫째\s*날|둘째\s*날|셋째\s*날|넷째\s*날)/,
        /(Day\s*\d+)/i,
        /(\d+일차)/
      ];
      
      // 시간 패턴 (예: "14:00", "오후 2시", "14시")
      const timePatterns = [
        /(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/,  // 14:00~16:00
        /(\d{1,2}:\d{2})/,                            // 14:00
        /(오전|오후)\s*(\d{1,2})\s*시/,               // 오후 2시
        /(\d{1,2})\s*시/                              // 14시
      ];
      
      let currentDate = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 운영시간 패턴 감지 - 스킵
        const isOperatingHours = operatingHoursKeywords.some(keyword => 
          line.includes(keyword) && (line.includes('~') || line.includes('-'))
        );
        
        if (isOperatingHours) {
          console.log(`[ExtractSchedule] ⏭️ Skipping operating hours: ${line.substring(0, 50)}...`);
          continue;
        }
        
        // 날짜 감지
        let dateMatch = null;
        for (const pattern of datePatterns) {
          const match = line.match(pattern);
          if (match) {
            dateMatch = match[1];
            currentDate = dateMatch;
            console.log(`[ExtractSchedule] 📅 Date detected: ${currentDate}`);
            break;
          }
        }
        
        // 시간 패턴 감지
        for (const pattern of timePatterns) {
          const match = line.match(pattern);
          if (match) {
            let time = '';
            let activity = '';
            let location = '';
            
            // 시간 추출
            if (pattern.source.includes('오전|오후')) {
              const period = match[1]; // 오전/오후
              const hour = match[2];   // 시
              time = `${period} ${hour}시`;
            } else if (pattern.source.includes('~')) {
              time = `${match[1]}~${match[2]}`;
            } else {
              time = match[1];
            }
            
            // 활동 추출 (시간 이후 텍스트)
            const timeIndex = line.indexOf(match[0]);
            const afterTime = line.substring(timeIndex + match[0].length).trim();
            
            // 구분자로 활동과 장소 분리 (-, :, @, (장소명) 등)
            const locationMatch = afterTime.match(/[-@:]\s*(.+?)$/);
            if (locationMatch) {
              activity = afterTime.substring(0, afterTime.indexOf(locationMatch[0])).trim();
              location = locationMatch[1].trim();
            } else {
              // 괄호 안 장소 추출
              const bracketMatch = afterTime.match(/(.+?)\s*[\(（](.+?)[\)）]/);
              if (bracketMatch) {
                activity = bracketMatch[1].trim();
                location = bracketMatch[2].trim();
              } else {
                activity = afterTime;
              }
            }
            
            // 활동이 명확한 경우만 추가
            if (activity.length > 3 && activity.length < 150) {
              const scheduleItem = {
                time: time,
                activity: activity,
                location: location || undefined
              };
              
              // 날짜가 있으면 추가
              if (currentDate) {
                scheduleItem.date = currentDate;
              }
              
              schedule.push(scheduleItem);
              console.log(`[ExtractSchedule] ✅ Added: ${currentDate || 'No Date'} | ${time} | ${activity.substring(0, 30)}...`);
            }
            
            break; // 한 줄에서 첫 번째 시간만 처리
          }
        }
      }
      
      // 중복 제거 (같은 시간 + 활동)
      const uniqueSchedule = [];
      const seen = new Set();
      
      schedule.forEach(item => {
        const key = `${item.date || ''}-${item.time}-${item.activity}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSchedule.push(item);
        }
      });
      
      console.log(`[ExtractSchedule] 🎉 Extracted ${uniqueSchedule.length} unique schedule items`);
      
      // 날짜별로 정렬 (날짜가 있는 것 먼저, 그 다음 시간순)
      uniqueSchedule.sort((a, b) => {
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        if (a.date && b.date && a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.time.localeCompare(b.time);
      });
      
      return uniqueSchedule;
    };
    
    // AI 기반 요약, 하이라이트, 태그 생성
    const generateAIContent = async (festivalName, overview, additionalInfo) => {
      try {
        console.log(`[Transform] 🤖 Generating AI content (summary, highlights, tags)...`);
        
        // 컨텍스트 구성
        let context = `축제명: ${festivalName}\n\n`;
        context += `상세 설명:\n${overview}\n\n`;
        
        if (additionalInfo.program) {
          context += `프로그램:\n${additionalInfo.program}\n\n`;
        }
        if (additionalInfo.placeinfo) {
          context += `행사장 정보:\n${additionalInfo.placeinfo}\n\n`;
        }
        if (additionalInfo.category) {
          context += `카테고리: ${additionalInfo.category}\n\n`;
        }
        
        const prompt = `다음은 한국 축제에 대한 정보입니다. 이 축제를 사용자에게 매력적으로 소개하기 위해:

1. **요약**: 축제의 핵심을 1-2문장으로 간결하고 매력적으로 요약해주세요. (최대 120자)
2. **하이라이트**: 이 축제의 주요 특징이나 볼거리를 3-4개의 짧은 포인트로 정리해주세요. 각 포인트는 한 문장으로 간결하게 작성해주세요.
3. **태그**: 이 축제를 잘 설명하는 태그 5-7개를 생성해주세요. 태그는 간결하게 2-4글자로, 축제의 특징, 대상, 분위기 등을 나타내는 키워드여야 합니다.
   예시 태그: "가족친화적", "음악", "전통문화", "먹거리", "체험행사", "무료입장", "야간행사" 등

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
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "5-7개의 축제 태그"
              }
            },
            required: ["summary", "highlights", "tags"]
          }
        });
        
        console.log(`[Transform] ✓ AI generated summary: ${result.summary?.substring(0, 60)}...`);
        console.log(`[Transform] ✓ AI generated ${result.highlights?.length || 0} highlights`);
        console.log(`[Transform] ✓ AI generated ${result.tags?.length || 0} tags: ${result.tags?.join(', ')}`);
        
        return {
          summary: result.summary || overview.substring(0, 120),
          highlights: result.highlights || [],
          tags: result.tags || []
        };
        
      } catch (error) {
        console.error(`[Transform] AI generation error:`, error.message);
        // AI 실패 시 폴백
        const fallbackSummary = overview.substring(0, 120) + (overview.length > 120 ? '...' : '');
        return {
          summary: fallbackSummary,
          highlights: [],
          tags: []
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
        
        // ===== 카테고리 정보 =====
        const festivalCategory = mapCategory(rawData.cat3);
        
        // ===== AI 기반 요약, 하이라이트, 태그 생성 =====
        const aiResult = await generateAIContent(
          rawData.title,
          cleanedOverview,
          {
            program: introData.program,
            placeinfo: introData.placeinfo,
            category: festivalCategory
          }
        );
        
        const summary = aiResult.summary;
        const highlights = aiResult.highlights;
        const aiTags = aiResult.tags || [];
        
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
          const formattedSections = sections.map((section, idx) => {
            const formatted = formatText(section);
            console.log(`[Transform]   Section ${idx + 1}: ${formatted.length} chars`);
            return formatted;
          });
          
          fullDescription += '\n\n' + formattedSections.join('\n\n');
        }
        
        if (!fullDescription.trim()) {
          fullDescription = rawData.title;
        }
        
        console.log(`[Transform] ✅ FINAL Description:`);
        console.log(`[Transform]   - Total length: ${fullDescription.length} chars`);
        
        // ===== 일정 추출 (개선된 버전 사용) =====
        const scheduleItems = extractSchedule(fullDescription, introData.program);
        
        console.log(`[Transform] ✓ Summary: ${summary.length} chars`);
        console.log(`[Transform] ✓ Highlights: ${highlights.length} items`);
        console.log(`[Transform] ✓ AI Tags: ${aiTags.length} items - ${aiTags.join(', ')}`);
        console.log(`[Transform] ✓ Schedule: ${scheduleItems.length} items`);
        
        // ===== 기타 정보 =====
        const longitude = (detailData.mapx || rawData.mapx) ? parseFloat(detailData.mapx || rawData.mapx) : null;
        const latitude = (detailData.mapy || rawData.mapy) ? parseFloat(detailData.mapy || rawData.mapy) : null;
        
        // 웹사이트 URL 파싱 개선
        const websiteUrl = parseWebsiteUrls(introData.eventhomepage || detailData.homepage || rawData.homepage || '');
        
        let organizerInfo = '';
        if (introData.sponsor1 || rawData.sponsor1) {
          organizerInfo = introData.sponsor1 || rawData.sponsor1;
          if (introData.sponsor2) {
            organizerInfo += ` / ${introData.sponsor2}`;
          }
        }
        
        const phoneNumber = detailData.tel || rawData.tel || introData.sponsor1tel || rawData.sponsor1tel || '';
        
        // ===== media_urls 구성 (여러 이미지) =====
        const mediaUrls = imageGallery.map(img => ({
          type: 'image',
          url: img.originimgurl,
          caption: img.imgname || rawData.title
        }));
        
        console.log(`[Transform] 📸 Prepared ${mediaUrls.length} media items`);
        
        // ===== 최종 태그 구성 =====
        const baseTagsArray = ['국내축제', '한국관광공사', extractCity(detailData.addr1 || rawData.addr1)];
        const finalTags = [...new Set([...baseTagsArray, ...aiTags])]; // 중복 제거
        
        // ===== Festival 엔티티 생성 =====
        const festival = {
          name: detailData.title || rawData.title,
          description: fullDescription,
          summary: summary,
          country: '대한민국',
          city: extractCity(detailData.addr1 || rawData.addr1),
          category: festivalCategory,
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          latitude: latitude,
          longitude: longitude,
          thumbnail_url: detailData.firstimage || rawData.firstimage || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
          video_url: '',
          media_urls: mediaUrls, // 여러 이미지
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
          tags: finalTags,
          star_rating: 0,
          likes_count: 0,
          catches_count: 0,
          restrictions: introData.agelimit ? [`관람연령: ${introData.agelimit}`] : [],
          recommendations: introData.spendtimefestival ? [`관람 소요시간: ${introData.spendtimefestival}`] : [],
          schedule: scheduleItems,
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