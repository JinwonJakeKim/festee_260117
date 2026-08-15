import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useLanguage } from "@/lib/useLanguage";

export default function CatchHistoryCardStack({ catches, festivals, catchCount, emptyMessage }) {
  const { getLocalizedContent } = useLanguage();
  const TOTAL_SLOTS = 6;
  const realCatches = catches.slice(0, TOTAL_SLOTS);
  const blankCount = TOTAL_SLOTS - realCatches.length;
  const hasNoCatches = realCatches.length === 0;

  const festivalMap = React.useMemo(() => {
    const map = new Map();
    festivals.forEach(f => map.set(f.id, f));
    return map;
  }, [festivals]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return `${d.getMonth() + 1}.${d.getDate()}`;
  };

  const formatDateRange = (festival) => {
    if (!festival?.start_date) return "";
    const start = formatDate(festival.start_date);
    const end = festival.end_date ? formatDate(festival.end_date) : "";
    return end ? `${start}-${end}` : start;
  };

  // 실제 캐치 + 백지 카드 조합
  const stackItems = [
    ...realCatches.map(c => ({ type: 'real', id: c.id, data: c })),
    ...Array.from({ length: blankCount }, (_, i) => ({ type: 'blank', id: `blank-${i}`, data: null })),
  ];

  const cardWidth = 150;
  const offsetStep = 32;
  const offsetYStep = 6;
  const scaleStep = 0.08;

  // 새 캐치 추가 감지
  const prevFrontIdRef = React.useRef(null);
  const [isNewCard, setIsNewCard] = React.useState(false);

  React.useEffect(() => {
    const frontId = catches[0]?.id;
    if (frontId !== prevFrontIdRef.current) {
      if (prevFrontIdRef.current !== null && frontId) {
        setIsNewCard(true);
        const timer = setTimeout(() => setIsNewCard(false), 700);
        prevFrontIdRef.current = frontId;
        return () => clearTimeout(timer);
      }
      prevFrontIdRef.current = frontId;
    }
  }, [catches]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '400px' }}>
      {/* 축제 분위기 배경 - 전구 줄 + 보케 */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #2a241e 0%, #1a1612 45%, #0d0a08 100%)' }}>
        {/* 보케 효과 */}
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
        {/* 상단 전구 줄 (festoon lights) */}
        <div className="absolute top-0 left-0 right-0 z-10" style={{ height: '50px' }}>
          <svg className="absolute top-0 w-full" style={{ height: '40px' }} preserveAspectRatio="none" viewBox="0 0 100 40">
            <path d="M0,6 Q25,26 50,18 T100,10" stroke="rgba(140,120,90,0.35)" strokeWidth="0.5" fill="none" />
          </svg>
          {[...Array(9)].map((_, i) => {
            const t = i / 8;
            const sag = Math.sin(t * Math.PI) * 14;
            return (
              <div
                key={`light-${i}`}
                className="absolute"
                style={{
                  left: `${t * 100}%`,
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

      {/* 카드 스택 */}
      <div className="relative h-full">
        {stackItems.map((item, index) => {
          const offsetX = index * offsetStep;
          const offsetY = index * offsetYStep;
          const scale = 1 - index * scaleStep;
          const zIndex = stackItems.length - index;
          const isBlank = item.type === 'blank';
          const catchItem = item.data;
          const festival = catchItem ? festivalMap.get(catchItem.festival_id) : null;
          const festivalName = festival ? getLocalizedContent(festival, 'name') : (catchItem?.festival_name || '');
          const dateRange = formatDateRange(festival);

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
                transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <motion.div
                initial={
                  isNewCard && index === 0 && !isBlank
                    ? { opacity: 0, y: -80, scale: 0.5, rotateZ: -10 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0, scale: 1, rotateZ: 0 }}
                transition={
                  isNewCard && index === 0 && !isBlank
                    ? { duration: 0.6, type: "spring", stiffness: 200, damping: 14 }
                    : { delay: index * 0.08, duration: 0.4 }
                }
              >
                {isBlank ? (
                  <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#EADCC9', opacity: 0.45 }}>
                    <div className="text-center pt-3 pb-2">
                      <span className="text-base font-black tracking-[0.2em]" style={{ color: '#1A2A40' }}>
                        CATCH
                      </span>
                    </div>
                    <div className="px-3 pb-3">
                      <div className="rounded-lg aspect-[3/4] bg-gray-400/30" />
                    </div>
                    <div className="px-4 pb-3">
                      <div className="h-4 bg-gray-500/30 rounded mb-1.5" />
                      <div className="h-3 bg-gray-500/20 rounded w-2/3" />
                    </div>
                  </div>
                ) : (
                  <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)}>
                    <div id={index === 0 ? 'catch-front-card' : undefined} className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#EADCC9' }}>
                      <div className="text-center pt-3 pb-2">
                        <span className="text-base font-black tracking-[0.2em]" style={{ color: '#1A2A40' }}>
                          CATCH
                        </span>
                      </div>
                      <div className="px-3 pb-3">
                        <div className="rounded-lg overflow-hidden aspect-[3/4]">
                          <img
                            src={catchItem.image_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
                            alt={catchItem.festival_name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="px-4 pb-3">
                        <p className="font-bold text-black text-sm line-clamp-1">{festivalName || catchItem.festival_name}</p>
                        <p className="text-black text-xs mt-0.5">{dateRange}</p>
                      </div>
                    </div>
                  </Link>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* 빈 상태 메시지 */}
      {hasNoCatches && emptyMessage && (
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-50 flex justify-center pointer-events-none px-4">
          <p className="text-white text-base font-bold text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {emptyMessage}
          </p>
        </div>
      )}

      {/* 우측 하단 카운트 */}
      <div className="absolute bottom-5 right-5 text-right z-50">
        <p className="text-white/80 text-xs font-medium tracking-wide">FESTEE Catch</p>
        <p className="text-white text-4xl font-black leading-none mt-1">{catchCount}</p>
      </div>
    </div>
  );
}