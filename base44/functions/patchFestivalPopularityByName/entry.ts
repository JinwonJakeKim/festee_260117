import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 사용자가 지정한 popularity=0인 축제 이름 목록
const TARGET_FESTIVAL_NAMES = [
  "새연교 주말 문화공연 '금토금토 새연쇼'",
  "궁중문화축전",
  "공주 석장리 구석기축제",
  "화성 뱃놀이 축제",
  "곡성세계장미축제",
  "고흥우주항공축제",
  "부안마실축제",
  "부산연등회",
  "창덕궁 달빛기행",
  "동학농민혁명기념제",
  "영양 산나물 축제",
  "홍성 역사인물축제",
  "청춘양구 곰취축제",
  "황매산철쭉제",
  "밀양아리랑대축제",
  "아산 성웅 이순신축제",
  "오타루 매실주 축제 2026",
  "도호쿠 음식 마라톤 2026",
  "일본 강아지 패션 2026",
  "야나세 다카시전 2026",
  "2026년 카호엔 벚꽃 축제",
  "마쓰시마 히요시 산노 축제 2026년",
  "가타쿠리노사토 2026의 독투스 제비꽃",
  "2026년 엔잔 히나 인형 축제",
  "타카모리 칸논도 벚꽃 축제 2026",
  "미드타운 블로섬 2026",
  "가메이도텐진 등나무 축제 2026",
  "미노 축제 2026",
  "마시코 꽃축제 2026",
  "2026년 후쿠이 벚꽃 축제",
  "2026년 이와쿠라 벚꽃 축제",
  "친돈 축제 2026",
  "삿테 벚꽃 축제 2026",
  "가루이자와 하프 마라톤 2026",
  "2026년 요코타 공군기지 우정 축제",
  "요코하마 프뤼링스페스트 2026",
  "센다이 라멘 페스타 2026",
  "텐시바 봄축제 2026",
  "미후네야마 라쿠엔 봄꽃축제 2026",
  "오사카 마이시마 해변 공원 네모필라 축제 2026",
  "스프링 힐 루핀 페스티벌 2026",
  "크래프트 교자 축제 2026",
  "마토 파크 벚꽃축제 2026",
  "일본 맥주 축제 2026",
  "더 미트 2026",
  "즈시 비치 영화제 2026",
  "카모 고이노보리 축제 2026",
  "쿠라야미 마쓰리 2026년",
  "브리티시 힐스 마켓 2026",
  "후쿠시마 라멘 월드 2026",
  "히메노사와 공원 꽃 축제 2026",
  "토츠쇼잔의 개꽃 축제 2026",
  "일본 호비 쇼 2026",
  "하기 오칸 마라닉 앤 워크 2026",
  "하기 여름 감귤 축제 2026",
  "슌쇼노히비키 2026",
  "유바나 축제 2026",
  "코마 신사 감사의 날 2026",
  "아사마 고원 진달래 축제 2026",
  "키쿠카 와이너리 마르쉐 2026",
  "코스프레 가타켓과 미츠케 잉글리쉬 가든",
  "나고야 성 벚꽃 축제 2026",
  "로우 와인 도쿄 2026"
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[PatchPopularity] ========== START ==========');

    const updated = [];
    const stillZero = [];
    const notFound = [];

    for (const name of TARGET_FESTIVAL_NAMES) {
      // name_ko로 Festival 검색
      const festivals = await base44.asServiceRole.entities.Festival.filter({ name_ko: name }, 'created_date', 5);

      if (festivals.length === 0) {
        console.log(`[PatchPopularity] ❌ Festival not found: ${name}`);
        notFound.push(name);
        continue;
      }

      // 중복 이름이 있을 경우 popularity=0인 것만 처리
      const targets = festivals.filter(f => (f.popularity || 0) === 0);
      if (targets.length === 0) {
        console.log(`[PatchPopularity] ⏭️ Already has popularity: ${name}`);
        continue;
      }

      for (const festival of targets) {
        // YoutubeRawdata에서 해당 festival_id의 최신 레코드 조회
        const ytRecords = await base44.asServiceRole.entities.YoutubeRawdata.filter(
          { festival_id: festival.id },
          '-update_time',
          1
        );

        if (ytRecords.length === 0) {
          console.log(`[PatchPopularity] ⚠️ No YoutubeRawdata: ${name}`);
          stillZero.push({ name, id: festival.id, reason: 'YoutubeRawdata 없음' });
          continue;
        }

        const yt = ytRecords[0];
        const ytPopularity = yt.popularity || 0;
        const ytShortsViews = yt.raw_shorts_views_5_total || 0;

        if (ytPopularity > 0) {
          await base44.asServiceRole.entities.Festival.update(festival.id, {
            popularity: ytPopularity,
            shorts_views_5_total: ytShortsViews
          });
          console.log(`[PatchPopularity] ✓ ${name} → popularity=${ytPopularity}`);
          updated.push({ name, id: festival.id, popularity: ytPopularity });
        } else {
          console.log(`[PatchPopularity] 🔴 Still 0: ${name}`);
          stillZero.push({ name, id: festival.id, reason: 'YoutubeRawdata.popularity도 0' });
        }
      }
    }

    console.log(`[PatchPopularity] ========== DONE ==========`);
    console.log(`[PatchPopularity] Updated: ${updated.length}, StillZero: ${stillZero.length}, NotFound: ${notFound.length}`);

    return Response.json({
      success: true,
      updated_count: updated.length,
      still_zero_count: stillZero.length,
      not_found_count: notFound.length,
      updated,
      still_zero: stillZero,
      not_found: notFound
    });

  } catch (error) {
    console.error('[PatchPopularity] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});