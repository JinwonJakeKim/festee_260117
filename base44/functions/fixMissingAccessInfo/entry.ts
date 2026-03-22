import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// access_info가 없는 대한민국 축제들을 TourApiRawData에서 주소를 가져와 채워주는 함수
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
    let totalChecked = 0;

    while (true) {
      const festivals = await base44.asServiceRole.entities.Festival.list('-created_date', limit, skip);
      if (!festivals || festivals.length === 0) break;

      // 대한민국 축제 중 access_info가 비어있는 것
      const toFix = festivals.filter(f =>
        (f.country === '대한민국' || f.country_ko === '대한민국') &&
        (!f.access_info || f.access_info === null || f.access_info === '')
      );

      totalChecked += festivals.length;

      for (const festival of toFix) {
        if (!festival.tour_api_raw_data_id) {
          console.log(`[Fix] No tour_api_raw_data_id for: ${festival.name_ko || festival.name_original}`);
          continue;
        }

        // TourApiRawData에서 주소 가져오기
        const rawDataList = await base44.asServiceRole.entities.TourApiRawData.filter({
          id: festival.tour_api_raw_data_id
        });

        if (!rawDataList || rawDataList.length === 0) {
          console.log(`[Fix] TourApiRawData not found for festival: ${festival.name_ko || festival.name_original}`);
          continue;
        }

        const rawData = rawDataList[0];

        // 주소 추출 우선순위:
        // 1. rawData.addr1 (직접 저장된 필드)
        // 2. raw_detail_json 파싱 후 addr1
        // 3. raw_search_json 파싱 후 addr1
        // 4. raw_intro_json의 eventplace
        let addr1 = rawData.addr1 || '';
        let addr2 = rawData.addr2 || '';

        if (!addr1 && rawData.raw_detail_json) {
          try {
            const detailJson = JSON.parse(rawData.raw_detail_json);
            addr1 = detailJson.addr1 || '';
            addr2 = detailJson.addr2 || '';
          } catch (e) {}
        }

        if (!addr1 && rawData.raw_search_json) {
          try {
            const searchJson = JSON.parse(rawData.raw_search_json);
            addr1 = searchJson.addr1 || '';
            addr2 = searchJson.addr2 || '';
          } catch (e) {}
        }

        // eventplace를 보조로 사용
        let eventplace = rawData.eventplace || '';
        if (!eventplace && rawData.raw_intro_json) {
          try {
            const introJson = JSON.parse(rawData.raw_intro_json);
            eventplace = introJson.eventplace || '';
          } catch (e) {}
        }

        const accessInfo = addr1
          ? `${addr1} ${addr2}`.trim()
          : eventplace || '';

        if (accessInfo) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            access_info: accessInfo,
            access_info_ko: accessInfo
          });
          totalFixed++;
          console.log(`[Fix] Fixed access_info for: ${festival.name_ko || festival.name_original} → ${accessInfo}`);
        } else {
          console.log(`[Fix] No address found for: ${festival.name_ko || festival.name_original}`);
        }
      }

      if (festivals.length < limit) break;
      skip += limit;
    }

    return Response.json({
      success: true,
      checked: totalChecked,
      fixed: totalFixed
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});