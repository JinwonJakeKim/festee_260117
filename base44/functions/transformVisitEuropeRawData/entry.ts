import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const VALID_CATEGORIES = ['음악', '문화', '예술', '음식', '스포츠', '지역축제', '기타'];

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getKoreaTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

async function findDuplicateFestival(base44, rawData) {
  if (!rawData.source_country || !rawData.source_city || !rawData.source_start_date) return null;
  const candidates = await base44.asServiceRole.entities.Festival.filter({
    country: rawData.source_country,
    city: rawData.source_city,
    start_date: rawData.source_start_date,
  });
  const targetName = normalizeName(rawData.source_title);
  return candidates.find(f => normalizeName(f.name_original || f.name_en || f.name) === targetName) || null;
}

async function processSingleRecord(base44, rawDataId) {
  const records = await base44.asServiceRole.entities.VisitEuropeRawData.filter({ id: rawDataId });
  const rawData = records[0];
  if (!rawData) return { rawDataId, success: false, error: 'Raw data not found' };

  console.log(`[VisitEurope Transform] Processing: ${rawData.source_title}`);

  await base44.asServiceRole.entities.VisitEuropeRawData.update(rawDataId, { processing_status: 'processing' });

  // ===== 중복 검사: normalized name + country + city + start_date =====
  const duplicate = await findDuplicateFestival(base44, rawData);
  if (duplicate) {
    console.log(`[VisitEurope Transform] Duplicate found: ${duplicate.id}`);
    await base44.asServiceRole.entities.VisitEuropeRawData.update(rawDataId, {
      processing_status: 'duplicate',
      festival_id: duplicate.id,
      error_message: null,
    });
    return { rawDataId, success: true, duplicate: true, festivalId: duplicate.id };
  }

  // ===== 번역 (Google Translate 우선, LLM 폴백/보강) =====
  const textsToTranslate = {
    name: rawData.source_title || '',
    city: rawData.source_city || '',
    country: rawData.source_country || '',
    description: (rawData.source_description || '').substring(0, 1500),
  };

  const googleTranslatePromise = base44.functions.invoke('googleTranslate', {
    texts: textsToTranslate,
    targetLanguages: ['ko', 'en', 'ja', 'zh-CN'],
  }).catch(e => { console.warn(`[VisitEurope Transform] googleTranslate error: ${e.message}`); return { data: { success: false } }; });

  const llmPromise = base44.integrations.Core.InvokeLLM({
    prompt: `다음 유럽 축제 정보를 한국어, 영어, 일본어, 중국어 4개 언어로 번역하고 하이라이트/태그/카테고리를 생성하세요.

축제명(영어 원문): ${rawData.source_title || ''}
설명(영어 원문): ${(rawData.source_description || '').substring(0, 1500)}
국가: ${rawData.source_country || ''}
도시/지역: ${rawData.source_city || ''}

규칙:
- summary_ko/en/jp/zh: 설명을 바탕으로 2~3문장 요약 작성 (사이트 소개 문구 금지)
- description_ko/en/jp/zh: 설명 전문 번역
- _ko: 한국어(존댓말), _en: 영어, _jp: 일본어(です・ます調), _zh: 중국어(간체)
- highlights: 핵심 매력 3~5개, 4개 언어 각각 생성
- tags: 관련 태그 3~8개, 4개 언어 각각 생성
- category_ko: 아래 중 하나 선택 - 음악, 문화, 예술, 음식, 스포츠, 지역축제, 기타`,
    response_json_schema: {
      type: 'object',
      properties: {
        name_ko: { type: 'string' }, name_en: { type: 'string' }, name_jp: { type: 'string' }, name_zh: { type: 'string' },
        summary_ko: { type: 'string' }, summary_en: { type: 'string' }, summary_jp: { type: 'string' }, summary_zh: { type: 'string' },
        description_ko: { type: 'string' }, description_en: { type: 'string' }, description_jp: { type: 'string' }, description_zh: { type: 'string' },
        highlights_ko: { type: 'array', items: { type: 'string' } }, highlights_en: { type: 'array', items: { type: 'string' } },
        highlights_jp: { type: 'array', items: { type: 'string' } }, highlights_zh: { type: 'array', items: { type: 'string' } },
        tags_ko: { type: 'array', items: { type: 'string' } }, tags_en: { type: 'array', items: { type: 'string' } },
        tags_jp: { type: 'array', items: { type: 'string' } }, tags_zh: { type: 'array', items: { type: 'string' } },
        category_ko: { type: 'string' },
        country_ko: { type: 'string' }, country_en: { type: 'string' }, country_jp: { type: 'string' }, country_zh: { type: 'string' },
        city_ko: { type: 'string' }, city_en: { type: 'string' }, city_jp: { type: 'string' }, city_zh: { type: 'string' },
      },
      required: ['name_ko', 'name_en', 'name_jp', 'name_zh', 'description_ko', 'description_en', 'description_jp', 'description_zh'],
    },
  }).catch(e => {
    console.error('[VisitEurope Transform] LLM failed:', e.message);
    return {
      name_ko: rawData.source_title, name_en: rawData.source_title, name_jp: rawData.source_title, name_zh: rawData.source_title,
      summary_ko: '', summary_en: '', summary_jp: '', summary_zh: '',
      description_ko: rawData.source_description, description_en: rawData.source_description,
      description_jp: rawData.source_description, description_zh: rawData.source_description,
      highlights_ko: [], highlights_en: [], highlights_jp: [], highlights_zh: [],
      tags_ko: [], tags_en: [], tags_jp: [], tags_zh: [],
      category_ko: '기타',
      country_ko: rawData.source_country, country_en: rawData.source_country, country_jp: rawData.source_country, country_zh: rawData.source_country,
      city_ko: rawData.source_city, city_en: rawData.source_city, city_jp: rawData.source_city, city_zh: rawData.source_city,
    };
  });

  const [googleTranslateResult, llmData] = await Promise.all([googleTranslatePromise, llmPromise]);

  let translated = llmData;
  if (googleTranslateResult?.data?.success) {
    const gt = googleTranslateResult.data.results;
    translated = {
      ...llmData,
      name_ko: llmData.name_ko || gt.name?.ko,
      name_en: llmData.name_en || gt.name?.en || rawData.source_title,
      name_jp: llmData.name_jp || gt.name?.jp,
      name_zh: llmData.name_zh || gt.name?.zh,
      description_ko: gt.description?.ko || llmData.description_ko,
      description_en: gt.description?.en || llmData.description_en,
      description_jp: gt.description?.jp || llmData.description_jp,
      description_zh: gt.description?.zh || llmData.description_zh,
      city_ko: llmData.city_ko || gt.city?.ko,
      country_ko: llmData.country_ko || gt.country?.ko,
    };
  }

  const category = VALID_CATEGORIES.includes(translated.category_ko) ? translated.category_ko : '기타';
  const now = getKoreaTime();

  const festivalPayload = {
    name_original: rawData.source_title,
    description_original: rawData.source_description,
    original_language: 'en',

    name_ko: translated.name_ko, name_en: translated.name_en || rawData.source_title, name_jp: translated.name_jp, name_zh: translated.name_zh,
    summary_ko: translated.summary_ko, summary_en: translated.summary_en, summary_jp: translated.summary_jp, summary_zh: translated.summary_zh,
    description_ko: translated.description_ko, description_en: translated.description_en, description_jp: translated.description_jp, description_zh: translated.description_zh,
    highlights_ko: translated.highlights_ko || [], highlights_en: translated.highlights_en || [], highlights_jp: translated.highlights_jp || [], highlights_zh: translated.highlights_zh || [],
    tags_ko: translated.tags_ko || [], tags_en: translated.tags_en || [], tags_jp: translated.tags_jp || [], tags_zh: translated.tags_zh || [],
    tags: translated.tags_ko || [],

    name: translated.name_ko || rawData.source_title,
    category,

    country: rawData.source_country,
    country_ko: translated.country_ko || rawData.source_country,
    country_en: translated.country_en || rawData.source_country,
    country_jp: translated.country_jp || rawData.source_country,
    country_zh: translated.country_zh || rawData.source_country,
    city: rawData.source_city,
    city_ko: translated.city_ko || rawData.source_city,
    city_en: translated.city_en || rawData.source_city,
    city_jp: translated.city_jp || rawData.source_city,
    city_zh: translated.city_zh || rawData.source_city,

    start_date: rawData.source_start_date,
    end_date: rawData.source_end_date || rawData.source_start_date,
    date_status: rawData.date_status || 'confirmed',

    // VisitEurope는 정확한 좌표를 제공하지 않으므로 도시 중심좌표로 임의 대체하지 않고 미확인 상태로 둠
    latitude: rawData.latitude || null,
    longitude: rawData.longitude || null,
    geocoding_status: (rawData.latitude && rawData.longitude) ? 'success' : 'pending',
    access_info: `${rawData.source_city || ''}, ${rawData.source_country || ''}`.replace(/^, /, ''),

    thumbnail_url: rawData.source_image_url,
    image_gallery_urls: rawData.source_image_url ? [{ originimgurl: rawData.source_image_url, smallimageurl: rawData.source_image_url, imgname: rawData.source_title }] : [],
    website: rawData.website || null,

    likes_count: 0,
    catches_count: 0,
    comments_count: 0,
    update_time: now,
  };

  let festival;
  if (rawData.festival_id) {
    festival = await base44.asServiceRole.entities.Festival.update(rawData.festival_id, festivalPayload);
    festival = { id: rawData.festival_id, ...festival };
  } else {
    festival = await base44.asServiceRole.entities.Festival.create({ ...festivalPayload, create_time: now });
  }

  await base44.asServiceRole.entities.VisitEuropeRawData.update(rawDataId, {
    processing_status: 'processed',
    festival_id: festival.id,
    error_message: null,
  });

  console.log(`[VisitEurope Transform] ✓ Festival saved: ${festival.id}`);
  return { rawDataId, success: true, festivalId: festival.id, festivalName: festivalPayload.name_original };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { rawDataIds } = await req.json();
    if (!rawDataIds || !Array.isArray(rawDataIds) || rawDataIds.length === 0) {
      return Response.json({ success: false, error: 'rawDataIds array is required' }, { status: 400 });
    }

    // CPU 시간 제한을 피하기 위해 1건씩 처리 (일본 자동화 파이프라인과 동일한 정책)
    const rawDataId = rawDataIds[0];
    console.log(`[VisitEurope Transform] Starting 1 record (fixed batch size=1)`);

    let result;
    try {
      result = await processSingleRecord(base44, rawDataId);
    } catch (itemError) {
      console.error(`[VisitEurope Transform] Error processing ${rawDataId}:`, itemError.message);
      await base44.asServiceRole.entities.VisitEuropeRawData.update(rawDataId, {
        processing_status: 'failed',
        error_message: itemError.message,
      }).catch(() => {});
      result = { rawDataId, success: false, error: itemError.message };
    }

    return Response.json({
      success: true,
      message: result.success ? (result.duplicate ? `중복 축제로 스킵됨 (기존 Festival ID: ${result.festivalId})` : `변환 완료: ${result.festivalName || ''}`) : `변환 실패: ${result.error}`,
      results: [result],
    });
  } catch (error) {
    console.error('[VisitEurope Transform] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}