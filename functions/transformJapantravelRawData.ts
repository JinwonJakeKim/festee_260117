import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Japantravel 카테고리 → Festival 카테고리 매핑
// 명확한 매핑은 직접 처리, 모호한 경우는 null 반환 (LLM 위임)
const DIRECT_CATEGORY_MAP = {
  'culture': '문화',
  'food': '음식',
  'music': '음악',
  'art': '예술',
  'arts': '예술',
  'sports': '스포츠',
  'sport': '스포츠',
};

const VALID_CATEGORIES = ['음악', '문화', '예술', '음식', '스포츠', '지역축제', '기타'];

function mapCategoryDirect(rawCategory) {
  if (!rawCategory) return null;
  const key = rawCategory.toLowerCase().trim();
  return DIRECT_CATEGORY_MAP[key] || null; // null이면 LLM 위임
}

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
        const rawDataRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({ id: rawDataId });
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
        await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
          processing_status: 'processing'
        });

        const festivalData = rawData;

        // Google 이미지 검색 제외 (이미지 저작권 및 정확성 우려)
        let thumbnailUrl = festivalData.thumbnail_url;
        let mediaUrls = festivalData.image_gallery_urls || [];
        console.log(`[Japantravel Transform] Using only source images (Google image search disabled)`);

        // LLM 번역 + Geocoding + YouTube를 병렬로 수행
        console.log(`[Japantravel Transform] Starting parallel: LLM translation + geocoding + youtube for: ${festivalData.name_original}`);

        let translatedData;
        let latitude = festivalData.latitude;
        let longitude = festivalData.longitude;
        let geocodingStatus = latitude && longitude ? 'success' : 'pending';
        let geocodingErrorMessage = null;
        let videoUrl = festivalData.video_url;
        let videoChannelName = '';
        let youtubeShortUrls = [];

        const shouldSearchHighlight = !videoUrl || videoUrl.trim() === '';

        // Geocoding promise
        const geocodePromise = (latitude && longitude)
          ? Promise.resolve({ data: { success: true, latitude, longitude } })
          : base44.functions.invoke('geocodeAddress', {
              address: festivalData.address,
              city: festivalData.city,
              country: festivalData.country
            }).catch(e => { console.error('[Transform] Geocode error:', e.message); return { data: { success: false, error: e.message } }; });

        // YouTube promise
        const youtubePromise = base44.functions.invoke('fetchYoutubeVideos', {
          festivalName: festivalData.name_original,
          searchHighlightVideo: shouldSearchHighlight,
          searchShorts: true
        }).catch(e => { console.error('[Transform] YouTube error:', e.message); return { data: { success: false } }; });

        // LLM translation promise
        const llmPromise = base44.integrations.Core.InvokeLLM({
            prompt: `
          다음은 japantravel.com 웹페이지에서 추출된 축제 정보의 원본 데이터입니다. 이 데이터를 **반드시** 한국어, 영어, 일본어, 중국어 4개 언어로 모두 번역하고, 설명(description)을 바탕으로 하이라이트 포인트도 생성해주세요.

          **원본 데이터:**
          - 원본 언어: ${festivalData.original_language || 'unknown'}
          - 축제명: ${festivalData.name_original || ''}
          - 요약: ${festivalData.summary_original || ''}
          - 설명: ${festivalData.description_original || ''}
          - 금지사항: ${JSON.stringify(festivalData.restrictions_original || [])}
          - 추천사항: ${JSON.stringify(festivalData.recommendations_original || [])}
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

          **🌟 하이라이트 생성 규칙 (핵심!):**
          - description(설명)과 summary(요약)를 바탕으로 이 축제의 핵심 매력 포인트를 3~5개 추출/생성해주세요
          - 각 하이라이트는 짧고 임팩트 있는 문장 (15~40자 이내)
          - 방문객이 이 축제에 꼭 가야 하는 이유를 중심으로 작성
          - 4개 언어로 각각 생성 (highlights_ko, highlights_en, highlights_jp, highlights_zh)

          **배열 필드 번역:**
          - restrictions, recommendations, tags는 각 항목을 개별 번역
          - 항목 수는 원본과 동일

          **카테고리 매핑 (category_ko):**
          원본 카테고리: "${festivalData.category || ''}"
          위 원본 카테고리와 축제 내용(이름, 설명)을 바탕으로 아래 7가지 중 가장 적합한 한국어 카테고리를 **반드시 하나만** 선택하세요:
          - 음악, 문화, 예술, 음식, 스포츠, 지역축제, 기타
          활동(Activities), 나이트라이프(Nightlife), 뷰티/스파(Beauty & Spa), 쇼핑(Shopping) 등 애매한 카테고리는 내용을 보고 판단하되, 판단이 어려우면 "기타"로 설정하세요.

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
                category_ko: { type: "string" },
                category_en: { type: "string" },
                category_jp: { type: "string" },
                category_zh: { type: "string" },
                tags_en: { type: "array", items: { type: "string" } },
                tags_jp: { type: "array", items: { type: "string" } },
                tags_zh: { type: "array", items: { type: "string" } }
              },
              required: ["name_ko", "name_en", "name_jp", "name_zh", "description_ko", "description_en", "description_jp", "description_zh", "highlights_ko", "highlights_en", "highlights_jp", "highlights_zh"]
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
            highlights_ko: [],
            highlights_en: [],
            highlights_jp: [],
            highlights_zh: [],
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

        // ② 번역 완료 후 YouTube 영상 검색 (name_jp 활용 가능)
        let videoUrl = festivalData.video_url;
        let videoChannelName = '';
        let youtubeShortUrls = [];
        
        const shouldSearchHighlight = !videoUrl || videoUrl.trim() === '';
        const festivalNameForSearch = festivalData.name_original;
        
        try {
          console.log(`[Japantravel Transform] Calling fetchYoutubeVideos (English)...`);
          const youtubeResult = await base44.functions.invoke('fetchYoutubeVideos', {
            festivalName: festivalNameForSearch,
            searchHighlightVideo: shouldSearchHighlight,
            searchShorts: true
          });
          
          if (youtubeResult.data.success) {
            if (shouldSearchHighlight && youtubeResult.data.highlightVideoUrl) {
              videoUrl = youtubeResult.data.highlightVideoUrl;
              videoChannelName = youtubeResult.data.highlightVideoChannelName || '';
              console.log(`[Japantravel Transform] ✓ Got highlight video: ${videoUrl}`);
            }
            youtubeShortUrls = youtubeResult.data.shortsUrls || [];
            console.log(`[Japantravel Transform] ✓ Got ${youtubeShortUrls.length} Shorts (English search)`);
          }
        } catch (youtubeError) {
          console.error('[Japantravel Transform] fetchYoutubeVideos (English) failed:', youtubeError.message);
        }

        // ③ 쇼츠가 없을 경우, 국가에 맞는 현지 언어로 재검색
        if (youtubeShortUrls.length === 0) {
          // 국가별 언어 필드 매핑
          const countryLanguageMap = {
            'japan': 'name_jp',
            'china': 'name_zh',
            'korea': 'name_ko',
          };
          const countryKey = (festivalData.country || '').toLowerCase();
          const localNameField = countryLanguageMap[countryKey];
          const localName = localNameField ? translatedData[localNameField] : null;

          if (localName && localName !== festivalData.name_original) {
            try {
              console.log(`[Japantravel Transform] No shorts found. Retrying with local name (${localNameField}): "${localName}"`);
              const localYoutubeResult = await base44.functions.invoke('fetchYoutubeVideos', {
                festivalName: localName,
                searchHighlightVideo: false, // 하이라이트는 이미 영어로 검색했으므로 생략
                searchShorts: true
              });

              if (localYoutubeResult.data.success) {
                youtubeShortUrls = localYoutubeResult.data.shortsUrls || [];
                console.log(`[Japantravel Transform] ✓ Got ${youtubeShortUrls.length} Shorts (local language search)`);
              }
            } catch (localYoutubeError) {
              console.error('[Japantravel Transform] fetchYoutubeVideos (local) failed:', localYoutubeError.message);
            }
          } else {
            console.log(`[Japantravel Transform] No local name available for fallback search (country: ${festivalData.country})`);
          }
        }

        // Geocoding 시도
        let latitude = festivalData.latitude;
        let longitude = festivalData.longitude;
        let geocodingStatus = 'pending';
        let geocodingErrorMessage = null;

        if (!latitude || !longitude) {
          try {
            console.log(`[Japantravel Transform] Attempting geocoding for: ${festivalData.city}, ${festivalData.address}`);
            const geocodeResult = await base44.functions.invoke('geocodeAddress', {
              address: festivalData.address,
              city: festivalData.city,
              country: festivalData.country
            });

            if (geocodeResult.data.success) {
              latitude = geocodeResult.data.latitude;
              longitude = geocodeResult.data.longitude;
              geocodingStatus = 'success';
              console.log(`[Japantravel Transform] ✅ Geocoding success: (${latitude}, ${longitude})`);
            } else {
              geocodingStatus = 'failed';
              geocodingErrorMessage = geocodeResult.data.error || 'Geocoding failed';
              console.log(`[Japantravel Transform] ❌ Geocoding failed: ${geocodingErrorMessage}`);
            }
          } catch (geocodeError) {
            geocodingStatus = 'failed';
            geocodingErrorMessage = geocodeError.message;
            console.error(`[Japantravel Transform] Geocoding error:`, geocodeError);
          }
        } else {
          geocodingStatus = 'success';
          console.log(`[Japantravel Transform] Using existing coordinates: (${latitude}, ${longitude})`);
        }

        const now = new Date().toISOString();

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
          opening_hours: festivalData.opening_hours,
          access_info: festivalData.address,
          parking_info: festivalData.parking,
          restrictions: translatedData.restrictions_ko || festivalData.restrictions_original || [],
          recommendations: translatedData.recommendations_ko || festivalData.recommendations_original || [],
          highlights: translatedData.highlights_ko || festivalData.highlights_original || [],
          tags: translatedData.tags_ko || festivalData.tags || [],
          category: (() => {
            // 1) 직접 매핑 시도 (LLM 불필요)
            const direct = mapCategoryDirect(festivalData.category);
            if (direct) {
              console.log(`[Japantravel Transform] Category direct mapped: "${festivalData.category}" → "${direct}"`);
              return direct;
            }
            // 2) LLM이 반환한 category_ko 검증
            const llmCategory = translatedData.category_ko;
            if (llmCategory && VALID_CATEGORIES.includes(llmCategory)) {
              console.log(`[Japantravel Transform] Category LLM mapped: "${festivalData.category}" → "${llmCategory}"`);
              return llmCategory;
            }
            // 3) 매핑 실패 → 기타
            console.log(`[Japantravel Transform] Category fallback to "기타" for: "${festivalData.category}"`);
            return '기타';
          })(),
          
          country: festivalData.country,
          city: festivalData.city,
          start_date: festivalData.start_date,
          end_date: festivalData.end_date,
          date_status: festivalData.date_status,
          latitude: latitude,
          longitude: longitude,
          geocoding_status: geocodingStatus,
          geocoding_error_message: geocodingErrorMessage,
          thumbnail_url: thumbnailUrl,
          video_url: videoUrl,
          video_channel_name: videoChannelName,
          image_gallery_urls: festivalData.image_gallery_urls,
          media_urls: mediaUrls,
          youtube_shorts_urls: youtubeShortUrls,
          website: festivalData.website,
          price: festivalData.price_yen ? Math.round(festivalData.price_yen * 9.5) : 0,
          price_yen: festivalData.price_yen || null,
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
          update_time: now,
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
          await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
          console.log(`[Japantravel Transform] ✓ Updated existing Festival by name: ${festivalId} (${festivalData.name_original})`);
        } else if (retransform && festivalId) {
          // 재변환 시 festival_id로 찾아서 업데이트
          const existingFestivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
          const existingFestival = existingFestivals[0];

          if (existingFestival) {
            await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
            console.log(`[Japantravel Transform] ✓ Updated existing Festival by ID: ${festivalId}`);
          } else {
            // 기존 Festival이 없으면 새로 생성
            const newFestival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now, update_time: now });
            festivalId = newFestival.id;
            console.log(`[Japantravel Transform] ✓ Created new Festival (original not found): ${festivalId}`);
          }
        } else {
          // 첫 변환이고 동일 축제명도 없으면 새로 생성
          const newFestival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now, update_time: now });
          festivalId = newFestival.id;
          console.log(`[Japantravel Transform] ✓ Created new Festival: ${festivalId}`);
        }

        // 상태 업데이트 - processed
        await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
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
        
        await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
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