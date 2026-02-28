import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    let skip = 0;
    const limit = 100;
    let totalFixed = 0;

    while (true) {
      const festivals = await base44.asServiceRole.entities.Festival.list('-created_date', limit, skip);
      if (!festivals || festivals.length === 0) break;

      // 대한민국 축제 중 tags_ko가 비어 있는 것
      const toFix = festivals.filter(f =>
        (f.country === '대한민국' || f.country_ko === '대한민국') &&
        (!f.tags_ko || f.tags_ko.length === 0)
      );

      for (const festival of toFix) {
        // tags_en, tags_jp, tags_zh 중 가장 많은 데이터를 가진 것을 기반으로 AI 번역
        const sourceTags = festival.tags_en || festival.tags_jp || festival.tags_zh || [];

        let tags_ko = [];

        if (sourceTags.length > 0) {
          // 영어 태그를 한국어로 번역
          const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `다음 축제 태그들을 한국어로 번역해주세요. 태그는 2-5글자의 짧은 키워드 형태로 번역해주세요.\n축제명: ${festival.name_ko || festival.name_original}\n태그: ${sourceTags.join(', ')}`,
            response_json_schema: {
              type: "object",
              properties: {
                tags_ko: { type: "array", items: { type: "string" } }
              },
              required: ["tags_ko"]
            }
          });
          tags_ko = result.tags_ko || [];
        } else {
          // 태그 자체가 없으면 AI로 생성
          const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `다음 한국 축제에 맞는 태그 5-7개를 한국어로 생성해주세요. 태그는 2-5글자의 짧은 키워드여야 합니다.\n축제명: ${festival.name_ko || festival.name_original}\n카테고리: ${festival.category || ''}\n도시: ${festival.city_ko || festival.city || ''}`,
            response_json_schema: {
              type: "object",
              properties: {
                tags_ko: { type: "array", items: { type: "string" } }
              },
              required: ["tags_ko"]
            }
          });
          tags_ko = result.tags_ko || [];
        }

        // 기본 태그 추가 (국내축제, 도시명)
        const baseTagsKo = ['국내축제', festival.city_ko || festival.city || ''].filter(t => t);
        tags_ko = [...new Set([...baseTagsKo, ...tags_ko])];

        if (tags_ko.length > 0) {
          await base44.asServiceRole.entities.Festival.update(festival.id, { tags_ko });
          totalFixed++;
          console.log(`Fixed tags_ko for: ${festival.name_ko || festival.name_original} → [${tags_ko.join(', ')}]`);
        }
      }

      if (festivals.length < limit) break;
      skip += limit;
    }

    return Response.json({ success: true, fixed: totalFixed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});