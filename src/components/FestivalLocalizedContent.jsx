import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

/**
 * 축제 정보를 사용자의 선호 언어로 표시하는 헬퍼 컴포넌트
 * @param {Object} festival - 축제 객체
 * @param {string} field - 표시할 필드명 (name, summary, description, highlights 등)
 * @param {string} fallback - 필드가 없을 때 대체 텍스트
 */
export const useFestivalLocalizedContent = () => {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const getLocalizedContent = (festival, field, fallback = '') => {
    if (!festival) return fallback;

    // 사용자의 선호 언어 결정
    let preferredLang = 'ko'; // 기본값은 한국어

    if (user?.preferred_language) {
      preferredLang = user.preferred_language;
    } else if (user?.home_country && user.home_country !== '대한민국') {
      preferredLang = 'en';
    }

    // 필드명에 따라 적절한 다국어 필드 선택
    let localizedField;
    
    // 배열 필드 처리 (highlights, restrictions, recommendations 등)
    if (Array.isArray(festival[field])) {
      if (preferredLang === 'ko') {
        localizedField = festival[`${field}_ko`];
        // 빈 배열이거나 없으면 다음으로 폴백
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_original`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_en`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[field];
        }
      } else if (preferredLang === 'en') {
        localizedField = festival[`${field}_en`];
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_original`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_ko`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[field];
        }
      } else {
        localizedField = festival[`${field}_original`];
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_ko`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[`${field}_en`];
        }
        if (!localizedField || localizedField.length === 0) {
          localizedField = festival[field];
        }
      }
      return localizedField || [];
    }
    
    // 문자열 필드 처리
    if (preferredLang === 'ko') {
      localizedField = festival[`${field}_ko`];
      // 빈 문자열이거나 없으면 다음으로 폴백
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_original`];
      }
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_en`];
      }
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_original`];
      }
    } else if (preferredLang === 'en') {
      localizedField = festival[`${field}_en`];
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_original`];
      }
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_ko`];
      }
    } else {
      localizedField = festival[`${field}_original`];
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_en`];
      }
      if (!localizedField || localizedField.trim() === '') {
        localizedField = festival[`${field}_ko`];
      }
    }

    return localizedField || fallback;
  };

  return { getLocalizedContent, userLanguage: user?.preferred_language || 'ko' };
};

// 간편 사용을 위한 컴포넌트
export default function FestivalLocalizedContent({ festival, field, fallback = '', className = '' }) {
  const { getLocalizedContent } = useFestivalLocalizedContent();
  const content = getLocalizedContent(festival, field, fallback);

  if (Array.isArray(content)) {
    return (
      <div className={className}>
        {content.map((item, idx) => (
          <div key={idx}>{item}</div>
        ))}
      </div>
    );
  }

  return <span className={className}>{content}</span>;
}