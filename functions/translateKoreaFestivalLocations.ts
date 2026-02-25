import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 대한민국 축제 중 city_en이 없는 것만 가져오기
    const allFestivals = await base44.asServiceRole.entities.Festival.filter({ country: '대한민국' });
    const needsTranslation = allFestivals.filter(f => !f.city_en);

    console.log(`[TranslateLocations] Total KR festivals: ${allFestivals.length}`);
    console.log(`[TranslateLocations] Need translation: ${needsTranslation.length}`);

    if (needsTranslation.length === 0) {
      return Response.json({ success: true, message: '모두 이미 번역되어 있습니다.', updated: 0 });
    }

    // 고유 도시 목록 추출
    const uniqueCities = [...new Set(needsTranslation.map(f => f.city).filter(Boolean))];
    console.log(`[TranslateLocations] Unique cities to translate: ${uniqueCities.join(', ')}`);

    // 도시 일괄 번역
    const cityTranslations = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `다음 한국 도시/지역명들을 영어, 일본어, 중국어로 번역해주세요. 한국어 표기도 포함해주세요.
도시 목록: ${uniqueCities.join(', ')}

각 도시에 대해 정확한 번역을 제공하세요. 예) 서울 -> Seoul, ソウル, 首尔`,
      response_json_schema: {
        type: "object",
        properties: {
          cities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                original: { type: "string" },
                ko: { type: "string" },
                en: { type: "string" },
                jp: { type: "string" },
                zh: { type: "string" }
              },
              required: ["original", "ko", "en", "jp", "zh"]
            }
          }
        },
        required: ["cities"]
      }
    });

    // 도시 번역 맵 생성
    const cityMap = {};
    for (const c of (cityTranslations.cities || [])) {
      cityMap[c.original] = c;
    }

    console.log(`[TranslateLocations] City map built: ${Object.keys(cityMap).length} cities`);

    // 국가 번역은 고정값 사용
    const countryFixed = {
      ko: '대한민국',
      en: 'South Korea',
      jp: '韓国',
      zh: '韩国'
    };

    // 배치 업데이트
    let updated = 0;
    for (const festival of needsTranslation) {
      const cityData = cityMap[festival.city] || {
        ko: festival.city,
        en: festival.city,
        jp: festival.city,
        zh: festival.city
      };

      await base44.asServiceRole.entities.Festival.update(festival.id, {
        country_ko: countryFixed.ko,
        country_en: countryFixed.en,
        country_jp: countryFixed.jp,
        country_zh: countryFixed.zh,
        city_ko: cityData.ko,
        city_en: cityData.en,
        city_jp: cityData.jp,
        city_zh: cityData.zh,
      });

      updated++;
      if (updated % 10 === 0) {
        console.log(`[TranslateLocations] Progress: ${updated}/${needsTranslation.length}`);
      }
    }

    return Response.json({
      success: true,
      message: `${updated}개의 축제 위치 번역 완료`,
      updated,
      total: allFestivals.length
    });

  } catch (error) {
    console.error('[TranslateLocations] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});