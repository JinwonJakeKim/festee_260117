import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

/**
 * 비로그인 사용자용 Catch History Hero
 * CatchHistoryCardStack과 동일한 높이(400px), 배경, 카드 스택 구조를 사용하되
 * 실제 Catch 기록 대신 로그인 유도 메시지와 CTA를 표시합니다.
 */
export default function CatchHistoryGuestHero({ onLogin, loginMessage, loginLabel }) {
  const TOTAL_SLOTS = 6;
  const cardWidth = 150;
  const offsetStep = 44;
  const offsetYStep = 8;
  const scaleStep = 0.10;

  const stackItems = Array.from({ length: TOTAL_SLOTS }, (_, i) => ({
    id: `guest-blank-${i}`,
  }));

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '400px' }}>
      <style>{`
        .catch-stack-ctx,
        .catch-stack-ctx span,
        .catch-stack-ctx p,
        .catch-stack-ctx div,
        .catch-stack-ctx a {
          color: #000 !important;
        }
        .festee-logo span:nth-child(1) { color: #7b3dff !important; }
        .festee-logo span:nth-child(2) { color: #4285f4 !important; }
        .festee-logo span:nth-child(3) { color: #34a853 !important; }
        .festee-logo span:nth-child(4) { color: #fbbc05 !important; }
        .festee-logo span:nth-child(5) { color: #ea4335 !important; }
        .festee-logo span:nth-child(6) { color: #d93025 !important; }
      `}</style>

      {/* 배경 - CatchHistoryCardStack과 동일 */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #2a241e 0%, #1a1612 45%, #0d0a08 100%)' }}>
        {[...Array(20)].map((_, i) => (
          <div
            key={`bokeh-${i}`}
            className="absolute rounded-full blur-2xl"
            style={{
              width: `${18 + (i * 17) % 40}px`,
              height: `${18 + (i * 17) % 40}px`,
              background: '#f7d685',
              left: `${(i * 31) % 100}%`,
              top: `${(i * 47) % 100}%`,
              opacity: 0.06 + ((i * 11) % 14) / 100,
            }}
          />
        ))}
        <div className="absolute top-0 left-0 right-0 z-10" style={{ height: '50px' }}>
          <svg className="absolute top-0 w-full" style={{ height: '40px' }} preserveAspectRatio="none" viewBox="0 0 100 40">
            <path d="M0,6 Q25,26 50,18 T100,10" stroke="rgba(140,120,90,0.35)" strokeWidth="0.5" fill="none" />
          </svg>
          {[...Array(9)].map((_, i) => {
            const ratio = i / 8;
            const sag = Math.sin(ratio * Math.PI) * 14;
            return (
              <div
                key={`light-${i}`}
                className="absolute"
                style={{
                  left: `${ratio * 100}%`,
                  top: `${6 + sag}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: '6px',
                    height: '6px',
                    background: '#f7d685',
                    boxShadow: '0 0 5px 2px rgba(247, 214, 133, 0.8), 0 0 10px 4px rgba(247, 214, 133, 0.3)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 카드 스택 - 모두 blank */}
      <div className="relative h-full">
        {stackItems.map((item, index) => {
          const offsetX = index * offsetStep;
          const offsetY = index * offsetYStep;
          const scale = 1 - index * scaleStep;
          const zIndex = stackItems.length - index;
          return (
            <div
              key={item.id}
              className="absolute top-1/2"
              style={{
                left: '24px',
                transform: `translateX(${offsetX}px) translateY(calc(-50% + ${offsetY}px)) scale(${scale})`,
                zIndex,
                width: `${cardWidth}px`,
                transformOrigin: 'left center',
              }}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
              >
                <div className="catch-stack-ctx rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#EADCC9', opacity: 0.45 }}>
                  <div className="h-11 flex items-center justify-center">
                    {index === 0 && (
                      <span className="text-base font-black tracking-[0.2em] text-black">
                        CATCH
                      </span>
                    )}
                  </div>
                  <div className="px-3 pb-3">
                    <div className="rounded-lg bg-gray-400/30" style={{ aspectRatio: '1/1' }} />
                  </div>
                  <div className="px-4 pb-3">
                    <div className="h-4 bg-gray-500/30 rounded mb-1.5" />
                    <div className="h-3 bg-gray-500/20 rounded w-2/3" />
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* 중앙 로그인 유도 메시지 + CTA */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center px-4">
        <p className="text-white text-base font-bold text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mb-4">
          {loginMessage}
        </p>
        <Button
          onClick={onLogin}
          className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold border-none px-6"
        >
          {loginLabel}
        </Button>
      </div>

      {/* 우측 하단 카운트 */}
      <div className="absolute bottom-5 right-5 text-right z-50">
        <p className="text-white/90 text-xs font-medium tracking-wide">Catch</p>
        <p className="text-white text-4xl font-black leading-none mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">0</p>
      </div>

      {/* 좌측 하단 미니멀 워터마크 */}
      <div className="absolute bottom-5 left-5 z-50">
        <p className="text-[9px] tracking-[0.12em] font-medium text-white/70 leading-none">
          세상의 모든 축제를 한 곳에서
        </p>
        <p className="festee-logo text-lg font-black tracking-[0.15em] leading-none mt-1">
          <span>F</span>
          <span>E</span>
          <span>S</span>
          <span>T</span>
          <span>E</span>
          <span>E</span>
        </p>
      </div>
    </div>
  );
}