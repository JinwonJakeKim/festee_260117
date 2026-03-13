import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 인증 확인 (선택사항 - 로그인 없이도 사용 가능)
    const user = await base44.auth.me().catch(() => null);
    
    const { question, festivalData } = await req.json();
    
    if (!question || !festivalData) {
      return Response.json({ error: 'question과 festivalData가 필요합니다' }, { status: 400 });
    }
    
    // FAQ 처리 - LLM 호출 없이 바로 답변
    const faqPatterns = [
      { pattern: /언제|날짜|기간/i, answer: `${festivalData.name}는 ${festivalData.start_date}부터 ${festivalData.end_date}까지 진행됩니다.` },
      { pattern: /어디|장소|위치/i, answer: `${festivalData.name}는 ${festivalData.city}, ${festivalData.country}에서 열립니다.` },
      { pattern: /가격|입장료|비용|얼마/i, answer: festivalData.price ? `입장료는 ₩${festivalData.price.toLocaleString()}입니다.` : '무료 입장 가능합니다.' },
      { pattern: /카테고리|종류|타입/i, answer: festivalData.category ? `${festivalData.category} 축제입니다.` : '축제 카테고리 정보가 없습니다.' },
    ];
    
    for (const faq of faqPatterns) {
      if (faq.pattern.test(question)) {
        return Response.json({ answer: faq.answer, cached: true });
      }
    }
    
    // LLM 호출 - 간결한 프롬프트
    const festivalContext = `
축제명: ${festivalData.name}
위치: ${festivalData.city}, ${festivalData.country}
기간: ${festivalData.start_date} - ${festivalData.end_date}
카테고리: ${festivalData.category || '정보 없음'}
가격: ${festivalData.price ? `₩${festivalData.price.toLocaleString()}` : '무료'}
${festivalData.summary ? `요약: ${festivalData.summary}` : ''}
${festivalData.description ? `설명: ${festivalData.description.substring(0, 500)}` : ''}
${festivalData.highlights && festivalData.highlights.length > 0 ? `하이라이트: ${festivalData.highlights.join(', ')}` : ''}
`.trim();
    
    const prompt = `당신은 축제 정보를 안내하는 친절한 도우미입니다. 아래 축제 정보를 바탕으로 사용자의 질문에 간결하고 명확하게 답변해주세요. 답변은 2-3문장 이내로 해주세요.

축제 정보:
${festivalContext}

사용자 질문: ${question}

답변:`;
    
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      model: "gemini_3_flash",
      add_context_from_internet: false,
    });
    
    return Response.json({ 
      answer: result,
      cached: false 
    });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    return Response.json({ 
      error: '죄송합니다. 답변을 생성하는 중 오류가 발생했습니다.',
      details: error.message 
    }, { status: 500 });
  }
});