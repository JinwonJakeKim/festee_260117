import { useState, useEffect } from 'react';

const LANG_KEY = 'festee_language';

const isEmpty = (v) => !v || (typeof v === 'string' && v.trim() === '');

export function useLanguage() {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) || 'ko';
    } catch {
      return 'ko';
    }
  });

  // 다른 컴포넌트에서 언어를 변경할 때 감지 (같은 탭 내 커스텀 이벤트)
  useEffect(() => {
    const handleLangChange = (e) => {
      setLanguage(e.detail || localStorage.getItem(LANG_KEY) || 'ko');
    };
    window.addEventListener('festee_lang_change', handleLangChange);
    return () => window.removeEventListener('festee_lang_change', handleLangChange);
  }, []);

  const changeLanguage = (lang) => {
    setLanguage(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
    // 같은 탭의 다른 컴포넌트에 언어 변경 알림
    window.dispatchEvent(new CustomEvent('festee_lang_change', { detail: lang }));
  };

  // 언어 코드를 festival 필드 suffix로 변환 (ja -> jp)
  const langToSuffix = (lang) => {
    if (lang === 'ja') return 'jp';
    return lang; // ko, en, zh 그대로
  };

  const getLocalizedContent = (festival, field, fallback = '') => {
    if (!festival) return fallback;

    const suffix = langToSuffix(language);

    // 배열 필드 처리
    if (field === 'highlights' || Array.isArray(festival[`${field}_ko`])) {
      const candidates = [
        festival[`${field}_${suffix}`],
        festival[`${field}_original`],
        festival[`${field}_ko`],
        festival[`${field}_en`],
        festival[field],
      ];
      for (const c of candidates) {
        if (c && Array.isArray(c) && c.length > 0) return c;
      }
      return [];
    }

    // 문자열 필드 처리
    const primary = festival[`${field}_${suffix}`];
    if (!isEmpty(primary)) return primary;

    const original = festival[`${field}_original`];
    if (!isEmpty(original)) return original;

    // 폴백 순서: ko -> en -> 필드 자체
    const ko = festival[`${field}_ko`];
    if (!isEmpty(ko)) return ko;

    const en = festival[`${field}_en`];
    if (!isEmpty(en)) return en;

    return festival[field] || fallback;
  };

  return { language, changeLanguage, getLocalizedContent };
}