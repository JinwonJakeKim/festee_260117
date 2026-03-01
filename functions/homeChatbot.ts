import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { question, festivals = [], conversationHistory = [] } = await req.json();

    if (!question) {
      return Response.json({ error: 'question is required' }, { status: 400 });
    }

    // 축제 데이터를 LLM이 이해하기 쉬운 텍스트로 변환
    const festivalListText = festivals.map(f => {
      const name = f.name_ko || f.name_en || f.name_original || '이름 없음';
      const dateStr = f.start_date && f.end_date ? `${f.start_date} ~ ${f.end_date}` : '날짜 미정';
      const priceStr = f.price ? `${f.price.toLocaleString()}원` : '무료/미정';
      const tags = f.tags_ko?.join(', ') || '';
      return `[ID:${f.id}] ${name} | 위치: ${f.city_ko || f.city}, ${f.country} | 카테고리: ${f.category || '기타'} | 날짜: ${dateStr} | 가격: ${priceStr} | 좋아요: ${f.likes_count || 0} | 태그: ${tags}`;
    }).join('\n');

    // 대화 이력 구성
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

    // 추천 축제 ID로 실제 축제 데이터 찾기
    const recommendedFestivals = (result.recommendedFestivalIds || [])
      .map(id => {
        const f = festivals.find(fest => fest.id === id);
        if (!f) return null;
        const name = f.name_ko || f.name_en || f.name_original;
        const dateStr = f.start_date ? f.start_date.slice(0, 10) : '날짜 미정';
        return {
          id: f.id,
          name,
          city: f.city_ko || f.city,
          date: dateStr,
          thumbnail_url: f.thumbnail_url || null,
        };
      })
      .filter(Boolean);

    return Response.json({
      answer: result.answer,
      recommendedFestivals,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});