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
  // retransform 시에는 기존 video_url 초기화 (블랙리스트 영상이 유지되지 않도록)
  let videoUrl = retransform ? null : festivalData.video_url;
  let videoChannelName = '';
  let youtubeShortUrls = [];

  // description 길이 제한 (LLM 응답 속도 향상)
  const truncatedDescription = truncateText(festivalData.description_original, 1500);
  const truncatedSummary = truncateText(festivalData.summary_original, 500);

  // 기존 Festival 엔티티 조회 (유튜브 데이터 보존 + 유저 인터랙션 보존)
  let existingVideoUrl = null;
  let existingShorts = [];
  let existingFestivalRecord = null;

  // festival_id로 먼저 찾기
  if (rawData.festival_id) {
    const byId = await base44.asServiceRole.entities.Festival.filter({ id: rawData.festival_id });
    if (byId[0]) existingFestivalRecord = byId[0];
  }
  // 없으면 name_original로 찾기
  if (!existingFestivalRecord) {
    const byName = await base44.asServiceRole.entities.Festival.filter({ name_original: festivalData.name_original });
    if (byName[0]) existingFestivalRecord = byName[0];
  }

  let shortsViewsTotal = 0;
  if (existingFestivalRecord) {
    existingVideoUrl = existingFestivalRecord.video_url || null;
    existingShorts = existingFestivalRecord.youtube_shorts_urls || [];
    shortsViewsTotal = existingFestivalRecord.shorts_views_5_total || 0;
    if (existingVideoUrl) videoChannelName = existingFestivalRecord.video_channel_name || '';
  }

  const hasHighlight = !!(existingVideoUrl && existingVideoUrl.trim());
  const hasShorts = existingShorts.length > 0;
  // 항상 재쿼리 (retransform 여부와 무관하게 YouTube는 항상 검색)
  const shouldSearchHighlight = true;
  const shouldSearchShorts = true;

  // 기존 영상은 재쿼리 결과가 없을 때 폴백으로만 사용
  // retransform=true 시에는 하이라이트 폴백 사용 안 함 (블랙리스트 영상이 복원되는 것 방지)
  if (!retransform && hasHighlight && (!videoUrl || videoUrl.trim() === '')) {
    videoUrl = existingVideoUrl;
  }
  if (hasShorts) {
    youtubeShortUrls = existingShorts; // 폴백: 재쿼리 결과가 있으면 덮어씌워짐
  }

  // 이미 번역된 Festival이 있으면 번역 스킵
  const alreadyTranslated = !!(
    existingFestivalRecord &&
    existingFestivalRecord.name_ko &&
    existingFestivalRecord.name_en &&
    existingFestivalRecord.description_ko
  );

  if (alreadyTranslated) {
    console.log(`[Transform] ⏭️ Translation skipped - already translated`);
  }

  // YouTube API 일일 한도(90회) 초과 여부 사전 체크
  if (shouldSearchHighlight || shouldSearchShorts) {
    const today = new Date().toISOString().split('T')[0];
    const ytLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({
      api_name: 'youtube_data_api',
      date: today
    }).catch(() => []);
    const ytCount = ytLogs[0]?.count || 0;
    if (ytCount >= 95) {
      console.warn(`[Transform] ⛔ YouTube API 일일 한도 초과 (${ytCount}/95) - 처리 중단`);
      await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
        processing_status: 'failed',
        error_message: `YouTube API 일일 한도 초과 (${ytCount}/95). 날짜가 바뀌어 초기화되면 다시 시도하세요.`
      });
      return { rawDataId, success: false, error: `YouTube API 일일 한도 초과 (${ytCount}/90)` };
    }
  }

  if (!shouldSearchHighlight && !shouldSearchShorts) {
    console.log(`[Transform] ⏭️ YouTube API skipped (existing video & shorts found)`);
  }

  // retransform + 이미 번역된 경우 description/summary 번역 스킵 (Google Translate API 비용 절약)
  const skipDescSummaryTranslation = retransform && alreadyTranslated;

  // 번역이 이미 완료된 경우 Google Translate, LLM 모두 스킵
  const googleTranslatePromise = (alreadyTranslated)
    ? Promise.resolve({ data: { success: false, skipped: true } })
    : (() => {
        // 원본 언어와 동일한 언어는 번역 대상에서 제외
        // 항상 4개 언어 모두 요청 - googleTranslate 내부에서 원본 언어 자동 감지 후 스킵 처리
        // (name이 로마자 표기인 경우 original_language와 무관하게 모든 언어 번역 필요)
        const filteredTargets = ['ko', 'en', 'ja', 'zh-CN'];
        console.log(`[Transform] Google Translate targets: ${filteredTargets.join(', ')}`);
        // retransform + 이미 번역됨 → name/city/country만 번역 (summary/description 스킵)
        const textsToTranslate = {
          name: festivalData.name_original || '',
          city: festivalData.city || '',
          country: festivalData.country || '',
        };
        if (!skipDescSummaryTranslation) {
          textsToTranslate.summary = truncatedSummary || '';
          textsToTranslate.description = truncatedDescription || '';
        } else {
          console.log(`[Transform] ⏭️ summary/description translation skipped (retransform + already translated) → API 비용 절약`);
        }
        console.log(`[API] ▶ googleTranslate 호출 시작 (fields: ${Object.keys(textsToTranslate).join(', ')})`);
        return base44.functions.invoke('googleTranslate', {
          texts: textsToTranslate,
          targetLanguages: filteredTargets
        }).then(r => { console.log(`[API] ◀ googleTranslate 호출 완료 (success: ${r?.data?.success})`); return r; })
          .catch(e => { console.warn(`[API] ✗ googleTranslate 에러: ${e.message}`); return { data: { success: false } }; });
      })();

  // LLM translation promise (description 길이 제한 적용) - 폴백용
  const llmPromise = (alreadyTranslated)
    ? Promise.resolve({
        name_ko: existingFestivalRecord.name_ko, name_en: existingFestivalRecord.name_en,
        name_jp: existingFestivalRecord.name_jp, name_zh: existingFestivalRecord.name_zh,
        summary_ko: existingFestivalRecord.summary_ko, summary_en: existingFestivalRecord.summary_en,
        summary_jp: existingFestivalRecord.summary_jp, summary_zh: existingFestivalRecord.summary_zh,
        description_ko: existingFestivalRecord.description_ko, description_en: existingFestivalRecord.description_en,
        description_jp: existingFestivalRecord.description_jp, description_zh: existingFestivalRecord.description_zh,
        highlights_ko: existingFestivalRecord.highlights_ko || [], highlights_en: existingFestivalRecord.highlights_en || [],
        highlights_jp: existingFestivalRecord.highlights_jp || [], highlights_zh: existingFestivalRecord.highlights_zh || [],
        category_ko: existingFestivalRecord.category, category_en: existingFestivalRecord.category_en,
        category_jp: existingFestivalRecord.category_jp, category_zh: existingFestivalRecord.category_zh,
        tags_ko: existingFestivalRecord.tags_ko || [], tags_en: existingFestivalRecord.tags_en || [],
        tags_jp: existingFestivalRecord.tags_jp || [], tags_zh: existingFestivalRecord.tags_zh || [],
        country_ko: existingFestivalRecord.country_ko, country_en: existingFestivalRecord.country_en,
        country_jp: existingFestivalRecord.country_jp, country_zh: existingFestivalRecord.country_zh,
        city_ko: existingFestivalRecord.city_ko, city_en: existingFestivalRecord.city_en,
        city_jp: existingFestivalRecord.city_jp, city_zh: existingFestivalRecord.city_zh,
      })
    : base44.integrations.Core.InvokeLLM({
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
- 축제명/장소명이 영어 표기(로마자)인 경우, _ko는 반드시 한국어 발음으로 음역(음차)하세요. 예: "Kurayami Matsuri" → "쿠라야미 마쓰리", "Karuizawa Half Marathon" → "가루이자와 하프 마라톤", "Shunsho-no-Hibiki" → "슌쇼노히비키"
- 축제명이 로마자로 된 일본어인 경우, _jp는 반드시 히라가나/가타카나로 변환하세요. 예: "Shunsho-no-Hibiki" → "春宵のひびき", "Kurayami Matsuri" → "くらやみ祭り"
- 단, 순수 영어 고유명사(브랜드명 등)는 영어 표기 유지

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


  // Google Translate + LLM 병렬 실행 (YouTube는 번역 완료 후 순차 실행)
  console.log(`[API] ▶ Google Translate + LLM 병렬 호출 시작`);
  const [googleTranslateResult, llmTranslatedData] = await Promise.all([googleTranslatePromise, llmPromise]);
  console.log(`[API] ◀ Google Translate + LLM 병렬 호출 완료 (GT success: ${googleTranslateResult?.data?.success})`)

  // Google Translate 결과를 우선 사용, 실패 시 LLM 폴백
  let translatedData = llmTranslatedData;
  if (googleTranslateResult?.data?.success) {
    const gt = googleTranslateResult.data.results;
    console.log(`[Transform] ✅ Using Google Translate results (name${skipDescSummaryTranslation ? ' only - summary/description skipped' : '/summary/description'})`);
    translatedData = {
      ...llmTranslatedData,
      // name은 LLM 우선 사용 (음역/음차 품질이 더 높음), LLM 실패 시만 Google Translate 폴백
      name_ko: llmTranslatedData.name_ko || gt.name?.ko,
      name_en: llmTranslatedData.name_en || gt.name?.en,
      name_jp: llmTranslatedData.name_jp || gt.name?.jp,
      name_zh: llmTranslatedData.name_zh || gt.name?.zh,
      // summary/description: retransform+이미번역이면 기존값 유지
      summary_ko: skipDescSummaryTranslation ? llmTranslatedData.summary_ko : (gt.summary?.ko || llmTranslatedData.summary_ko),
      summary_en: skipDescSummaryTranslation ? llmTranslatedData.summary_en : (gt.summary?.en || llmTranslatedData.summary_en),
      summary_jp: skipDescSummaryTranslation ? llmTranslatedData.summary_jp : (gt.summary?.jp || llmTranslatedData.summary_jp),
      summary_zh: skipDescSummaryTranslation ? llmTranslatedData.summary_zh : (gt.summary?.zh || llmTranslatedData.summary_zh),
      description_ko: skipDescSummaryTranslation ? llmTranslatedData.description_ko : (gt.description?.ko || llmTranslatedData.description_ko),
      description_en: skipDescSummaryTranslation ? llmTranslatedData.description_en : (gt.description?.en || llmTranslatedData.description_en),
      description_jp: skipDescSummaryTranslation ? llmTranslatedData.description_jp : (gt.description?.jp || llmTranslatedData.description_jp),
      description_zh: skipDescSummaryTranslation ? llmTranslatedData.description_zh : (gt.description?.zh || llmTranslatedData.description_zh),
      // city/country는 항상 LLM 결과 사용 (고유명사 정확성)
      city_ko: llmTranslatedData.city_ko,
      city_en: llmTranslatedData.city_en,
      city_jp: llmTranslatedData.city_jp,
      city_zh: llmTranslatedData.city_zh,
      country_ko: llmTranslatedData.country_ko,
      country_en: llmTranslatedData.country_en,
      country_jp: llmTranslatedData.country_jp,
      country_zh: llmTranslatedData.country_zh,
    };
  } else {
    console.warn(`[Transform] ⚠️ Google Translate failed/limit, using LLM results`);
  }
  console.log(`[Transform] Translation done for: ${festivalData.name_original}`);

  // YouTube 검색 (번역 완료 후 순차 실행)
  let enSearchNameUsed = '';
  let jpSearchNameUsed = '';
  let firstResultViewsList = [];
  let firstResultRelevanceRanks = [];
  let firstResultScores = [];
  let firstResultMatchedKeywords = [];
  let firstResultShortsLLMRelevances = [];
  let firstResultHighlightLLMRelevances = [];
  let extractedCoreKeywords = [];
  let highlightRelevanceRank = 0;
  let highlightScore = 0;
  let highlightMatchedKeywords = [];
  let highlightViews = 0;
  let highlightVideos = [];
  // 블록 밖에서도 접근 가능하도록 미리 선언
  const isOriginalJapanese = festivalData.original_language === 'ja';

  if (shouldSearchHighlight || shouldSearchShorts) {
    // 도시명이 쿼리에 포함되어있는지 확인하는 헬퍼
    const cityIncludedInQuery = (query, cityEn, cityJp) => {
      if (!query) return false;
      const q = query.toLowerCase();
      if (cityEn && q.includes(cityEn.toLowerCase())) return true;
      if (cityJp && q.includes(cityJp)) return true;
      return false;
    };

    // 영어 원본명 쿼리 보정: 년도 제거 + festival 없으면 추가 + 도시명 없으면 추가 (대소문자 무시)
    // explicitEventKeywords: 축제/이벤트의 성격을 이미 명확히 나타내는 단어 목록.
    // 이 단어들이 축제명에 포함되어 있으면 'festival'을 추가하지 않음 (추가하면 오히려 검색 정확도 하락).
    // 예) "Raw Wine Tokyo" → wine이 포함되어 있으므로 festival 추가 안 함 → 올바른 이벤트 영상 검색됨
    // 예) "The Meat 2026" → 해당하는 단어 없음 → 'festival' 추가 → "The Meat festival" 로 검색
    // 광역도시(city 필드) → 해당 광역도시에 속하는 주요 하위 도시 매핑
    // 축제명에 하위 도시가 포함되어 있으면 city(광역도시)를 쿼리에 추가하지 않음
    const majorCitiesInRegions = {
      // 일본 - 주요 광역도시/현 및 하위 도시
      'aichi': ['nagoya', 'toyota', 'okazaki', 'ichinomiya', 'kasugai', 'toyohashi'],
      'osaka': ['osaka', 'sakai', 'higashiosaka', 'hirakata', 'toyonaka', 'suita'],
      'tokyo': ['tokyo', 'shinjuku', 'shibuya', 'asakusa', 'harajuku', 'akihabara', 'ginza', 'roppongi', 'ueno', 'ikebukuro'],
      'kanagawa': ['yokohama', 'kawasaki', 'sagamihara', 'kamakura', 'hakone', 'odawara'],
      'kyoto': ['kyoto', 'uji', 'maizuru', 'fushimi', 'arashiyama'],
      'hyogo': ['kobe', 'himeji', 'nishinomiya', 'amagasaki', 'akashi'],
      'fukuoka': ['fukuoka', 'kitakyushu', 'kurume', 'hakata', 'tenjin'],
      'hokkaido': ['sapporo', 'hakodate', 'asahikawa', 'obihiro', 'otaru'],
      'miyagi': ['sendai', 'ishinomaki', 'osaki'],
      'hiroshima': ['hiroshima', 'fukuyama', 'onomichi', 'miyajima'],
      'shizuoka': ['shizuoka', 'hamamatsu', 'numazu', 'atami', 'shimizu'],
      'chiba': ['chiba', 'narita', 'funabashi', 'matsudo', 'urayasu'],
      'saitama': ['saitama', 'kawagoe', 'kawaguchi', 'urawa', 'omiya'],
      'nara': ['nara', 'kashihara', 'sakurai', 'yoshino'],
      'mie': ['ise', 'tsu', 'yokkaichi', 'matsusaka'],
      'nagano': ['nagano', 'matsumoto', 'karuizawa', 'suwa', 'hakuba'],
      'niigata': ['niigata', 'nagaoka', 'joetsu'],
      'okinawa': ['naha', 'okinawa', 'nago', 'ishigaki', 'miyako'],
      'gifu': ['gifu', 'ogaki', 'takayama', 'gero'],
      'tochigi': ['nikko', 'utsunomiya', 'ashikaga', 'nasu'],
      'ibaraki': ['mito', 'tsukuba', 'hitachi'],
      'ishikawa': ['kanazawa', 'komatsu', 'wajima'],
      'ehime': ['matsuyama', 'imabari', 'uwajima'],
      'kumamoto': ['kumamoto', 'yatsushiro', 'aso'],
      'kagoshima': ['kagoshima', 'kirishima', 'yakushima'],
    };

    const explicitEventKeywords = [
      // 축제/이벤트 명시 단어만 남김 (나머지 제거하여 festival 키워드가 더 잘 추가되도록)
      'festival', 'festivals', 'fest', 'fete', 'fair', 'fairs', 'parade', 'parades',
      'marathon', 'marathons', 'show', 'shows', 'exhibition', 'exhibitions', 'expo', 'carnival',
    ];

    const buildEnglishYoutubeQuery = (name) => {
      if (!name) return name;
      let cleaned = name.replace(/[:\-\/]/g, ' ').replace(/\s*20\d{2}\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const lowerCleaned = cleaned.toLowerCase();
      const hasExplicitKeyword = explicitEventKeywords.some(kw => lowerCleaned.includes(kw));
      if (!hasExplicitKeyword) {
        cleaned = `${cleaned} festival`;
      }
      // 스마트 지역 키워드 결정:
      // city 필드(광역도시)에 속하는 하위 도시가 축제명에 이미 포함되어 있으면 city를 추가하지 않음
      const cityEn = (festivalData.city || '').toLowerCase();
      const subCities = majorCitiesInRegions[cityEn] || [];
      const festivalNameHasSubCity = subCities.some(sc => lowerCleaned.includes(sc));
      if (festivalNameHasSubCity) {
        // 축제명에 하위 도시(예: nagoya)가 이미 포함 → city(예: aichi) 추가 불필요
        console.log(`[Transform] 🗺️ EN query: sub-city already in name, skipping city "${festivalData.city}"`);
      } else if (cityEn && !lowerCleaned.includes(cityEn)) {
        // 하위 도시도 없고 city도 없으면 city 추가
        cleaned = `${cleaned} ${festivalData.city}`;
      }
      return cleaned;
    };

    // 일본어 쿼리 보정: 년도/年 제거 + 祭り 없으면 추가 + 도시명 없으면 추가
    // 영어와 동일한 explicitEventKeywords 로직 적용 (일본어 키워드 포함)
    const explicitEventKeywordsJp = [
      ...explicitEventKeywords,
      '祭り', 'まつり', 'パレード', 'イベント', 'フェア', 'マラソン', 'ショー', '展示会', 'フェスタ',
      'ワイン', 'ビール', 'ウイスキー', 'フード', 'アート', 'ジャズ', 'フィルム', 'アニメ',
    ];
    const buildJapaneseYoutubeQuery = (nameJp) => {
      if (!nameJp) return nameJp;
      let cleaned = nameJp.replace(/[:\-\/]/g, ' ').replace(/\d{4}[年년]?/g, '').replace(/\s{2,}/g, ' ').trim();
      const hasKeyword = explicitEventKeywordsJp.some(kw => cleaned.includes(kw));
      if (!hasKeyword) {
        cleaned = cleaned + ' 祭り';
      }
      // 스마트 지역 키워드 결정 (일본어):
      // 영어 축제명(name_original) 기준으로 하위 도시 포함 여부 체크
      const cityEn = (festivalData.city || '').toLowerCase();
      const subCities = majorCitiesInRegions[cityEn] || [];
      const originalNameLower = (festivalData.name_original || '').toLowerCase();
      const festivalNameHasSubCity = subCities.some(sc => originalNameLower.includes(sc));
      const cityJp = translatedData.city_jp || '';
      if (festivalNameHasSubCity) {
        // 축제 원본명에 하위 도시가 포함 → 일본어 도시명 추가 불필요
        console.log(`[Transform] 🗺️ JP query: sub-city already in name, skipping city "${cityJp || cityEn}"`);
      } else if (!cityIncludedInQuery(cleaned, cityEn, cityJp)) {
        cleaned = `${cleaned} ${cityJp || cityEn}`;
      }
      return cleaned;
    };

    // 원본명이 로마자(라틴 알파벳)로 구성된 경우 → 무조건 영어 원본명을 1차 쿼리로 사용
    // 원본 언어가 일본어(ja)이고 원본명에 일본어 문자가 포함된 경우 → 1차 일본어, 2차 영어
    // 그 외(en 등) → 1차 영어 원본명
    const isRomanScript = (str) => /^[A-Za-z0-9\s\-_&'.,:!?()『』「」【】\/]+$/.test((str || '').trim());
    const nameIsRoman = isRomanScript(festivalData.name_original);
    const useEnglishFirst = nameIsRoman || !isOriginalJapanese;

    const jpName = translatedData.name_jp;
    const jpSearchName = buildJapaneseYoutubeQuery(jpName || festivalData.name_original);
    const enSearchName = buildEnglishYoutubeQuery(festivalData.name_original);

    const primaryQuery = useEnglishFirst ? enSearchName : jpSearchName;
    const secondaryQuery = useEnglishFirst ? jpSearchName : enSearchName;
    const primaryLang = useEnglishFirst ? '영어' : '일본어';
    const secondaryLang = useEnglishFirst ? '일본어' : '영어';

    if (useEnglishFirst) {
      enSearchNameUsed = primaryQuery;
      jpSearchNameUsed = secondaryQuery;
    } else {
      jpSearchNameUsed = primaryQuery;
      enSearchNameUsed = secondaryQuery;
    }

    console.log(`[Transform] 🎬 YouTube 1차 search (${primaryLang}): "${primaryQuery}", highlight=${shouldSearchHighlight}, shorts=${shouldSearchShorts}`);

    console.log(`[API] ▶ fetchYoutubeVideos 1차 호출 시작 (query: "${primaryQuery}")`);
    const firstResult = await base44.functions.invoke('fetchYoutubeVideos', {
      festivalName: primaryQuery,
      searchHighlightVideo: shouldSearchHighlight,
      searchShorts: shouldSearchShorts
    }).catch(e => {
      if (e.message && e.message.includes('YOUTUBE_API_LIMIT_REACHED')) throw e;
      return { data: { success: false } };
    });

    console.log(`[API] ◀ fetchYoutubeVideos 1차 호출 완료 (success: ${firstResult.data?.success}, highlight: ${firstResult.data?.highlightVideoUrl ? '✓' : '✗'}, shorts: ${firstResult.data?.shortsUrls?.length || 0}개)`);
    if (firstResult.data?.success) {
    if (shouldSearchHighlight) {
      // score >= 1인 영상이 없으면 fetchYoutubeVideos가 '' 반환 → 기존 영상도 지움 (정확도 우선 기조)
      videoUrl = firstResult.data.highlightVideoUrl ?? '';
      videoChannelName = firstResult.data.highlightVideoUrl ? (firstResult.data.highlightVideoChannelName || '') : '';
      highlightRelevanceRank = firstResult.data.highlightRelevanceRank || 0;
      highlightScore = firstResult.data.highlightScore || 0;
      highlightMatchedKeywords = firstResult.data.highlightMatchedKeywords || [];
      highlightViews = firstResult.data.highlightViews || 0;
      highlightVideos = firstResult.data.highlightVideos || [];
      firstResultHighlightLLMRelevances = firstResult.data.highlightLLMRelevances || [];
      if (!firstResult.data.highlightVideoUrl) {
        console.log(`[Transform] ⚠️ No valid highlight video (score >= 1). Clearing existing video_url.`);
      }
    }
      if (shouldSearchShorts) {
        youtubeShortUrls = firstResult.data.shortsUrls || [];
        shortsViewsTotal = (firstResult.data.shortsViewsList || []).reduce((s, v) => s + v, 0);
        firstResultViewsList = firstResult.data.shortsViewsList || [];
        firstResultRelevanceRanks = firstResult.data.shortsRelevanceRanks || [];
        firstResultScores = firstResult.data.shortsScores || [];
        firstResultMatchedKeywords = firstResult.data.shortsMatchedKeywords || [];
        firstResultShortsLLMRelevances = firstResult.data.shortsLLMRelevances || [];
      }
      extractedCoreKeywords = firstResult.data.coreKeywords || [];
    }

    // 2차 일본어 쿼리 비활성화 (별도 지시 전까지)
    const needMoreShorts = false; // shouldSearchShorts && youtubeShortUrls.length < 5;
    if (needMoreShorts) {
      console.log(`[Transform] 🔄 Shorts < 20 (${youtubeShortUrls.length}개), retrying with ${secondaryLang}: "${secondaryQuery}"`);

      const secondResult = await base44.functions.invoke('fetchYoutubeVideos', {
        festivalName: secondaryQuery,
        searchHighlightVideo: false,
        searchShorts: true
      }).catch(e => {
        if (e.message && e.message.includes('YOUTUBE_API_LIMIT_REACHED')) throw e;
        return { data: { success: false } };
      });

      if (secondResult.data?.success && secondResult.data.shortsUrls?.length > 0) {
        const existingIds = new Set(youtubeShortUrls.map(u => u.split('/').pop()));
        const newShorts = secondResult.data.shortsUrls.filter(u => !existingIds.has(u.split('/').pop()));
        const newViewsList = secondResult.data.shortsViewsList || [];
        const newRanks = secondResult.data.shortsRelevanceRanks || [];
        const newScores = secondResult.data.shortsScores || [];
        const newKeywords = secondResult.data.shortsMatchedKeywords || [];
        const addedShorts = [], addedViews = [], addedRanks = [], addedScores = [], addedKeywords = [];
        newShorts.forEach((url, idx) => {
          addedShorts.push(url);
          addedViews.push(newViewsList[idx] || 0);
          addedRanks.push(newRanks[idx] || 0);
          addedScores.push(newScores[idx] || 0);
          addedKeywords.push(newKeywords[idx] || []);
        });
        youtubeShortUrls = [...youtubeShortUrls, ...addedShorts].slice(0, 20);
        firstResultViewsList = [...firstResultViewsList, ...addedViews].slice(0, 20);
        firstResultRelevanceRanks = [...firstResultRelevanceRanks, ...addedRanks].slice(0, 20);
        firstResultScores = [...firstResultScores, ...addedScores].slice(0, 20);
        firstResultMatchedKeywords = [...firstResultMatchedKeywords, ...addedKeywords].slice(0, 20);
        shortsViewsTotal = firstResultViewsList.reduce((s, v) => s + v, 0);
        console.log(`[Transform] ✓ Shorts after ${secondaryLang} search: ${youtubeShortUrls.length}개`);
      }
    }
  }

  // 주소 처리: rawAddress 그대로 사용
  const accessInfo = festivalData.address || '';

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

  const festivalPayload = {
    name_original: festivalData.name_original,
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
    opening_hours: festivalData.opening_hours,
    access_info: accessInfo,
    parking_info: festivalData.parking,
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
    youtube_shorts_urls: (() => {
      // score >= 2 AND LLM != N인 숏츠만 채택 (최대 5개)
      const result = [];
      for (let i = 0; i < youtubeShortUrls.length && result.length < 5; i++) {
        const llm = firstResultShortsLLMRelevances[i] || 'SKIP';
        if ((firstResultScores[i] || 0) >= 2 && llm !== 'N') {
          result.push(youtubeShortUrls[i]);
        }
      }
      return result;
    })(),
    shorts_views_5_total: firstResultViewsList.slice(0, 5).reduce((s, v, i) => {
      const llm = firstResultShortsLLMRelevances[i] || 'SKIP';
      return s + ((firstResultScores[i] || 0) >= 2 && llm !== 'N' ? v : 0);
    }, 0),
    website: (festivalData.website && !festivalData.website.includes('japantravel.co.jp') && !festivalData.website.includes('japantravel.com')) ? festivalData.website : null,
    price: festivalData.price_yen ? Math.round(festivalData.price_yen * 9.5) : 0,
    price_yen: festivalData.price_yen || null,
    price_details: festivalData.price_details,
    organizer: festivalData.organizer,
    contact: festivalData.contact,
    social_media: festivalData.social_media,
    lineup: festivalData.lineup || [],
    star_rating: existingFestivalRecord?.star_rating || 0,
    likes_count: existingFestivalRecord?.likes_count || 0,
    catches_count: existingFestivalRecord?.catches_count || 0,
    comments_count: existingFestivalRecord?.comments_count || 0,
    update_time: now,
  };

  // 기존 Festival 업데이트 또는 신규 생성 (이미 위에서 조회한 existingFestivalRecord 재사용)
  let festivalId = rawData.festival_id;

  if (existingFestivalRecord) {
    festivalId = existingFestivalRecord.id;
    console.log(`[API] ▶ Base44 Festival.update 호출 시작 (id: ${festivalId})`);
    await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
    console.log(`[API] ◀ Base44 Festival.update 완료`);
    console.log(`[Transform] ✓ Updated Festival: ${festivalId}`);
  } else {
    console.log(`[API] ▶ Base44 Festival.create 호출 시작`);
    const newFestival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now, update_time: now });
    console.log(`[API] ◀ Base44 Festival.create 완료`);
    festivalId = newFestival.id;
    console.log(`[Transform] ✓ Created Festival: ${festivalId}`);
  }

  // 상태 업데이트 - processed
  await base44.asServiceRole.entities.JapantravelRawData.update(rawDataId, {
    processing_status: 'processed',
    festival_id: festivalId,
    error_message: null
  });

  // YoutubeRawdata 스냅샷 저장 - 영어/일본어 쿼리 각각 별도 레코드로 저장
  try {
    // query_id 생성: query + YYYYMMDDHHMMSS + 국가코드
    const langToCountryCode = (lang) => {
      if (lang === 'jp') return 'jp';
      if (lang === 'ko') return 'ko';
      return 'en';
    };
    const nowDate = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
    const pad = (n) => String(n).padStart(2, '0');
    const tsBase = `${nowDate.getUTCFullYear()}${pad(nowDate.getUTCMonth() + 1)}${pad(nowDate.getUTCDate())}${pad(nowDate.getUTCHours())}${pad(nowDate.getUTCMinutes())}${pad(nowDate.getUTCSeconds())}`;
    const makeQueryId = (lang) => `query${tsBase}${langToCountryCode(lang)}`;

    // 최종 채택된 하이라이트 영상의 조회수 계산
    // highlights1~5 중 videoUrl(채택된 URL)과 매칭되는 것을 찾아 해당 조회수 반환
    const computeSelectedHighlightViews = () => {
      if (!videoUrl) return highlightViews || 0;
      for (let i = 0; i < (highlightVideos || []).length; i++) {
        if (highlightVideos[i]?.url === videoUrl) return highlightVideos[i]?.views || 0;
      }
      return highlightViews || 0;
    };

    const isPrimaryLang = (queryLang) => queryLang === (isOriginalJapanese ? 'jp' : 'en');

    // Festival.popularity와 YoutubeRawdata.popularity에 동일하게 사용할 값 미리 계산
    const finalSelectedHighlightViews = computeSelectedHighlightViews();
    const finalShortsViewsTotal = firstResultViewsList.slice(0, 5).reduce((s, v, i) => {
      const llm = firstResultShortsLLMRelevances[i] || 'SKIP';
      return s + ((firstResultScores[i] || 0) >= 2 && llm !== 'N' ? v : 0);
    }, 0);
    const finalPopularity = finalSelectedHighlightViews + finalShortsViewsTotal;

    const buildStatPayload = (queryLang, queryText, viewsList, ranks, scores, keywords, shortsUrls, shortsTotal, hlLLM, shortsLLM) => ({
      query_en: queryLang === 'en' ? queryText : '',
      query_jp: queryLang === 'jp' ? queryText : '',
      query_ko: '',
      keywords: extractedCoreKeywords || [],
      selected_highlight_views: isPrimaryLang(queryLang) ? finalSelectedHighlightViews : 0,
      highlights1_url: isPrimaryLang(queryLang) ? (highlightVideos[0]?.url || videoUrl || '') : '',
      highlights1_views: isPrimaryLang(queryLang) ? (highlightVideos[0]?.views || highlightViews || 0) : 0,
      highlights1_keywords: isPrimaryLang(queryLang) ? (highlightVideos[0]?.matchedKeywords || highlightMatchedKeywords || []) : [],
      highlights1_relevance_rank: isPrimaryLang(queryLang) ? (highlightVideos[0]?.relevanceRank || highlightRelevanceRank || 0) : 0,
      highlights1_score: isPrimaryLang(queryLang) ? (highlightVideos[0]?.score || highlightScore || 0) : 0,
      highlights1_LLM_relevance: isPrimaryLang(queryLang) ? (hlLLM[0] || '') : '',
      highlights2_url: isPrimaryLang(queryLang) ? (highlightVideos[1]?.url || '') : '',
      highlights2_views: isPrimaryLang(queryLang) ? (highlightVideos[1]?.views || 0) : 0,
      highlights2_keywords: isPrimaryLang(queryLang) ? (highlightVideos[1]?.matchedKeywords || []) : [],
      highlights2_relevance_rank: isPrimaryLang(queryLang) ? (highlightVideos[1]?.relevanceRank || 0) : 0,
      highlights2_score: isPrimaryLang(queryLang) ? (highlightVideos[1]?.score || 0) : 0,
      highlights2_LLM_relevance: isPrimaryLang(queryLang) ? (hlLLM[1] || '') : '',
      highlights3_url: isPrimaryLang(queryLang) ? (highlightVideos[2]?.url || '') : '',
      highlights3_views: isPrimaryLang(queryLang) ? (highlightVideos[2]?.views || 0) : 0,
      highlights3_keywords: isPrimaryLang(queryLang) ? (highlightVideos[2]?.matchedKeywords || []) : [],
      highlights3_relevance_rank: isPrimaryLang(queryLang) ? (highlightVideos[2]?.relevanceRank || 0) : 0,
      highlights3_score: isPrimaryLang(queryLang) ? (highlightVideos[2]?.score || 0) : 0,
      highlights3_LLM_relevance: isPrimaryLang(queryLang) ? (hlLLM[2] || '') : '',
      highlights4_url: isPrimaryLang(queryLang) ? (highlightVideos[3]?.url || '') : '',
      highlights4_views: isPrimaryLang(queryLang) ? (highlightVideos[3]?.views || 0) : 0,
      highlights4_keywords: isPrimaryLang(queryLang) ? (highlightVideos[3]?.matchedKeywords || []) : [],
      highlights4_relevance_rank: isPrimaryLang(queryLang) ? (highlightVideos[3]?.relevanceRank || 0) : 0,
      highlights4_score: isPrimaryLang(queryLang) ? (highlightVideos[3]?.score || 0) : 0,
      highlights4_LLM_relevance: isPrimaryLang(queryLang) ? (hlLLM[3] || '') : '',
      highlights5_url: isPrimaryLang(queryLang) ? (highlightVideos[4]?.url || '') : '',
      highlights5_views: isPrimaryLang(queryLang) ? (highlightVideos[4]?.views || 0) : 0,
      highlights5_keywords: isPrimaryLang(queryLang) ? (highlightVideos[4]?.matchedKeywords || []) : [],
      highlights5_relevance_rank: isPrimaryLang(queryLang) ? (highlightVideos[4]?.relevanceRank || 0) : 0,
      highlights5_score: isPrimaryLang(queryLang) ? (highlightVideos[4]?.score || 0) : 0,
      highlights5_LLM_relevance: isPrimaryLang(queryLang) ? (hlLLM[4] || '') : '',
      raw_shorts_views_5_total: viewsList.slice(0, 5).reduce((s, v, i) => s + ((scores[i] || 0) >= 2 && (shortsLLM[i] || 'SKIP') !== 'N' ? v : 0), 0),
      popularity: (isPrimaryLang(queryLang) ? finalSelectedHighlightViews : 0) + viewsList.slice(0, 5).reduce((s, v, i) => s + ((scores[i] || 0) >= 2 && (shortsLLM[i] || 'SKIP') !== 'N' ? v : 0), 0),
      shorts1_url: shortsUrls[0] || '', shorts1_views: viewsList[0] || 0, shorts1_relevance_rank: ranks[0] || 0, shorts1_keywords: keywords[0] || [], shorts1_score: scores[0] || 0, shorts1_LLM_relevance: shortsLLM[0] || '',
      shorts2_url: shortsUrls[1] || '', shorts2_views: viewsList[1] || 0, shorts2_relevance_rank: ranks[1] || 0, shorts2_keywords: keywords[1] || [], shorts2_score: scores[1] || 0, shorts2_LLM_relevance: shortsLLM[1] || '',
      shorts3_url: shortsUrls[2] || '', shorts3_views: viewsList[2] || 0, shorts3_relevance_rank: ranks[2] || 0, shorts3_keywords: keywords[2] || [], shorts3_score: scores[2] || 0, shorts3_LLM_relevance: shortsLLM[2] || '',
      shorts4_url: shortsUrls[3] || '', shorts4_views: viewsList[3] || 0, shorts4_relevance_rank: ranks[3] || 0, shorts4_keywords: keywords[3] || [], shorts4_score: scores[3] || 0, shorts4_LLM_relevance: shortsLLM[3] || '',
      shorts5_url: shortsUrls[4] || '', shorts5_views: viewsList[4] || 0, shorts5_relevance_rank: ranks[4] || 0, shorts5_keywords: keywords[4] || [], shorts5_score: scores[4] || 0, shorts5_LLM_relevance: shortsLLM[4] || '',
      shorts6_url: shortsUrls[5] || '', shorts6_views: viewsList[5] || 0, shorts6_relevance_rank: ranks[5] || 0, shorts6_keywords: keywords[5] || [], shorts6_score: scores[5] || 0, shorts6_LLM_relevance: shortsLLM[5] || '',
      shorts7_url: shortsUrls[6] || '', shorts7_views: viewsList[6] || 0, shorts7_relevance_rank: ranks[6] || 0, shorts7_keywords: keywords[6] || [], shorts7_score: scores[6] || 0, shorts7_LLM_relevance: shortsLLM[6] || '',
      shorts8_url: shortsUrls[7] || '', shorts8_views: viewsList[7] || 0, shorts8_relevance_rank: ranks[7] || 0, shorts8_keywords: keywords[7] || [], shorts8_score: scores[7] || 0, shorts8_LLM_relevance: shortsLLM[7] || '',
      shorts9_url: shortsUrls[8] || '', shorts9_views: viewsList[8] || 0, shorts9_relevance_rank: ranks[8] || 0, shorts9_keywords: keywords[8] || [], shorts9_score: scores[8] || 0, shorts9_LLM_relevance: shortsLLM[8] || '',
      shorts10_url: shortsUrls[9] || '', shorts10_views: viewsList[9] || 0, shorts10_relevance_rank: ranks[9] || 0, shorts10_keywords: keywords[9] || [], shorts10_score: scores[9] || 0, shorts10_LLM_relevance: shortsLLM[9] || '',
      shorts11_url: shortsUrls[10] || '', shorts11_views: viewsList[10] || 0, shorts11_relevance_rank: ranks[10] || 0, shorts11_keywords: keywords[10] || [], shorts11_score: scores[10] || 0, shorts11_LLM_relevance: shortsLLM[10] || '',
      shorts12_url: shortsUrls[11] || '', shorts12_views: viewsList[11] || 0, shorts12_relevance_rank: ranks[11] || 0, shorts12_keywords: keywords[11] || [], shorts12_score: scores[11] || 0, shorts12_LLM_relevance: shortsLLM[11] || '',
      shorts13_url: shortsUrls[12] || '', shorts13_views: viewsList[12] || 0, shorts13_relevance_rank: ranks[12] || 0, shorts13_keywords: keywords[12] || [], shorts13_score: scores[12] || 0, shorts13_LLM_relevance: shortsLLM[12] || '',
      shorts14_url: shortsUrls[13] || '', shorts14_views: viewsList[13] || 0, shorts14_relevance_rank: ranks[13] || 0, shorts14_keywords: keywords[13] || [], shorts14_score: scores[13] || 0, shorts14_LLM_relevance: shortsLLM[13] || '',
      shorts15_url: shortsUrls[14] || '', shorts15_views: viewsList[14] || 0, shorts15_relevance_rank: ranks[14] || 0, shorts15_keywords: keywords[14] || [], shorts15_score: scores[14] || 0, shorts15_LLM_relevance: shortsLLM[14] || '',
      shorts16_url: shortsUrls[15] || '', shorts16_views: viewsList[15] || 0, shorts16_relevance_rank: ranks[15] || 0, shorts16_keywords: keywords[15] || [], shorts16_score: scores[15] || 0, shorts16_LLM_relevance: shortsLLM[15] || '',
      shorts17_url: shortsUrls[16] || '', shorts17_views: viewsList[16] || 0, shorts17_relevance_rank: ranks[16] || 0, shorts17_keywords: keywords[16] || [], shorts17_score: scores[16] || 0, shorts17_LLM_relevance: shortsLLM[16] || '',
      shorts18_url: shortsUrls[17] || '', shorts18_views: viewsList[17] || 0, shorts18_relevance_rank: ranks[17] || 0, shorts18_keywords: keywords[17] || [], shorts18_score: scores[17] || 0, shorts18_LLM_relevance: shortsLLM[17] || '',
      shorts19_url: shortsUrls[18] || '', shorts19_views: viewsList[18] || 0, shorts19_relevance_rank: ranks[18] || 0, shorts19_keywords: keywords[18] || [], shorts19_score: scores[18] || 0, shorts19_LLM_relevance: shortsLLM[18] || '',
      shorts20_url: shortsUrls[19] || '', shorts20_views: viewsList[19] || 0, shorts20_relevance_rank: ranks[19] || 0, shorts20_keywords: keywords[19] || [], shorts20_score: scores[19] || 0, shorts20_LLM_relevance: shortsLLM[19] || '',
      total_views: shortsTotal || 0
    });

    // 1차 쿼리 결과 저장 (영어 원본 → query_en, 일본어 원본 → query_jp)
    const primaryLangCode = isOriginalJapanese ? 'jp' : 'en';
    const primaryQueryText = isOriginalJapanese ? jpSearchNameUsed : enSearchNameUsed;
    if (primaryQueryText) {
      const primaryPayload = buildStatPayload(
        primaryLangCode, primaryQueryText,
        firstResultViewsList, firstResultRelevanceRanks, firstResultScores, firstResultMatchedKeywords,
        youtubeShortUrls, shortsViewsTotal,
        firstResultHighlightLLMRelevances, firstResultShortsLLMRelevances
      );
      await base44.asServiceRole.entities.YoutubeRawdata.create({ ...primaryPayload, festival_id: festivalId, query_id: makeQueryId(primaryLangCode), update_time: now, name_ko: translatedData.name_ko || festivalData.name_original, name_en: translatedData.name_en || '', name_jp: translatedData.name_jp || '' });
      console.log(`[Transform] ✓ YoutubeRawdata saved (primary/${primaryLangCode}): "${primaryQueryText}"`);

      // Festival.popularity = YoutubeRawdata.popularity (동일 값으로 동기화)
      await base44.asServiceRole.entities.Festival.update(festivalId, { popularity: finalPopularity });
      console.log(`[Transform] ✓ Festival.popularity updated: ${finalPopularity}`);
    }

    // 2차 쿼리 결과 저장 - needMoreShorts가 true이고 실제 API 호출이 발생한 경우에만 저장
    // (현재 needMoreShorts=false이므로 이 블록은 실행되지 않음)
  } catch (statError) {
    console.error(`[Transform] ⚠️ Failed to save YoutubeRawdata:`, statError.message);
  }

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