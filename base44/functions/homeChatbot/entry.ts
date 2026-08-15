import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const DAILY_LIMIT = 5;

function normalizeQuestion(question) {
  return question
    .trim()
    .toLowerCase()
    .replace(/[?？！!]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[은는이가을를의]/g, '')
    .trim();
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function isTimeSensitive(question) {
  const timeKeywords = ['오늘', '내일', '이번주', '이번달', '이번 주', '이번 달', '지금', '현재'];
  return timeKeywords.some(kw => question.includes(kw));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { question, festivals = [], conversationHistory = [], userLanguage = 'ko', userLocation = null, likedFestivalIds = [] } = await req.json();

    if (!question) {
      return Response.json({ error: 'question is required' }, { status: 400 });
    }

    // 사용자 인증 확인
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const isAdmin = user.role === 'admin';

    // 오늘 사용량 조회
    const usageLogs = await base44.asServiceRole.entities.ChatUsageLog.filter({
      user_email: user.email,
      date: today,
    });
    const usageLog = usageLogs[0];
    const usedCount = usageLog ? usageLog.count : 0;

    // Rate Limit 체크 (어드민 제외)
    if (!isAdmin && usedCount >= DAILY_LIMIT) {
      return Response.json({
        error: 'rate_limit_exceeded',
        message: `오늘의 AI 질문 횟수(${DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 이용해주세요! 🙏`,
        dailyLimit: DAILY_LIMIT,
        usedCount,
      }, { status: 429 });
    }

    // 캐시 확인
    const normalized = normalizeQuestion(question);
    const questionHash = await hashString(normalized);
    const isConversational = conversationHistory.length > 2;
    const timeSensitive = isTimeSensitive(question);
    const shouldCache = !isConversational && !timeSensitive;

    if (shouldCache) {
      const cached = await base44.asServiceRole.entities.ChatCache.filter({ question_hash: questionHash });
      const validCache = cached.find(c => c.expires_at && new Date(c.expires_at) > new Date());
      if (validCache) {
        const recommendedFestivals = (validCache.recommended_festival_ids || [])
          .map(id => {
            const f = festivals.find(fest => fest.id === id);
            if (!f) return null;
            return {
              id: f.id,
              name: f.name_ko || f.name_en || f.name_original,
              city: f.city_ko || f.city,
              country: f.country || '',
              category: f.category || '',
              start_date: f.start_date ? f.start_date.slice(0, 10) : null,
              end_date: f.end_date ? f.end_date.slice(0, 10) : null,
              thumbnail_url: f.thumbnail_url || null,
            };
          })
          .filter(Boolean);

        return Response.json({
          answer: validCache.answer,
          recommendedFestivals,
          cached: true,
          usedCount,
          dailyLimit: isAdmin ? null : DAILY_LIMIT,
          isAdmin,
        });
      }
    }

    // LLM 호출
    // 과거 축제 필터링: 이미 종료된 축제는 별도 표시
    const todayDate = new Date(today);
    const upcomingFestivals = [];
    const pastFestivals = [];
    
    for (const f of festivals) {
      if (f.end_date && new Date(f.end_date) < todayDate) {
        pastFestivals.push(f);
      } else {
        upcomingFestivals.push(f);
      }
    }

    const festivalListText = festivals.map(f => {
      const name = f.name_ko || f.name_en || f.name_original || '이름 없음';
      const dateStr = f.start_date && f.end_date ? `${f.start_date} ~ ${f.end_date}` : '날짜 미정';
      const priceStr = f.price ? `${f.price.toLocaleString()}원` : '무료/미정';
      const tags = f.tags_ko?.join(', ') || '';
      const summary = f.summary_ko ? f.summary_ko.substring(0, 100) : '';
      const popularity = f.popularity || 0;
      const starRating = f.star_rating || '';
      const isPast = f.end_date && new Date(f.end_date) < todayDate;
      const status = isPast ? '[종료됨]' : '';
      const liked = likedFestivalIds.includes(f.id) ? '[좋아요한 축제]' : '';
      return `[ID:${f.id}] ${status} ${liked} ${name} | 위치: ${f.city_ko || f.city}, ${f.country} | 카테고리: ${f.category || '기타'} | 날짜: ${dateStr} | 가격: ${priceStr} | 인기도: ${popularity} | 별점: ${starRating} | 좋아요: ${f.likes_count || 0} | 태그: ${tags}${summary ? ' | 요약: ' + summary : ''}`;
    }).join('\n');

    const historyText = conversationHistory.length > 0
      ? conversationHistory.map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n')
      : '';

    // 사용자 언어에 따른 답변 언어 설정
    const languageMap = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
    const responseLanguage = languageMap[userLanguage] || '한국어';
    
    // 사용자 위치 컨텍스트
    const locationContext = userLocation ? `\n## 사용자 위치\n${userLocation}\n(사용자가 위치 기반 추천을 원할 경우 이 위치를 기준으로 가까운 축제를 우선 추천하세요)\n` : '';

    const prompt = `당신은 Festee 앱의 AI 축제 추천 도우미입니다.
아래에 Festee 앱에 등록된 축제 목록이 있습니다. 오직 이 데이터만 기반으로 사용자의 질문에 답하세요.
절대 인터넷 검색을 하지 말고, 위 목록에 있는 축제만 추천하세요.

## 현재 날짜
${today} (한국 서울 기준)

## 사용자 선호 언어
답변은 ${responseLanguage}로 작성하세요.

${locationContext}
## Festee 축제 데이터 (${festivals.length}개, 종료된 축제 ${pastFestivals.length}개 포함)
${festivalListText}

## 이전 대화
${historyText}

## 사용자 질문
${question}

## 답변 지침
1. **중요: 축제 추천은 반드시 위 Festee 축제 데이터 목록에 있는 축제만 추천하세요.** 목록에 없는 축제는 절대 추천하지 마세요. 인터넷 검색을 하지 마세요.
2. **답변에 외부 링크(URL)를 절대 포함하지 마세요.** https://... 형태의 링크, 도메인 이름(japantravel.com 등)을 답변에 쓰지 마세요.
3. **답변은 반드시 줄바꿈(\\n)을 사용해서 읽기 쉽게 작성하세요.** 각 축제 추천은 새 줄로 구분하고, 축제 번호와 이름 사이에도 줄바꿈을 넣으세요. 한 문단에 모든 내용을 빽빽하게 넣지 마세요.
4. 사용자가 특정 조건(날짜, 지역, 카테고리, 위치)을 언급하면 해당 조건으로 축제를 필터링해서 추천하세요.
5. 위치 추천의 경우: 사용자 위치나 언급된 지리적 근접성을 고려하세요. 예: "성남에서 서울 가는 길" → 성남 근처 축제 우선.
6. 추천 우선순위:
   - 현재 진행 중이거나 다가오는 축제를 종료된 축제보다 우선 추천하세요.
   - 인기도(popularity)와 별점(star_rating)이 높은 축제를 우선 추천하세요.
   - 사용자가 좋아요한 축제와 비슷한 카테고리/태그를 가진 축제를 우선 추천하세요.
   - 날짜가 명시되지 않은 경우, 다가오는 축제(현재 날짜 이후)를 우선 추천하세요.
7. 추천 축제는 최대 3개까지만 상세히 설명하세요.
8. 친근하고 자연스러운 ${responseLanguage}로 답변하세요.
9. 이모지를 적절히 사용해서 읽기 쉽게 만드세요.
10. 답변은 너무 길지 않게 (300자 이내) 핵심만 말하세요.
11. 추천 이유를 간단히 덧붙여 사용자가 왜 이 축제가 추천되었는지 알 수 있게 하세요.
12. Festee 목록에 사용자 질문과 맞는 축제가 없다면, "현재 Festee에 등록된 축제 중에는 해당 조건에 맞는 축제가 없어요. 비슷한 축제로는 ~가 있어요!"처럼 대안을 제시하세요.

## 답변 형식 예시
안녕하세요! 9월 일본 축제 추천해드릴게요 ✈️

1️⃣ **축제명**
📍 위치 | 📅 날짜
한 줄 설명

2️⃣ **축제명**
📍 위치 | 📅 날짜
한 줄 설명

위 축제들을 확인해보세요!

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
{
  "answer": "사용자에게 보여줄 텍스트 답변",
  "recommendedFestivalIds": ["추천 축제 ID 배열, 최대 3개, 없으면 빈 배열"]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: "gemini_3_flash",
      add_context_from_internet: false,
      response_json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          recommendedFestivalIds: { type: "array", items: { type: "string" } }
        },
        required: ["answer", "recommendedFestivalIds"]
      }
    });

    const recommendedFestivals = (result.recommendedFestivalIds || [])
      .map(id => {
        const f = festivals.find(fest => fest.id === id);
        if (!f) return null;
        return {
          id: f.id,
          name: f.name_ko || f.name_en || f.name_original,
          city: f.city_ko || f.city,
          country: f.country || '',
          category: f.category || '',
          start_date: f.start_date ? f.start_date.slice(0, 10) : null,
          end_date: f.end_date ? f.end_date.slice(0, 10) : null,
          thumbnail_url: f.thumbnail_url || null,
        };
      })
      .filter(Boolean);

    // 사용량 업데이트 (어드민 제외, LLM 실제 호출한 경우만)
    if (!isAdmin) {
      if (usageLog) {
        await base44.asServiceRole.entities.ChatUsageLog.update(usageLog.id, { count: usedCount + 1 });
      } else {
        await base44.asServiceRole.entities.ChatUsageLog.create({
          user_email: user.email,
          date: today,
          count: 1,
        });
      }
    }

    // 캐시 저장 (24시간)
    if (shouldCache && result.answer) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const existingCaches = await base44.asServiceRole.entities.ChatCache.filter({ question_hash: questionHash });
      for (const old of existingCaches) {
        await base44.asServiceRole.entities.ChatCache.delete(old.id);
      }
      await base44.asServiceRole.entities.ChatCache.create({
        question_hash: questionHash,
        question: question.slice(0, 500),
        answer: result.answer,
        recommended_festival_ids: result.recommendedFestivalIds || [],
        expires_at: expiresAt,
      });
    }

    const newUsedCount = isAdmin ? 0 : usedCount + 1;

    return Response.json({
      answer: result.answer,
      recommendedFestivals,
      cached: false,
      usedCount: newUsedCount,
      dailyLimit: isAdmin ? null : DAILY_LIMIT,
      isAdmin,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});