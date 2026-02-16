import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { region, country } = await req.json();
    
    if (!region) {
      return Response.json({ error: 'Region is required' }, { status: 400 });
    }

    console.log(`Starting research for ${region}, ${country}`);

    // API 사용량 체크 (하루 100회 제한)
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({
        api_name: 'google_custom_search',
        date: today
      });
      
      const dailyLimit = 100;
      const currentUsage = logs.length > 0 ? logs[0].count : 0;
      
      if (currentUsage >= dailyLimit) {
        console.log(`[ResearchFestivals] ❌ Daily limit reached: ${currentUsage}/${dailyLimit}`);
        return Response.json({
          success: false,
          error: 'API_LIMIT_REACHED',
          message: `Google Custom Search API 하루 ${dailyLimit}회 무료 한도를 초과했습니다. (${currentUsage}회 사용)`
        }, { status: 429 });
      }
      
      console.log(`[ResearchFestivals] ✓ Daily usage: ${currentUsage + 1}/${dailyLimit}`);
      
      // 사용량 기록
      if (logs.length === 0) {
        await base44.asServiceRole.entities.ApiUsageLog.create({
          api_name: 'google_custom_search',
          date: today,
          count: 1,
          limit: dailyLimit,
          console_url: 'https://console.cloud.google.com/apis/api/customsearch.googleapis.com'
        });
      } else {
        await base44.asServiceRole.entities.ApiUsageLog.update(logs[0].id, {
          count: logs[0].count + 1
        });
      }
    } catch (logError) {
      console.error('[ResearchFestivals] Failed to check/update API usage:', logError.message);
    }

    // 단일 호출로 모든 정보 수집 (시간 단축)
    const research = await base44.integrations.Core.InvokeLLM({
      prompt: `
        ${country || '일본'} ${region} 지역의 주요 축제 5-8개를 상세히 조사해주세요.
        
        각 축제마다 다음 정보를 정확하게 조사해주세요:
        1. 축제 이름 (한국어와 현지어)
        2. 2025년 정확한 개최 날짜 (YYYY-MM-DD 형식으로 start_date, end_date)
           - 2025년 날짜를 확실히 알 수 없으면 일반적인 개최 월을 기준으로 2025년 날짜를 추정하고 estimated를 true로 설정
        3. 정확한 개최 장소명과 GPS 좌표 (위도, 경도)
        4. 카테고리: 음악, 문화, 예술, 음식, 스포츠, 지역축제, 기타 중 하나
        5. 상세한 설명 (2-3문장)
        6. 입장료 (원 단위, 무료면 0)
        7. 공식 웹사이트 URL (없으면 빈 문자열)
        8. 하이라이트 포인트 3-5개
        9. 관련 태그 5-8개 (예: 전통, 가족과, 무료, 여름, 음식, 불꽃놀이 등)
        
        반드시 실제로 존재하는 유명한 축제들만 선택하고, 
        여러 공식 소스를 참고하여 정확한 정보를 제공해주세요.
        날짜는 YYYY-MM-DD 형식으로 정확히 작성해주세요 (예: 2025-07-24).
      `,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          festivals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "축제 이름 (한국어)" },
                name_local: { type: "string", description: "현지어 이름" },
                start_date: { type: "string", description: "시작일 YYYY-MM-DD" },
                end_date: { type: "string", description: "종료일 YYYY-MM-DD" },
                estimated: { type: "boolean", description: "날짜가 추정치인지 여부" },
                location: { type: "string", description: "개최 장소명" },
                latitude: { type: "number", description: "위도" },
                longitude: { type: "number", description: "경도" },
                category: { type: "string", description: "카테고리" },
                description: { type: "string", description: "상세 설명" },
                price: { type: "number", description: "입장료 (원)" },
                website: { type: "string", description: "공식 웹사이트" },
                highlights: {
                  type: "array",
                  items: { type: "string" },
                  description: "하이라이트 포인트"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "관련 태그"
                },
                confidence_score: { type: "number", description: "정보 신뢰도 (0-1)" }
              },
              required: ["name", "start_date", "end_date", "location", "latitude", "longitude", "category", "description"]
            }
          }
        }
      }
    });

    console.log(`Research completed, found ${research.festivals?.length || 0} festivals`);

    const festivals = (research.festivals || [])
      .filter(f => f.confidence_score >= 0.6) // 신뢰도 60% 이상만
      .map(festival => {
        // Unsplash 이미지 생성
        const keywords = `${festival.name} ${festival.category} festival`;
        const randomId = Math.floor(Math.random() * 1000000);
        const thumbnailUrl = `https://images.unsplash.com/photo-${1500000000000 + randomId}?w=800&h=600&fit=crop&q=80`;

        return {
          name: festival.name,
          description: festival.description,
          country: country || "일본",
          city: region,
          category: festival.category,
          start_date: festival.start_date,
          end_date: festival.end_date,
          latitude: festival.latitude,
          longitude: festival.longitude,
          thumbnail_url: thumbnailUrl,
          video_url: "",
          website: festival.website || "",
          price: festival.price || 0,
          highlights: festival.highlights || [],
          lineup: [],
          tags: festival.tags || [],
          star_rating: 0,
          likes_count: 0,
          catches_count: 0,
          _metadata: {
            name_local: festival.name_local,
            estimated: festival.estimated || false,
            confidence_score: festival.confidence_score,
            researched_at: new Date().toISOString()
          }
        };
      });

    return Response.json({
      success: true,
      region,
      country: country || "일본",
      festivals_found: festivals.length,
      festivals: festivals,
      message: `${region} 지역의 축제 ${festivals.length}개를 조사했습니다.`
    });

  } catch (error) {
    console.error('Research error:', error);
    return Response.json({ 
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다',
      details: error.toString(),
      stack: error.stack
    }, { status: 500 });
  }
});