import React, { useState } from "react";

// Festee 기본 플레이스홀더 (기존 CatchHistoryCardStack에서 쓰던 값과 동일)
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800';

// http:// 로 저장된 오래된 이미지 URL은 https 페이지에서 mixed-content로 차단되므로 https로 승격
const toHttps = (url) => (url && url.startsWith('http://')) ? url.replace('http://', 'https://') : url;

/**
 * Catch History 카드용 이미지.
 * 우선순위: Catch 시점 snapshot(image_url) → 연결된 현재 Festival의 대표 이미지 → Festee 플레이스홀더
 * 실제 <img> 로딩이 실패(onError)하면 다음 순위로 안전하게 전환하며, 마지막 단계 이후에는 더 이상 전환하지 않아 무한 루프를 방지한다.
 */
export default function CatchCardImage({ catchImageUrl, festivalThumbnailUrl, alt, className }) {
  const candidates = [toHttps(catchImageUrl), toHttps(festivalThumbnailUrl), PLACEHOLDER_IMAGE].filter(Boolean);
  const [step, setStep] = useState(0);
  const safeStep = Math.min(step, candidates.length - 1);

  const handleError = () => {
    if (safeStep < candidates.length - 1) {
      setStep(safeStep + 1);
    }
  };

  return (
    <img
      src={candidates[safeStep]}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}