import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Google Translate API를 사용하여 텍스트를 번역하는 공통 함수
// 월 500,000자 무료 한도 관리 포함

const MONTHLY_CHAR_LIMIT = 500000;
const API_NAME = 'google_translate_api';

async function getMonthlyUsage(base44) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allLogs = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: API_NAME });
  const monthLogs = allLogs.filter(log => log.date && log.date.startsWith(currentMonth));
  return monthLogs.reduce((sum, log) => sum + (log.count || 0), 0);
}

async function incrementUsage(base44, charCount) {
  const today = new Date().toISOString().split('T')[0];
  const logs = await base44.asServiceRole.entities.ApiUsageLog.filter({ api_name: API_NAME, date: today });
  if (logs.length === 0) {
    await base44.asServiceRole.entities.ApiUsageLog.create({
      api_name: API_NAME,
      date: today,
      count: charCount,
      limit: MONTHLY_CHAR_LIMIT
    });
  } else {
    await base44.asServiceRole.entities.ApiUsageLog.update(logs[0].id, {
      count: logs[0].count + charCount
    });
  }
}

async function translateText(text, targetLang, apiKey) {
  if (!text || text.trim() === '') return '';
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang, format: 'text' })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Translate API error (${response.status}): ${err}`);
  }
  const data = await response.json();
  return data.data?.translations?.[0]?.translatedText || text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { texts, targetLanguages } = await req.json();
    // texts: { fieldName: string } 또는 { fieldName: string[] }
    // targetLanguages: ['ko', 'en', 'ja', 'zh-CN'] (Google 언어 코드)

    const apiKey = Deno.env.get('GOOGLE_TRANSLATE_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, error: 'GOOGLE_TRANSLATE_API_KEY not set' }, { status: 500 });
    }

    // 월 사용량 체크
    const monthlyUsage = await getMonthlyUsage(base44);
    // 총 번역 문자 수 계산
    const totalChars = Object.values(texts).reduce((sum, t) => {
      if (Array.isArray(t)) return sum + t.join(' ').length;
      return sum + (t?.length || 0);
    }, 0) * targetLanguages.length;

    if (monthlyUsage + totalChars > MONTHLY_CHAR_LIMIT) {
      return Response.json({
        success: false,
        error: 'GOOGLE_TRANSLATE_MONTHLY_LIMIT_REACHED',
        message: `Google Translate API 월 ${MONTHLY_CHAR_LIMIT.toLocaleString()}자 무료 한도를 초과했습니다. (${monthlyUsage.toLocaleString()}자 사용)`
      }, { status: 429 });
    }

    // 언어 코드 매핑 (Google API 코드 → 앱 내부 코드)
    const langMap = { 'ko': 'ko', 'en': 'en', 'ja': 'jp', 'zh-CN': 'zh' };

    const results = {};
    let usedChars = 0;

    for (const [fieldName, textValue] of Object.entries(texts)) {
      results[fieldName] = {};
      for (const targetLang of targetLanguages) {
        const appLangKey = langMap[targetLang] || targetLang;
        if (Array.isArray(textValue)) {
          // 배열 번역 (highlights, tags 등)
          const translated = [];
          for (const item of textValue) {
            if (item && item.trim()) {
              const result = await translateText(item, targetLang, apiKey);
              translated.push(result);
              usedChars += item.length;
            }
          }
          results[fieldName][appLangKey] = translated;
        } else {
          // 단일 텍스트 번역
          if (textValue && textValue.trim()) {
            results[fieldName][appLangKey] = await translateText(textValue, targetLang, apiKey);
            usedChars += textValue.length;
          } else {
            results[fieldName][appLangKey] = textValue || '';
          }
        }
      }
    }

    // 사용량 기록
    if (usedChars > 0) {
      await incrementUsage(base44, usedChars).catch(e => console.error('[Translate] Usage log error:', e.message));
    }

    return Response.json({ success: true, results, usedChars });

  } catch (error) {
    console.error('[GoogleTranslate] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});