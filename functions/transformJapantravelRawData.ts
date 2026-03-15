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
  // 재변환(retransform=true)이면 항상 재쿼리, 아니면 기존 영상이 없을 때만 쿼리
  const shouldSearchHighlight = retransform ? true : (!hasHighlight && (!videoUrl || videoUrl.trim() === ''));
  const shouldSearchShorts = retransform ? true : !hasShorts;

  // 재변환이 아닐 때만 기존 영상 유지
  if (!retransform) {
    if (hasHighlight && (!videoUrl || videoUrl.trim() === '')) {
      videoUrl = existingVideoUrl;
    }
    if (hasShorts) {
      youtubeShortUrls = existingShorts;
    }
  }

  // 이미 번역된 Festival이 있으면 번역 스킵
  const alreadyTranslated = !!(
    existingFestivalRecord &&
    existingFestivalRecord.name_ko &&
    existingFestivalRecord.name_en &&
    existingFestivalRecord.description_ko
  );

  if (alreadyTranslated && !retransform) {
    console.log(`[Transform] ⏭️ Translation skipped - already translated (retransform=false)`);
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
  const googleTranslatePromise = (alreadyTranslated && !retransform)
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
        return base44.functions.invoke('googleTranslate', {
          texts: textsToTranslate,
          targetLanguages: filteredTargets
        }).catch(e => { console.warn('[Transform] Google Translate error:', e.message); return { data: { success: false } }; });
      })();

  // LLM translation promise (description 길이 제한 적용) - 폴백용
  const llmPromise = (alreadyTranslated && !retransform)
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
  const [googleTranslateResult, llmTranslatedData] = await Promise.all([googleTranslatePromise, llmPromise]);

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

  if (shouldSearchHighlight || shouldSearchShorts) {
    // 영어 원본명 쿼리 보정: 년도 제거
    const buildEnglishYoutubeQuery = (name) => {
      if (!name) return name;
      let cleaned = name.replace(/\s*20\d{2}\s*/g, ' ').trim();
      const festivalKeywords = [
        '축제', '페스티벌', '퍼레이드', '의식', '박람회', '마라톤', '쇼', '전시회', '페스타',
        'festival', 'festivals', 'parade', 'parades', 'fair', 'fairs',
        'marathon', 'marathons', 'show', 'shows', 'exhibition', 'exhibitions', 'festa'
      ];
      const hasFestivalKeyword = festivalKeywords.some(kw => cleaned.toLowerCase().includes(kw.toLowerCase()));
      if (!hasFestivalKeyword) {
        const hasKorean = /[\uAC00-\uD7A3]/.test(cleaned);
        cleaned = `${cleaned} ${hasKorean ? '축제' : 'festival'}`;
      }
      return cleaned;
    };

    // 일본어 쿼리 보정: 년도/年 제거 + 祭り 없으면 추가
    const buildJapaneseYoutubeQuery = (nameJp) => {
      if (!nameJp) return nameJp;
      let cleaned = nameJp.replace(/\d{4}[年년]?/g, '').replace(/\s{2,}/g, ' ').trim();
      const festivalKeywords = [
        '祭り', 'まつり', 'パレード', 'イベント', 'フェア', 'マラソン', 'ショー', '展示会', 'フェスタ',
        'festival', 'festivals', 'parade', 'parades', 'fair', 'fairs',
        'marathon', 'marathons', 'show', 'shows', 'exhibition', 'exhibitions', 'festa'
      ];
      const hasKeyword = festivalKeywords.some(kw => cleaned.includes(kw));
      if (!hasKeyword) {
        cleaned = cleaned + ' 祭り';
      }
      return cleaned;
    };

    // 1차: 영어 원본명으로 검색
    const enSearchName = buildEnglishYoutubeQuery(festivalData.name_original);
    enSearchNameUsed = enSearchName;
    console.log(`[Transform] 🎬 YouTube search (영어 원본): "${enSearchName}", highlight=${shouldSearchHighlight}, shorts=${shouldSearchShorts}`);

    const firstResult = await base44.functions.invoke('fetchYoutubeVideos', {
      festivalName: enSearchName,
      searchHighlightVideo: shouldSearchHighlight,
      searchShorts: shouldSearchShorts
    }).catch(e => {
      if (e.message && e.message.includes('YOUTUBE_API_LIMIT_REACHED')) throw e;
      return { data: { success: false } };
    });

    if (firstResult.data?.success) {
      if (shouldSearchHighlight && firstResult.data.highlightVideoUrl) {
        videoUrl = firstResult.data.highlightVideoUrl;
        videoChannelName = firstResult.data.highlightVideoChannelName || '';
      }
      if (shouldSearchShorts) {
        youtubeShortUrls = firstResult.data.shortsUrls || [];
        shortsViewsTotal = firstResult.data.shortsViewsTotal || 0;
        firstResultViewsList = firstResult.data.shortsViewsList || [];
      }
    }

    // 2차: 숏츠가 5개 미만이면 일본어명으로 추가 검색하여 보충
    const needMoreShorts = shouldSearchShorts && youtubeShortUrls.length < 5;
    const jpName = translatedData.name_jp;
    if (needMoreShorts && jpName) {
      const jpSearchName = buildJapaneseYoutubeQuery(jpName);
      jpSearchNameUsed = jpSearchName;
      console.log(`[Transform] 🔄 Shorts < 5 (${youtubeShortUrls.length}개), retrying with JP: "${jpSearchName}"`);

      const secondResult = await base44.functions.invoke('fetchYoutubeVideos', {
        festivalName: jpSearchName,
        searchHighlightVideo: false,
        searchShorts: true
      }).catch(e => {
        if (e.message && e.message.includes('YOUTUBE_API_LIMIT_REACHED')) throw e;
        return { data: { success: false } };
      });

      if (secondResult.data?.success && secondResult.data.shortsUrls?.length > 0) {
        // 기존 숏츠와 합쳐서 중복 제거 후 최대 5개
        const existingIds = new Set(youtubeShortUrls.map(u => u.split('/').pop()));
        const newShorts = secondResult.data.shortsUrls.filter(u => !existingIds.has(u.split('/').pop()));
        const newViewsList = secondResult.data.shortsViewsList || [];
        const addedShorts = [];
        const addedViews = [];
        newShorts.forEach((url, idx) => {
          addedShorts.push(url);
          addedViews.push(newViewsList[idx] || 0);
        });
        const prevLen = youtubeShortUrls.length;
        youtubeShortUrls = [...youtubeShortUrls, ...addedShorts].slice(0, 5);
        firstResultViewsList = [...firstResultViewsList, ...addedViews].slice(0, 5);
        shortsViewsTotal = (shortsViewsTotal || 0) + (secondResult.data.shortsViewsTotal || 0);
        console.log(`[Transform] ✓ Shorts after JP search: ${youtubeShortUrls.length}개`);
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
    youtube_shorts_urls: youtubeShortUrls,
    shorts_views_5_total: shortsViewsTotal,
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
    await base44.asServiceRole.entities.Festival.update(festivalId, { ...festivalPayload, update_time: now });
    console.log(`[Transform] ✓ Updated Festival: ${festivalId}`);
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

  // YoutubeShortsStat 스냅샷 저장 (숏츠가 있을 때만, upsert)
  if (youtubeShortUrls && youtubeShortUrls.length > 0) {
    try {
      // firstResultViewsList가 비어있으면 기존 Festival 조회수 데이터 활용
      let viewsList = firstResultViewsList || [];
      if (viewsList.length === 0 && existingFestivalRecord) {
        // 기존 YoutubeShortsStat에서 조회수 복원 시도
        const existingStats = await base44.asServiceRole.entities.YoutubeShortsStat.filter({ festival_id: festivalId }).catch(() => []);
        if (existingStats[0]) {
          viewsList = [
            existingStats[0].shorts1_views || 0,
            existingStats[0].shorts2_views || 0,
            existingStats[0].shorts3_views || 0,
            existingStats[0].shorts4_views || 0,
            existingStats[0].shorts5_views || 0,
          ];
        }
      }

      const statPayload = {
        festival_id: festivalId,
        name_ko: festivalPayload.name_ko || festivalPayload.name_original,
        name_en: festivalPayload.name_en || festivalPayload.name_original,
        name_jp: festivalPayload.name_jp || festivalPayload.name_original,
        update_time: now,
        query_en: enSearchNameUsed || '',
        query_jp: jpSearchNameUsed || '',
        query_ko: '',
        shorts1_url: youtubeShortUrls[0] || '',
        shorts1_views: viewsList[0] || 0,
        shorts2_url: youtubeShortUrls[1] || '',
        shorts2_views: viewsList[1] || 0,
        shorts3_url: youtubeShortUrls[2] || '',
        shorts3_views: viewsList[2] || 0,
        shorts4_url: youtubeShortUrls[3] || '',
        shorts4_views: viewsList[3] || 0,
        shorts5_url: youtubeShortUrls[4] || '',
        shorts5_views: viewsList[4] || 0,
        total_views: shortsViewsTotal || 0
      };

      // upsert: 기존 레코드 있으면 업데이트, 없으면 생성
      const existingStatRecords = await base44.asServiceRole.entities.YoutubeShortsStat.filter({ festival_id: festivalId }).catch(() => []);
      if (existingStatRecords[0]) {
        await base44.asServiceRole.entities.YoutubeShortsStat.update(existingStatRecords[0].id, statPayload);
        console.log(`[Transform] ✓ YoutubeShortsStat updated for festival: ${festivalId}`);
      } else {
        await base44.asServiceRole.entities.YoutubeShortsStat.create(statPayload);
        console.log(`[Transform] ✓ YoutubeShortsStat created for festival: ${festivalId}`);
      }
    } catch (statError) {
      console.error(`[Transform] ⚠️ Failed to save YoutubeShortsStat:`, statError.message);
    }
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