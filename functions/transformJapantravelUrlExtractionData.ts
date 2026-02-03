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

        // Google 이미지 검색
        let thumbnailUrl = festivalData.thumbnail_url;
        let mediaUrls = festivalData.image_gallery_urls || [];
        
        try {
          console.log(`[Japantravel Transform] Searching Google Images for: ${festivalNameForSearch}`);
          const googleApiKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_API_KEY');
          const searchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID');

          if (googleApiKey && searchEngineId) {
            const imageSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(festivalNameForSearch + ' festival')}&searchType=image&num=5`;
            const imageResponse = await fetch(imageSearchUrl);

            if (imageResponse.ok) {
              const imageData = await imageResponse.json();
              if (imageData.items && imageData.items.length > 0) {
                // Instagram 링크 필터링 (로그인 필요로 인한 접근 불가)
                const validImages = imageData.items.filter(item => {
                  const url = item.link || '';
                  const isInstagram = url.includes('instagram.com') || url.includes('cdninstagram.com');
                  if (isInstagram) {
                    console.log(`[Japantravel Transform] 🚫 Filtered out Instagram image: ${url}`);
                  }
                  return !isInstagram;
                });

                if (validImages.length > 0) {
                  if (!thumbnailUrl || thumbnailUrl.includes('picsum.photos')) {
                    thumbnailUrl = validImages[0].link;
                    console.log(`[Japantravel Transform] ✓ Updated thumbnail from Google Images`);
                  }

                  validImages.slice(1, 5).forEach((item, idx) => {
                    if (!mediaUrls.some(m => m.url === item.link)) {
                      mediaUrls.push({
                        type: 'image',
                        url: item.link,
                        caption: `${festivalNameForSearch} - 이미지 ${idx + 1}`
                      });
                    }
                  });
                  console.log(`[Japantravel Transform] ✓ Added ${validImages.length - 1} images to media_urls (Instagram filtered)`);
                }
              }
            }
          }
        } catch (imageError) {
          console.error('[Japantravel Transform] Google Images search failed:', imageError.message);
        }

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
          다음은 japantravel.com 웹페이지에서 추출된 축제 정보의 원본 데이터입니다. 이 데이터를 한국어, 영어, 일본어, 중국어로 번역해주세요.

          **원본 데이터:**
          ${JSON.stringify(festivalData, null, 2)}

          **번역 규칙:**
          1. 원본 필드(_original)는 그대로 유지하고, _ko, _en, _jp, _zh 필드를 생성해주세요.
          2. 모든 번역은 정확하고 자연스럽게 해주세요.
          3. 고유명사는 번역하지 말고 원문을 유지해주세요.
          4. 한국어: 존댓말 사용, "~입니다" 체
          5. 영어: 명확하고 간결하게
          6. 일본어: 정중한 표현 사용
          7. 중국어: 간체자 사용
          8. 원본과 번역본의 문장 수, 문단 수가 동일해야 합니다.
          9. **교통 정보(access_info) 번역:** `access_info_original` 필드에는 주소와 함께 "(Map)", "(Directions)"와 같은 링크 텍스트가 포함될 수 있습니다. 번역 시 주소 부분만 번역하고, 괄호 안의 링크 텍스트는 원본 그대로 유지해주세요. (예: `2 Chome-8-1 Nishishinjuku... (Map) (Directions)` -> `도쿄도 신주쿠구 니시신주쿠 2-8-1... (Map) (Directions)`)
          9. **교통 정보(access_info) 번역:** `access_info_original` 필드에는 주소와 함께 "(Map)", "(Directions)"와 같은 링크 텍스트가 포함될 수 있습니다. 번역 시 주소 부분만 번역하고, 괄호 안의 링크 텍스트는 원본 그대로 유지해주세요. (예: `2 Chome-8-1 Nishishinjuku... (Map) (Directions)` -> `도쿄도 신주쿠구 니시신주쿠 2-8-1... (Map) (Directions)`)
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
                opening_hours_ko: { type: "string" },
                opening_hours_en: { type: "string" },
                access_info_ko: { type: "string" },
                access_info_en: { type: "string" },
                parking_info_ko: { type: "string" },
                parking_info_en: { type: "string" },
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
            opening_hours_ko: festivalData.opening_hours_original,
            opening_hours_en: festivalData.opening_hours_original,
            access_info_ko: festivalData.access_info_original,
            access_info_en: festivalData.access_info_original,
            parking_info_ko: festivalData.parking_info_original,
            parking_info_en: festivalData.parking_info_original,
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
          opening_hours_ko: translatedData.opening_hours_ko,
          opening_hours_en: translatedData.opening_hours_en,
          access_info_ko: translatedData.access_info_ko,
          access_info_en: translatedData.access_info_en,
          parking_info_ko: translatedData.parking_info_ko,
          parking_info_en: translatedData.parking_info_en,
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
          opening_hours: translatedData.opening_hours_ko || festivalData.opening_hours_original,
          access_info: translatedData.access_info_ko || festivalData.access_info_original,
          parking_info: translatedData.parking_info_ko || festivalData.parking_info_original,
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