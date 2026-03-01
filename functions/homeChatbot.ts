import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// 질문을 정규화 + 해시하는 함수 (비슷한 질문은 같은 캐시로)
function normalizeQuestion(question) {
  return question
    .trim()
    .toLowerCase()
    .replace(/[?？！!]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[은는이가을를의]/g, '') // 조사 제거
    .trim();
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// 날짜/시간 관련 키워드가 있으면 캐시하지 않음 (실시간성 필요)
function isTimeSensitive(question) {
  const timeKeywords = ['오늘', '내일', '이번주', '이번달', '이번 주', '이번 달', '지금', '현재'];
  return timeKeywords.some(kw => question.includes(kw));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { question, festivals = [], conversationHistory = [] } = await req.json();

    if (!question) {
      return Response.json({ error: 'question is required' }, { status: 400 });
    }

    const normalized = normalizeQuestion(question);
    const questionHash = await hashString(normalized);
    const isConversational = conversationHistory.length > 2; // 대화 중간은 캐시 안함
    const timeSensitive = isTimeSensitive(question);
    const shouldCache = !isConversational && !timeSensitive;

    // 캐시 확인
    if (shouldCache) {
      const cached = await base44.asServiceRole.entities.ChatCache.filter({ question_hash: questionHash });
      const validCache = cached.find(c => c.expires_at && new Date(c.expires_at) > new Date());
      if (validCache) {
        // 캐시된 응답에서 추천 축제 매핑
        const recommendedFestivals = (validCache.recommended_festival_ids || [])
          .map(id => {
            const f = festivals.find(fest => fest.id === id);
            if (!f) return null;
            return {
              id: f.id,
              name: f.name_ko || f.name_en || f.name_original,
              city: f.city_ko || f.city,
              date: f.start_date ? f.start_date.slice(0, 10) : '날짜 미정',
              thumbnail_url: f.thumbnail_url || null,
            };
          })
          .filter(Boolean);

        return Response.json({
          answer: validCache.answer,
          recommendedFestivals,
          cached: true,
        });
      }
    }

    // 축제 데이터를 LLM이 이해하기 쉬운 텍스트로 변환
    const festivalListText = festivals.map(f => {
      const name = f.name_ko || f.name_en || f.name_original || '이름 없음';
      const dateStr = f.start_date && f.end_date ? `${f.start_date} ~ ${f.end_date}` : '날짜 미정';
      const priceStr = f.price ? `${f.price.toLocaleString()}원` : '무료/미정';
      const tags = f.tags_ko?.join(', ') || '';
      return `[ID:${f.id}] ${name} | 위치: ${f.city_ko || f.city}, ${f.country} | 카테고리: ${f.category || '기타'} | 날짜: ${dateStr} | 가격: ${priceStr} | 좋아요: ${f.likes_count || 0} | 태그: ${tags}`;
    }).join('\n');

    const historyText = conversationHistory.length > 0
      ? conversationHistory.map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n')
      : '';

    const prompt = `당신은 Festee 앱의 AI 축제 추천 도우미입니다.
아래에 Festee 앱에 등록된 축제 목록이 있습니다. 이 데이터를 기반으로 사용자의 질문에 답하세요.
Festee 데이터에 없는 내용이라면 인터넷에서 찾아서 알려주세요.

## 현재 날짜
2026-03-01 (한국 서울 기준)

## Festee 축제 데이터 (${festivals.length}개)
${festivalListText}

## 이전 대화
${historyText}

## 사용자 질문
${question}

## 답변 지침
1. 사용자가 특정 조건(날짜, 지역, 카테고리, 위치)을 언급하면 해당 조건으로 축제를 필터링해서 추천하세요.
2. 위치 추천의 경우: 예를 들어 "성남에서 서울 가는 길"처럼 지리적 근접성을 고려하세요. 성남은 서울 강남/송파 인접, 수원은 서울 남부 인접 등 한국 지리를 활용하세요.
3. 추천 축제는 최대 3개까지만 상세히 설명하세요.
4. Festee 데이터에 없는 일반적인 축제 정보(역사, 배경 등)는 알고 있는 지식으로 답변하세요.
5. 친근하고 자연스러운 한국어로 답변하세요.
6. 이모지를 적절히 사용해서 읽기 쉽게 만드세요.
7. 답변은 너무 길지 않게 (300자 이내) 핵심만 말하세요.

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
{
  "answer": "사용자에게 보여줄 텍스트 답변",
  "recommendedFestivalIds": ["추천 축제 ID 배열, 최대 3개, 없으면 빈 배열"]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          recommendedFestivalIds: {
            type: "array",
            items: { type: "string" }
          }
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
          date: f.start_date ? f.start_date.slice(0, 10) : '날짜 미정',
          thumbnail_url: f.thumbnail_url || null,
        };
      })
      .filter(Boolean);

    // 캐시에 저장 (24시간 유효)
    if (shouldCache && result.answer) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // 기존 캐시 삭제 후 신규 저장
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

    return Response.json({
      answer: result.answer,
      recommendedFestivals,
      cached: false,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});