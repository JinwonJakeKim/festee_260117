import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const festivalId = '68e9d08ddad9e45de93b9782';

    // 현재 데이터 기반 - description_original이 있음
    const descKo = '경상남도 진주시에서 매년 10월에 개최되는 대한민국의 대표적인 전통 등(燈) 축제입니다. 임진왜란 당시 진주성 전투에서 순절한 7만여 명의 넋을 기리고 위로하기 위해 시작된 유서 깊은 축제로, 남강에 수만 개의 아름다운 등불을 띄우는 장관을 연출합니다. 2023년 유네스코 인류무형문화유산 등재를 추진 중인 문화축제입니다.\n\n📋 행사 프로그램\n1. 개막식 (10월 1일): 개막 불꽃쇼, 전통 국악 공연, 등불 점등식\n2. 주중 프로그램: 수상 등 퍼레이드, 세계 등 전시, 진주검무, 한량무, 전통 놀이 체험\n3. 폐막식 (10월 10일): 소원등 띄우기, 대형 불꽃쇼, 폐막 공연';
    const nameKo = '진주남강유등축제';

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `아래 한국 축제 정보를 영어, 일본어로 번역해줘. JSON 형식으로 반환해줘.

축제명(한국어): ${nameKo}
설명(한국어): ${descKo}
요약(한국어): 진주남강유등축제는 남강에 수만 개의 등불을 띄우며 임진왜란 순절자들을 기리는 유서 깊은 한국 전통 등 축제입니다.
하이라이트(한국어): 
- 남강에 띄워지는 수만 개의 등불 행렬
- 전통 등 전시 및 세계 각국의 등 작품
- 진주성과 촉석루의 야경과 등불의 조화
- 수상 등 퍼레이드와 불꽃놀이
- 전통 공연 및 체험 프로그램
- 진주비빔밥 등 지역 먹거리 체험
태그(한국어): 무료, 가족과, 전통문화, 야경, 포토존, 데이트, FESTEE추천`,
      response_json_schema: {
        type: 'object',
        properties: {
          name_en: { type: 'string' },
          name_jp: { type: 'string' },
          name_zh: { type: 'string' },
          summary_ko: { type: 'string' },
          summary_en: { type: 'string' },
          summary_jp: { type: 'string' },
          summary_zh: { type: 'string' },
          description_ko: { type: 'string' },
          description_en: { type: 'string' },
          description_jp: { type: 'string' },
          description_zh: { type: 'string' },
          highlights_en: { type: 'array', items: { type: 'string' } },
          highlights_jp: { type: 'array', items: { type: 'string' } },
          highlights_zh: { type: 'array', items: { type: 'string' } },
          tags_en: { type: 'array', items: { type: 'string' } },
          tags_jp: { type: 'array', items: { type: 'string' } },
          tags_zh: { type: 'array', items: { type: 'string' } },
          tags_ko: { type: 'array', items: { type: 'string' } },
          category_en: { type: 'string' },
          category_jp: { type: 'string' },
          category_zh: { type: 'string' },
          country_ko: { type: 'string' },
          country_en: { type: 'string' },
          country_jp: { type: 'string' },
          country_zh: { type: 'string' },
          city_ko: { type: 'string' },
          city_en: { type: 'string' },
          city_jp: { type: 'string' },
          city_zh: { type: 'string' },
        }
      }
    });

    const translated = response;

    // 업데이트할 데이터
    const updateData = {
      name_ko: nameKo,
      name_en: translated.name_en,
      name_jp: translated.name_jp,
      name_zh: translated.name_zh,
      name_original: nameKo,
      original_language: 'ko',
      summary: translated.summary_ko,
      summary_ko: translated.summary_ko,
      summary_en: translated.summary_en,
      summary_jp: translated.summary_jp,
      summary_zh: translated.summary_zh,
      summary_original: translated.summary_ko,
      description_ko: descKo,
      description_en: translated.description_en,
      description_jp: translated.description_jp,
      description_zh: translated.description_zh,
      description_original: descKo,
      highlights_en: translated.highlights_en,
      highlights_jp: translated.highlights_jp,
      highlights_zh: translated.highlights_zh,
      tags_en: translated.tags_en,
      tags_jp: translated.tags_jp,
      tags_zh: translated.tags_zh,
      tags_ko: translated.tags_ko,
      category_en: translated.category_en || 'Local Festival',
      category_jp: translated.category_jp || '地域祭り',
      category_zh: translated.category_zh || '地方节日',
      country_ko: '대한민국',
      country_en: 'South Korea',
      country_jp: '韓国',
      country_zh: '韩国',
      city_ko: '진주',
      city_en: 'Jinju',
      city_jp: translated.city_jp || '晋州',
      city_zh: translated.city_zh || '晋州',
    };

    await base44.asServiceRole.entities.Festival.update(festivalId, updateData);

    return Response.json({ success: true, translated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});