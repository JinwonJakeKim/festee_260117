import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
  return DIRECT_CATEGORY_MAP[key] || null;
}

// 설명 텍스트를 일정 길이로 잘라 LLM 처리 시간 단축
function truncateText(text, maxLength = 1500) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

async function processSingleRecord(base44, rawDataId, retransform, blacklistedTerms) {
  // 원본 데이터 가져오기
  const rawDataRecords = await base44.asServiceRole.entities.JapantravelRawData.filter({ id: rawDataId });
  const rawData = rawDataRecords[0];

  if (!rawData) {
    return { rawDataId, success: false, error: 'Raw data not found' };
  }

  console.log(`[Transform] Processing: ${rawData.name_original}`);

  // 블랙리스트 체크
  const nameToCheck = (rawData.name_original || '').toLowerCase();
  const matchedTerm = blacklistedTerms.find(term => nameToCheck.includes(term));
  if (matchedTerm) {
    console.log(`[Transform] ⛔ Blacklisted: "${matchedTerm}" in: ${rawData.name_original}`);
    await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
      processing_status: 'failed',
      error_message: `블랙리스트 단어 포함: "${matchedTerm}"`
    });
    return { rawDataId, success: false, skipped: true, error: `블랙리스트 단어 포함: "${matchedTerm}"` };
  }

  // 상태 업데이트 - processing
  await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
    processing_status: 'processing'
  });

  const festivalData = rawData;
  let thumbnailUrl = festivalData.thumbnail_url;
  let mediaUrls = festivalData.image_gallery_urls || [];

  let latitude = festivalData.latitude;
  let longitude = festivalData.longitude;
  let geocodingStatus = latitude && longitude ? 'success' : 'failed';
  let videoUrl = festivalData.video_url;
  let videoChannelName = '';
  let youtubeShortUrls = [];

  // description 길이 제한 (LLM 응답 속도 향상)
  const truncatedDescription = truncateText(festivalData.description_original, 1500);
  const truncatedSummary = truncateText(festivalData.summary_original, 500);

  // 기존 Festival 엔티티에서 유튜브 데이터 미리 확인 (API 한도 절약)
  let existingVideoUrl = null;
  let existingShorts = [];
  if (rawData.festival_id) {
    const existingFestivals = await base44.asServiceRole.entities.Festival.filter({ id: rawData.festival_id });
    if (existingFestivals[0]) {
      existingVideoUrl = existingFestivals[0].video_url || null;
      existingShorts = existingFestivals[0].youtube_shorts_urls || [];
      if (existingVideoUrl) videoChannelName = existingFestivals[0].video_channel_name || '';
    }
  }

  const hasHighlight = !!(existingVideoUrl && existingVideoUrl.trim());
  const hasShorts = existingShorts.length > 0;
  const shouldSearchHighlight = !hasHighlight && (!videoUrl || videoUrl.trim() === '');
  const shouldSearchShorts = !hasShorts;

  // 기존 영상이 있으면 그대로 사용
  if (hasHighlight && (!videoUrl || videoUrl.trim() === '')) {
    videoUrl = existingVideoUrl;
  }
  if (hasShorts) {
    youtubeShortUrls = existingShorts;
  }

  // YouTube promise - 하이라이트도 숏츠도 필요없으면 스킵
  const youtubePromise = (shouldSearchHighlight || shouldSearchShorts)
    ? base44.functions.invoke('fetchYoutubeVideos', {
        festivalName: festivalData.name_original,
        searchHighlightVideo: shouldSearchHighlight,
        searchShorts: shouldSearchShorts
      }).catch(e => { console.error('[Transform] YouTube error:', e.message); return { data: { success: false } }; })
    : Promise.resolve({ data: { success: false, skipped: true } });

  if (!shouldSearchHighlight && !shouldSearchShorts) {
    console.log(`[Transform] ⏭️ YouTube API skipped (existing video & shorts found)`);
  }

  // Google Translate 1순위 번역 (월 한도 초과 시 LLM 폴백)
  const googleTranslatePromise = base44.functions.invoke('googleTranslate', {
    texts: {
      name: festivalData.name_original || '',
      summary: truncatedSummary || '',
      description: truncatedDescription || '',
      city: festivalData.city || '',
      country: festivalData.country || '',
    },
    targetLanguages: ['ko', 'en', 'ja', 'zh-CN']
  }).catch(e => { console.warn('[Transform] Google Translate error:', e.message); return { data: { success: false } }; });

  // LLM translation promise (description 길이 제한 적용) - 폴백용
  const llmPromise = base44.integrations.Core.InvokeLLM({
    prompt: `
다음 축제 정보를 한국어, 영어, 일본어, 중국어 4개 언어로 번역하고 하이라이트를 생성하세요.

원본 언어: ${festivalData.original_language || 'unknown'}
축제명: ${festivalData.name_original || ''}
요약: ${truncatedSummary || ''}
설명: ${truncatedDescription || ''}
카테고리: ${festivalData.category || ''}
태그: ${JSON.stringify(festivalData.tags || [])}
국가: ${festivalData.country || ''}
도시: ${festivalData.city || ''}

번역 규칙:
- _ko: 한국어 (존댓말, ~입니다체)
- _en: 영어 (간결하고 자연스럽게)
- _jp: 일본어 (です・ます調)
- _zh: 중국어 (간체자)
- 고유명사(축제명, 장소명)는 원문 유지

하이라이트: description/summary 기반으로 핵심 매력 3~5개 (각 15~40자), 4개 언어 각각 생성

카테고리(category_ko): 원본 카테고리와 내용을 보고 아래 중 하나 선택:
음악, 문화, 예술, 음식, 스포츠, 지역축제, 기타

태그(tags_ko): 원본 태그가 없더라도 축제 이름/요약/설명을 분석하여 관련 태그를 3~8개 한국어로 생성하세요.
예) 불꽃놀이, 야외공연, 전통문화, 음악축제, 가족여행, 야시장, 벚꽃, 여름축제 등
tags_en, tags_jp, tags_zh는 tags_ko를 각 언어로 번역하세요.

country와 city를 4개 언어로 번역해주세요. 고유명사(도시명)는 해당 언어 표기법을 따르세요.
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
        category_ko: { type: "string" },
        category_en: { type: "string" },
        category_jp: { type: "string" },
        category_zh: { type: "string" },
        tags_ko: { type: "array", items: { type: "string" } },
        tags_en: { type: "array", items: { type: "string" } },
        tags_jp: { type: "array", items: { type: "string" } },
        tags_zh: { type: "array", items: { type: "string" } },
        country_ko: { type: "string" },
        country_en: { type: "string" },
        country_jp: { type: "string" },
        country_zh: { type: "string" },
        city_ko: { type: "string" },
        city_en: { type: "string" },
        city_jp: { type: "string" },
        city_zh: { type: "string" }
      },
      required: ["name_ko", "name_en", "name_jp", "name_zh", "description_ko", "description_en", "description_jp", "description_zh", "highlights_ko", "highlights_en", "highlights_jp", "highlights_zh"]
    }
  }).catch(e => {
    console.error('[Transform] LLM failed:', e.message);
    return {
      name_ko: festivalData.name_original, name_en: festivalData.name_original,
      name_jp: festivalData.name_original, name_zh: festivalData.name_original,
      summary_ko: festivalData.summary_original, summary_en: festivalData.summary_original,
      summary_jp: festivalData.summary_original, summary_zh: festivalData.summary_original,
      description_ko: festivalData.description_original, description_en: festivalData.description_original,
      description_jp: festivalData.description_original, description_zh: festivalData.description_original,
      highlights_ko: [], highlights_en: [], highlights_jp: [], highlights_zh: [],
      category_en: festivalData.category, category_jp: festivalData.category, category_zh: festivalData.category,
      tags_ko: festivalData.tags || [], tags_en: festivalData.tags || [], tags_jp: festivalData.tags || [], tags_zh: festivalData.tags || [],
      country_ko: festivalData.country, country_en: festivalData.country, country_jp: festivalData.country, country_zh: festivalData.country,
      city_ko: festivalData.city, city_en: festivalData.city, city_jp: festivalData.city, city_zh: festivalData.city,
    };
  });

  // Google Translate + LLM + YouTube 병렬 실행
  const [googleTranslateResult, llmTranslatedData, youtubeResult] = await Promise.all([googleTranslatePromise, llmPromise, youtubePromise]);

  // Google Translate 결과를 우선 사용, 실패 시 LLM 폴백
  let translatedData = llmTranslatedData;
  if (googleTranslateResult?.data?.success) {
    const gt = googleTranslateResult.data.results;
    console.log(`[Transform] ✅ Using Google Translate results`);
    translatedData = {
      ...llmTranslatedData,
      name_ko: gt.name?.ko || llmTranslatedData.name_ko,
      name_en: gt.name?.en || llmTranslatedData.name_en,
      name_jp: gt.name?.jp || llmTranslatedData.name_jp,
      name_zh: gt.name?.zh || llmTranslatedData.name_zh,
      summary_ko: gt.summary?.ko || llmTranslatedData.summary_ko,
      summary_en: gt.summary?.en || llmTranslatedData.summary_en,
      summary_jp: gt.summary?.jp || llmTranslatedData.summary_jp,
      summary_zh: gt.summary?.zh || llmTranslatedData.summary_zh,
      description_ko: gt.description?.ko || llmTranslatedData.description_ko,
      description_en: gt.description?.en || llmTranslatedData.description_en,
      description_jp: gt.description?.jp || llmTranslatedData.description_jp,
      description_zh: gt.description?.zh || llmTranslatedData.description_zh,
      city_ko: gt.city?.ko || llmTranslatedData.city_ko,
      city_en: gt.city?.en || llmTranslatedData.city_en,
      city_jp: gt.city?.jp || llmTranslatedData.city_jp,
      city_zh: gt.city?.zh || llmTranslatedData.city_zh,
      country_ko: gt.country?.ko || llmTranslatedData.country_ko,
      country_en: gt.country?.en || llmTranslatedData.country_en,
      country_jp: gt.country?.jp || llmTranslatedData.country_jp,
      country_zh: gt.country?.zh || llmTranslatedData.country_zh,
    };
  } else {
    console.warn(`[Transform] ⚠️ Google Translate failed/limit, using LLM results`);
  }
  console.log(`[Transform] Parallel done for: ${festivalData.name_original}`);

  // YouTube 결과 처리
  if (youtubeResult.data?.success) {
    if (shouldSearchHighlight && youtubeResult.data.highlightVideoUrl) {
      videoUrl = youtubeResult.data.highlightVideoUrl;
      videoChannelName = youtubeResult.data.highlightVideoChannelName || '';
    }
    youtubeShortUrls = youtubeResult.data.shortsUrls || [];
  }

  // 쇼츠 없으면 현지 언어로 재검색
  if (youtubeShortUrls.length === 0) {
    const countryLanguageMap = { 'japan': 'name_jp', 'china': 'name_zh', 'korea': 'name_ko' };
    const localName = translatedData[countryLanguageMap[(festivalData.country || '').toLowerCase()]];
    if (localName && localName !== festivalData.name_original) {
      const localYt = await base44.functions.invoke('fetchYoutubeVideos', {
        festivalName: localName, searchHighlightVideo: false, searchShorts: true
      }).catch(() => ({ data: { success: false } }));
      if (localYt.data?.success) youtubeShortUrls = localYt.data.shortsUrls || [];
    }
  }

  // 주소 처리: rawAddress 그대로 사용
  const accessInfo = festivalData.address || '';

  const now = new Date().toISOString();

  const festivalPayload = {
    name_original: festivalData.name_original,
    summary_original: festivalData.summary_original,
    description_original: festivalData.description_original,
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
    category_en: translatedData.category_en,
    category_jp: translatedData.category_jp,
    category_zh: translatedData.category_zh,
    tags_en: translatedData.tags_en || [],
    tags_jp: translatedData.tags_jp || [],
    tags_zh: translatedData.tags_zh || [],
    tags_ko: translatedData.tags_ko || [],

    name: translatedData.name_ko || festivalData.name_original,
    summary: translatedData.summary_ko || festivalData.summary_original,
    description: translatedData.description_ko || festivalData.description_original,
    opening_hours: festivalData.opening_hours,
    access_info: accessInfo,
    parking_info: festivalData.parking,
    highlights: translatedData.highlights_ko || [],
    tags: (translatedData.tags_ko && translatedData.tags_ko.length > 0) ? translatedData.tags_ko : (festivalData.tags || []),
    category: (() => {
      const direct = mapCategoryDirect(festivalData.category);
      if (direct) return direct;
      const llmCategory = translatedData.category_ko;
      if (llmCategory && VALID_CATEGORIES.includes(llmCategory)) return llmCategory;
      return '기타';
    })(),

    country: festivalData.country,
    country_ko: translatedData.country_ko || festivalData.country,
    country_en: translatedData.country_en || festivalData.country,
    country_jp: translatedData.country_jp || festivalData.country,
    country_zh: translatedData.country_zh || festivalData.country,
    city: festivalData.city,
    city_ko: translatedData.city_ko || festivalData.city,
    city_en: translatedData.city_en || festivalData.city,
    city_jp: translatedData.city_jp || festivalData.city,
    city_zh: translatedData.city_zh || festivalData.city,
    start_date: festivalData.start_date,
    end_date: festivalData.end_date,
    date_status: festivalData.date_status,
    latitude,
    longitude,
    geocoding_status: geocodingStatus,
    thumbnail_url: thumbnailUrl,
    video_url: videoUrl,
    video_channel_name: videoChannelName,
    image_gallery_urls: festivalData.image_gallery_urls,
    media_urls: mediaUrls,
    youtube_shorts_urls: youtubeShortUrls,
    website: (festivalData.website && !festivalData.website.includes('japantravel.co.jp') && !festivalData.website.includes('japantravel.com')) ? festivalData.website : null,
    price: festivalData.price_yen ? Math.round(festivalData.price_yen * 9.5) : 0,
    price_yen: festivalData.price_yen || null,
    price_details: festivalData.price_details,
    organizer: festivalData.organizer,
    contact: festivalData.contact,
    social_media: festivalData.social_media,
    lineup: festivalData.lineup || [],
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
    festivalId = existingFestivalsByName[0].id;
    await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
    console.log(`[Transform] ✓ Updated Festival by name: ${festivalId}`);
  } else if (retransform && festivalId) {
    const existingFestivals = await base44.asServiceRole.entities.Festival.filter({ id: festivalId });
    if (existingFestivals[0]) {
      await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
      console.log(`[Transform] ✓ Updated Festival by ID: ${festivalId}`);
    } else {
      const newFestival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now, update_time: now });
      festivalId = newFestival.id;
      console.log(`[Transform] ✓ Created Festival (original not found): ${festivalId}`);
    }
  } else {
    const newFestival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now, update_time: now });
    festivalId = newFestival.id;
    console.log(`[Transform] ✓ Created Festival: ${festivalId}`);
  }

  // 상태 업데이트 - processed
  await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
    processing_status: 'processed',
    festival_id: festivalId,
    error_message: null
  });

  return { rawDataId, festivalId, success: true, festivalName: festivalPayload.name_original };
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
      return Response.json({ success: false, error: 'rawDataIds array is required' }, { status: 400 });
    }

    // 배치 크기 1개로 고정 - CPU 시간 제한 초과 방지
    const rawDataId = rawDataIds[0];
    console.log(`[Transform] Starting 1 record (fixed batch size=1), retransform=${retransform}`);

    // 블랙리스트 로드
    const blacklistedTermRecords = await base44.asServiceRole.entities.BlacklistedTerm.list();
    const blacklistedTerms = blacklistedTermRecords
      .filter(r => r.is_active !== false)
      .map(r => r.term.toLowerCase());
    console.log(`[Transform] Loaded ${blacklistedTerms.length} blacklisted terms`);

    let result;
    try {
      result = await processSingleRecord(base44, rawDataId, retransform, blacklistedTerms);
    } catch (itemError) {
      console.error(`[Transform] Error processing ${rawDataId}:`, itemError.message);
      await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
        processing_status: 'failed',
        error_message: itemError.message
      }).catch(() => {});
      result = { rawDataId, success: false, error: itemError.message };
    }

    return Response.json({
      success: true,
      message: result.success ? `변환 완료: 성공 1개` : `변환 완료: 실패 1개`,
      results: [result]
    });

  } catch (error) {
    console.error('[Transform] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});