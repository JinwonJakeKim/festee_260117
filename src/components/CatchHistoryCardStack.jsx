import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CatchHistoryCardStack({ catches, festivals, catchCount, emptyMessage }) {
  const TOTAL_SLOTS = 7;
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

  const cardWidth = 190;
  const offsetStep = 36;
  const offsetYStep = -16;
  const scaleStep = 0.05;

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '400px' }}>
      {/* 보케 배경 */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-black to-gray-900">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full blur-2xl"
            style={{
              width: `${30 + (i * 13) % 50}px`,
              height: `${30 + (i * 13) % 50}px`,
              background: i % 3 === 0 ? '#FFA500' : i % 3 === 1 ? '#FFD700' : '#FF8C00',
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              opacity: 0.15 + ((i * 7) % 20) / 100,
            }}
          />
        ))}
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
              }}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
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
                    <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#EADCC9' }}>
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
                        <p className="font-bold text-black text-sm line-clamp-1">{catchItem.festival_name}</p>
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