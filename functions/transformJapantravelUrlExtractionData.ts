import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { rawDataIds, retransform = false } = await req.json();
    
    if (!rawDataIds || !Array.isArray(rawDataIds) || rawDataIds.length === 0) {
      return Response.json({ 
        success: false,
        error: 'rawDataIds array is required' 
      }, { status: 400 });
    }

    console.log(`[Japantravel Transform] Starting transformation of ${rawDataIds.length} records, retransform=${retransform}`);

    const results = [];
    
    for (const rawDataId of rawDataIds) {
      try {
        // 원본 데이터 가져오기
        const rawDataRecords = await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.filter({ id: rawDataId });
        const rawData = rawDataRecords[0];
        
        if (!rawData) {
          results.push({
            rawDataId,
            success: false,
            error: 'Raw data not found'
          });
          continue;
        }

        console.log(`[Japantravel Transform] Processing: ${rawData.name_original}`);

        // 상태 업데이트 - processing
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(rawDataId, {
          processing_status: 'processing'
        });

        const festivalData = rawData;
        const festivalNameForSearch = festivalData.name_original;

        // Google 이미지 검색 제외 (이미지 저작권 및 정확성 우려)
        let thumbnailUrl = festivalData.thumbnail_url;
        let mediaUrls = festivalData.image_gallery_urls || [];
        console.log(`[Japantravel Transform] Using only source images (Google image search disabled)`);

        // YouTube 영상 검색 (중앙화된 함수 사용)
        let videoUrl = festivalData.video_url;
        let videoChannelName = '';
        let youtubeShortUrls = [];
        
        const shouldSearchHighlight = !videoUrl || videoUrl.trim() === '';
        
        if (shouldSearchHighlight || true) { // 쇼츠는 항상 검색
          try {
            console.log(`[Japantravel Transform] Calling fetchYoutubeVideos function...`);
            const youtubeResult = await base44.functions.invoke('fetchYoutubeVideos', {
              festivalName: festivalNameForSearch,
              searchHighlightVideo: shouldSearchHighlight,
              searchShorts: true
            });
            
            if (youtubeResult.data.success) {
              if (shouldSearchHighlight && youtubeResult.data.highlightVideoUrl) {
                videoUrl = youtubeResult.data.highlightVideoUrl;
                videoChannelName = youtubeResult.data.highlightVideoChannelName || '';
                console.log(`[Japantravel Transform] ✓ Got highlight video from fetchYoutubeVideos: ${videoUrl}`);
                console.log(`[Japantravel Transform] ✓ Channel: ${videoChannelName}`);
              }
              
              youtubeShortUrls = youtubeResult.data.shortsUrls || [];
              console.log(`[Japantravel Transform] ✓ Got ${youtubeShortUrls.length} YouTube Shorts from fetchYoutubeVideos`);
            }
          } catch (youtubeError) {
            console.error('[Japantravel Transform] fetchYoutubeVideos failed:', youtubeError.message);
          }
        }

        // LLM으로 번역 수행
        console.log(`[Japantravel Transform] Performing LLM translation for: ${festivalData.name_original}`);

        let translatedData;
        try {
          translatedData = await base44.integrations.Core.InvokeLLM({
            prompt: `
          다음은 japantravel.com 웹페이지에서 추출된 축제 정보의 원본 데이터입니다. 이 데이터를 **반드시** 한국어, 영어, 일본어, 중국어 4개 언어로 모두 번역해주세요.

          **원본 데이터:**
          - 원본 언어: ${festivalData.original_language || 'unknown'}
          - 축제명: ${festivalData.name_original || ''}
          - 요약: ${festivalData.summary_original || ''}
          - 설명: ${festivalData.description_original || ''}
          - 하이라이트: ${JSON.stringify(festivalData.highlights_original || [])}
          - 금지사항: ${JSON.stringify(festivalData.restrictions_original || [])}
          - 추천사항: ${JSON.stringify(festivalData.recommendations_original || [])}
          - 카테고리: ${festivalData.category || ''}
          - 태그: ${JSON.stringify(festivalData.tags || [])}

          **번역 규칙 (⚠️ 매우 중요!):**
          
          🔥 **모든 필드를 4개 언어로 번역 필수:**
          - _ko (한국어) - 반드시 번역
          - _en (영어) - 반드시 번역
          - _jp (일본어) - 반드시 번역
          - _zh (중국어) - 반드시 번역
          
          **언어별 번역 스타일:**
          - 한국어 (_ko): 존댓말 사용, "~입니다" 체, 정중하고 친근하게
          - 영어 (_en): 명확하고 간결하게, 자연스러운 표현
          - 일본어 (_jp): 정중한 표현(です・ます調), 일본 현지식 표현
          - 중국어 (_zh): 간체자 사용, 중국어 관용 표현
          
          **고유명사 처리:**
          - 축제명, 장소명, 인명 등 고유명사는 원문 유지
          - 필요시 괄호 안에 현지 표기 추가 가능
          
          **구조 유지:**
          - 원본과 동일한 문장 수, 문단 수 유지
          - 줄바꿈(\\n\\n)도 동일하게 유지
          
          **배열 필드 번역:**
          - highlights, restrictions, recommendations, tags는 각 항목을 개별 번역
          - 항목 수는 원본과 동일
          

          ⚠️ **경고: 번역 누락 금지!**
          - 모든 필드에 대해 4개 언어 번역을 반드시 제공하세요
          - 빈 문자열이나 null로 두지 마세요
          - 원본이 비어있어도 적절한 번역 제공
            `,
            response_json_schema: {
              type: "object",
              properties: {
                name_ko: { type: "string" },
                name_en: { type: "string" },
                name_jp: { type: "string" },
                name_zh: { type: "string" },
                summary_ko: { type: "string" },
                summary_en: { type: "string" },
                summary_jp: { type: "string" },
                summary_zh: { type: "string" },
                description_ko: { type: "string" },
                description_en: { type: "string" },
                description_jp: { type: "string" },
                description_zh: { type: "string" },
                highlights_ko: { type: "array", items: { type: "string" } },
                highlights_en: { type: "array", items: { type: "string" } },
                highlights_jp: { type: "array", items: { type: "string" } },
                highlights_zh: { type: "array", items: { type: "string" } },
                restrictions_ko: { type: "array", items: { type: "string" } },
                restrictions_en: { type: "array", items: { type: "string" } },
                recommendations_ko: { type: "array", items: { type: "string" } },
                recommendations_en: { type: "array", items: { type: "string" } },
                category_en: { type: "string" },
                category_jp: { type: "string" },
                category_zh: { type: "string" },
                tags_en: { type: "array", items: { type: "string" } },
                tags_jp: { type: "array", items: { type: "string" } },
                tags_zh: { type: "array", items: { type: "string" } }
              },
              required: ["name_ko", "name_en", "name_jp", "name_zh", "description_ko", "description_en", "description_jp", "description_zh"]
            }
          });
          console.log(`[Japantravel Transform] LLM Translation successful.`);
        } catch (llmError) {
          console.error('[Japantravel Transform] LLM Translation failed:', llmError);
          translatedData = { 
            name_ko: festivalData.name_original,
            name_en: festivalData.name_original,
            name_jp: festivalData.name_original,
            name_zh: festivalData.name_original,
            summary_ko: festivalData.summary_original,
            summary_en: festivalData.summary_original,
            summary_jp: festivalData.summary_original,
            summary_zh: festivalData.summary_original,
            description_ko: festivalData.description_original,
            description_en: festivalData.description_original,
            description_jp: festivalData.description_original,
            description_zh: festivalData.description_original,
            highlights_ko: festivalData.highlights_original,
            highlights_en: festivalData.highlights_original,
            highlights_jp: festivalData.highlights_original,
            highlights_zh: festivalData.highlights_original,
            restrictions_ko: festivalData.restrictions_original,
            restrictions_en: festivalData.restrictions_original,
            recommendations_ko: festivalData.recommendations_original,
            recommendations_en: festivalData.recommendations_original,
            category_en: festivalData.category,
            category_jp: festivalData.category,
            category_zh: festivalData.category,
            tags_en: festivalData.tags,
            tags_jp: festivalData.tags,
            tags_zh: festivalData.tags,
          };
        }

        const festivalPayload = {
          name_original: festivalData.name_original,
          summary_original: festivalData.summary_original,
          description_original: festivalData.description_original,
          highlights_original: festivalData.highlights_original,
          restrictions_original: festivalData.restrictions_original,
          recommendations_original: festivalData.recommendations_original,
          original_language: festivalData.original_language,

          name_ko: translatedData.name_ko,
          name_en: translatedData.name_en,
          name_jp: translatedData.name_jp,
          name_zh: translatedData.name_zh,
          summary_ko: translatedData.summary_ko,
          summary_en: translatedData.summary_en,
          summary_jp: translatedData.summary_jp,
          summary_zh: translatedData.summary_zh,
          description_ko: translatedData.description_ko,
          description_en: translatedData.description_en,
          description_jp: translatedData.description_jp,
          description_zh: translatedData.description_zh,
          highlights_ko: translatedData.highlights_ko || [],
          highlights_en: translatedData.highlights_en || [],
          highlights_jp: translatedData.highlights_jp || [],
          highlights_zh: translatedData.highlights_zh || [],
          restrictions_ko: translatedData.restrictions_ko || [],
          restrictions_en: translatedData.restrictions_en || [],
          recommendations_ko: translatedData.recommendations_ko || [],
          recommendations_en: translatedData.recommendations_en || [],
          category_en: translatedData.category_en,
          category_jp: translatedData.category_jp,
          category_zh: translatedData.category_zh,
          tags_en: translatedData.tags_en || [],
          tags_jp: translatedData.tags_jp || [],
          tags_zh: translatedData.tags_zh || [],
          
          name: translatedData.name_ko || festivalData.name_original,
          summary: translatedData.summary_ko || festivalData.summary_original,
          description: translatedData.description_ko || festivalData.description_original,
          opening_hours: festivalData.opening_hours_original,
          address_info: festivalData.address_info_original,
          parking_info: festivalData.parking_info_original,
          restrictions: translatedData.restrictions_ko || festivalData.restrictions_original || [],
          recommendations: translatedData.recommendations_ko || festivalData.recommendations_original || [],
          highlights: translatedData.highlights_ko || festivalData.highlights_original || [],
          tags: translatedData.tags_ko || festivalData.tags || [],
          category: translatedData.category_ko || festivalData.category,
          
          country: festivalData.country,
          city: festivalData.city,
          start_date: festivalData.start_date,
          end_date: festivalData.end_date,
          date_status: festivalData.date_status,
          latitude: festivalData.latitude,
          longitude: festivalData.longitude,
          thumbnail_url: thumbnailUrl,
          video_url: videoUrl,
          video_channel_name: videoChannelName,
          image_gallery_urls: festivalData.image_gallery_urls,
          media_urls: mediaUrls,
          youtube_shorts_urls: youtubeShortUrls,
          website: festivalData.website,
          price: festivalData.price || 0,
          price_details: festivalData.price_details,
          organizer: festivalData.organizer,
          contact: festivalData.contact,
          social_media: festivalData.social_media,
          schedule: festivalData.schedule || [],
          lineup: festivalData.lineup || [],
          nearby_attractions: festivalData.nearby_attractions || [],
          expected_visitors: festivalData.expected_visitors,
          star_rating: 0,
          likes_count: 0,
          catches_count: 0,
        };

        // 동일한 축제명으로 기존 Festival 찾기
        const existingFestivalsByName = await base44.asServiceRole.entities.Festival.filter({ 
          name_original: festivalData.name_original 
        });
        
        let festivalId = rawData.festival_id;

        if (existingFestivalsByName && existingFestivalsByName.length > 0) {
          // 동일한 축제명이 있으면 업데이트
          const existingFestival = existingFestivalsByName[0];
          festivalId = existingFestival.id;
          await base44.asServiceRole.entities.Festival.update(festivalId, festivalPayload);
          console.log(`[Japantravel Transform] ✓ Updated existing Festival by name: ${festivalId} (${festivalData.name_original})`);
        } else if (retransform && festivalId) {
          // 재변환 시 festival_id로 찾아서 업데이트
          const existingFestivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
          const existingFestival = existingFestivals[0];
          
          if (existingFestival) {
            await base44.asServiceRole.entities.Festival.update(festivalId, festivalPayload);
            console.log(`[Japantravel Transform] ✓ Updated existing Festival by ID: ${festivalId}`);
          } else {
            // 기존 Festival이 없으면 새로 생성
            const newFestival = await base44.asServiceRole.entities.Festival.create(festivalPayload);
            festivalId = newFestival.id;
            console.log(`[Japantravel Transform] ✓ Created new Festival (original not found): ${festivalId}`);
          }
        } else {
          // 첫 변환이고 동일 축제명도 없으면 새로 생성
          const newFestival = await base44.asServiceRole.entities.Festival.create(festivalPayload);
          festivalId = newFestival.id;
          console.log(`[Japantravel Transform] ✓ Created new Festival: ${festivalId}`);
        }

        // 상태 업데이트 - processed
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(rawDataId, {
          processing_status: 'processed',
          festival_id: festivalId,
          error_message: null
        });

        results.push({
          rawDataId,
          festivalId,
          success: true,
          festivalName: festivalPayload.name_original
        });

        console.log(`[Japantravel Transform] Festival translation completed:`, {
          original_language: festivalData.original_language,
          description_ko_length: translatedData.description_ko?.length || 0,
          description_en_length: translatedData.description_en?.length || 0,
        });

      } catch (itemError) {
        console.error(`[Japantravel Transform] Error processing ${rawDataId}:`, itemError);
        
        await base44.asServiceRole.entities.JapantravelUrlExtractionRawData.update(rawDataId, {
          processing_status: 'failed',
          error_message: itemError.message
        });

        results.push({
          rawDataId,
          success: false,
          error: itemError.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return Response.json({
      success: true,
      message: `변환 완료: 성공 ${successCount}개, 실패 ${failCount}개`,
      results
    });

  } catch (error) {
    console.error('[Japantravel Transform] Error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});