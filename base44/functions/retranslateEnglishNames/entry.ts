import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// 영어 텍스트 여부 판별 (대부분이 영문자/숫자/공백/특수문자로 이루어진 경우)
function isEnglishName(name) {
  if (!name) return false;
  // 한글, 일본어(히라가나/가타카나/한자), 중국어가 하나라도 있으면 false
  const nonLatinPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
  return !nonLatinPattern.test(name);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { dryRun = true, limit = 50 } = await req.json().catch(() => ({}));

    // original_language가 en인 Festival 전체 조회
    let allFestivals = [];
    let skip = 0;
    const batchSize = 100;

    while (true) {
      const batch = await base44.asServiceRole.entities.Festival.list('-created_date', batchSize);
      if (batch.length === 0) break;
      allFestivals = allFestivals.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
      if (allFestivals.length >= 1000) break; // safety cap
    }

    // name 필드가 영어인 축제 필터링
    const englishNameFestivals = allFestivals.filter(f => isEnglishName(f.name));
    console.log(`[RetranslateEnglishNames] Total festivals: ${allFestivals.length}, English name: ${englishNameFestivals.length}`);

    if (dryRun) {
      return Response.json({
        dryRun: true,
        count: englishNameFestivals.length,
        festivals: englishNameFestivals.map(f => ({ id: f.id, name: f.name, name_ko: f.name_ko, name_original: f.name_original }))
      });
    }

    // 실제 재번역 처리 (limit 개수만큼)
    const toProcess = englishNameFestivals.slice(0, limit);
    const results = [];

    for (const festival of toProcess) {
      try {
        console.log(`[RetranslateEnglishNames] Translating: "${festival.name_original}"`);

        const translated = await base44.integrations.Core.InvokeLLM({
          prompt: `다음 축제명을 한국어, 일본어, 중국어로 번역/음역하세요.

원본 축제명: ${festival.name_original}

규칙:
- name_ko: 한국어. 영어/로마자 표기인 경우 반드시 한국어 발음으로 음역하세요. 예: "Kurayami Matsuri" → "쿠라야미 마쓰리", "Karuizawa Half Marathon" → "가루이자와 하프 마라톤", "Senso-ji" → "센소지". 연도(2026 등)가 있으면 끝에 한국어로 붙이세요(예: "2026년").
- name_en: 영어. 원본이 영어면 그대로 유지.
- name_jp: 일본어. 일본 축제명이면 일본어로, 아니면 カタカナ 음역.
- name_zh: 중국어 간체자 번역 또는 音역.
`,
          response_json_schema: {
            type: "object",
            properties: {
              name_ko: { type: "string" },
              name_en: { type: "string" },
              name_jp: { type: "string" },
              name_zh: { type: "string" }
            },
            required: ["name_ko", "name_en", "name_jp", "name_zh"]
          }
        });

        await base44.asServiceRole.entities.Festival.update(festival.id, {
          name: translated.name_ko,
          name_ko: translated.name_ko,
          name_en: translated.name_en,
          name_jp: translated.name_jp,
          name_zh: translated.name_zh,
        });

        results.push({ id: festival.id, original: festival.name_original, old_name: festival.name, new_name: translated.name_ko, success: true });
        console.log(`[RetranslateEnglishNames] ✓ "${festival.name}" → "${translated.name_ko}"`);

      } catch (err) {
        console.error(`[RetranslateEnglishNames] ✗ Failed for ${festival.id}: ${err.message}`);
        results.push({ id: festival.id, original: festival.name_original, old_name: festival.name, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({
      success: true,
      processed: results.length,
      successCount,
      failCount: results.length - successCount,
      results
    });

  } catch (error) {
    console.error('[RetranslateEnglishNames] Fatal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});