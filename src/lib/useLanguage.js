import { useState } from 'react';

const LANG_KEY = 'festee_language';

export function useLanguage() {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) || 'ko';
    } catch {
      return 'ko';
    }
  });

  const changeLanguage = (lang) => {
    setLanguage(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  };

  return { language, changeLanguage };
}