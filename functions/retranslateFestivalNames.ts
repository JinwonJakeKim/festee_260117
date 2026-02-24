import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// 영어인지 판별: ASCII 알파벳 비율이 70% 이상이면 영어로 판단
function isEnglishName(name) {
  if (!name) return false;
  // 한글, 일본어, 중국어 글자가 하나라도 있으면 영어 아님
  if (/[가-힣ぁ-んァ-ン一-龯]/.test(name)) return false;
  const ascii = name.split('').filter(c => /[a-zA-Z]/.test(c)).length;
  const letters = name.split('').filter(c => /[a-zA-ZÀ-ÿ가-힣ぁ-んァ-ン一-龯]/.test(c)).length;
  if (letters === 0) return false;
  return (ascii / letters) > 0.7;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const batchSize = body.batchSize || 10;
    const offset = body.offset || 0;

    // 모든 Festival 가져오기
    const allFestivals = await base44.asServiceRole.entities.Festival.list('-created_date', 500);

    // name 필드가 영어인 것만 필터
    const englishNameFestivals = allFestivals.filter(f => isEnglishName(f.name));

    console.log(`[RetranslateName] Total festivals: ${allFestivals.length}, English name: ${englishNameFestivals.length}`);

    const batch = englishNameFestivals.slice(offset, offset + batchSize);

    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        total_english: englishNameFestivals.length,
        batch_preview: batch.map(f => ({ id: f.id, name: f.name, name_ko: f.name_ko, name_original: f.name_original }))
      });
    }

    const results = [];

    for (const festival of batch) {
      try {
        console.log(`[RetranslateName] Processing: ${festival.name}`);

        const nameToTranslate = festival.name_original || festival.name;

        const translated = await base44.integrations.Core.InvokeLLM({
          prompt: `
다음 축제 이름을 한국어, 영어, 일본어, 중국어로 번역하세요.

축제 원본 이름: "${nameToTranslate}"
국가: ${festival.country || 'Japan'}
원본 언어: ${festival.original_language || 'en'}

번역 규칙:
- name_ko (한국어): 축제명이 영어 또는 일본어 로마자 표기이면 반드시 한국어 발음으로 음역(음차)하세요.
  예: "Kurayami Matsuri" → "쿠라야미 마쓰리", "Karuizawa Half Marathon" → "가루이자와 하프 마라톤"
  연도(2025, 2026 등)가 포함된 경우 "2026년 [이름]" 형식으로 작성하세요.
- name_en (영어): 영어 원문 유지 또는 자연스러운 영어 표기
- name_jp (일본어): 일본어 표기 (일본 축제는 원래 일본어명 사용)
- name_zh (중국어): 중국어 간체자 표기

반드시 name_ko는 영어가 아닌 한국어(음역 포함)로 작성하세요.
`,
          response_json_schema: {
            type: "object",
            properties: {
              name_ko: { type: "string" },
              name_en: { type: "string" },
              name_jp: { type: "string" },
              name_zh: { type: "string" },
            },
            required: ["name_ko", "name_en", "name_jp", "name_zh"]
          }
        });

        // name_ko가 여전히 영어면 스킵
        if (isEnglishName(translated.name_ko)) {
          console.warn(`[RetranslateName] ⚠️ Still English after translation: ${translated.name_ko}`);
        }

        await base44.asServiceRole.entities.Festival.update(festival.id, {
          name: translated.name_ko,
          name_ko: translated.name_ko,
          name_en: translated.name_en || festival.name_en,
          name_jp: translated.name_jp || festival.name_jp,
          name_zh: translated.name_zh || festival.name_zh,
          update_time: new Date().toISOString(),
        });

        results.push({ id: festival.id, original: festival.name, translated_ko: translated.name_ko, success: true });
        console.log(`[RetranslateName] ✓ ${festival.name} → ${translated.name_ko}`);
      } catch (e) {
        console.error(`[RetranslateName] Error for ${festival.id}: ${e.message}`);
        results.push({ id: festival.id, original: festival.name, success: false, error: e.message });
      }
    }

    return Response.json({
      success: true,
      total_english: englishNameFestivals.length,
      processed: results.length,
      remaining: Math.max(0, englishNameFestivals.length - offset - batchSize),
      next_offset: offset + batchSize,
      results
    });

  } catch (error) {
    console.error('[RetranslateName] Fatal:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});