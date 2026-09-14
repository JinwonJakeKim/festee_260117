import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import FestivalListItem from "@/components/FestivalListItem";

// 모바일: 현재 5개 카드 + 오른쪽에 다음 순위 숫자가 살짝 보이도록 페이지 너비를 줄임
const CHART_PREVIEW_WIDTH = 64;
const CHART_PAGE_GAP_DESKTOP = 16;
const CHART_PAGE_GAP_MOBILE = 8;

export default function FestivalRankingChart({
  filteredFestivals,
  myLikes,
  onLike,
  getLocalizedContent,
  language,
  t,
  onResetFilters,
}) {
  const chartWrapperRef = useRef(null);
  const [chartPageWidth, setChartPageWidth] = useState(Math.min(window.innerWidth, 896));

  useEffect(() => {
    const updateChartWidth = () => {
      if (chartWrapperRef.current) {
        setChartPageWidth(chartWrapperRef.current.clientWidth);
      }
    };
    const raf = requestAnimationFrame(updateChartWidth);
    window.addEventListener('resize', updateChartWidth);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateChartWidth);
    };
  }, []);

  const isDesktopChart = chartPageWidth > 680;
  const pageWidth = isDesktopChart
    ? Math.round(chartPageWidth * 0.8)
    : Math.max(chartPageWidth - CHART_PREVIEW_WIDTH, 240);
  const pageGap = isDesktopChart ? CHART_PAGE_GAP_DESKTOP : CHART_PAGE_GAP_MOBILE;

  const scrollByPage = (direction) => {
    const el = chartWrapperRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * (pageWidth + pageGap), behavior: 'smooth' });
  };

  const pageCount = Math.max(1, Math.ceil(filteredFestivals.length / 5));

  return (
    <div className="relative group">
      <div
        className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        ref={chartWrapperRef}
      >
        <div className="flex" style={{ width: 'max-content' }}>
          {Array.from({ length: pageCount }).map((_, pageIdx) => (
            <div
              key={pageIdx}
              className="flex snap-start"
              style={{
                width: pageWidth,
                paddingRight: `${pageGap}px`,
                flexShrink: 0,
              }}
            >
              {/* 현재 페이지 아이템 */}
              <div className="space-y-1 flex-1 min-w-0">
                {filteredFestivals.slice(pageIdx * 5, pageIdx * 5 + 5).map((festival, i) => (
                  <FestivalListItem
                    key={festival.id}
                    festival={festival}
                    index={pageIdx * 5 + i}
                    isLiked={myLikes.some(like => like.festival_id === festival.id)}
                    onLike={onLike}
                    getLocalizedContent={getLocalizedContent}
                    language={language}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 데스크톱 호버 시 좌우 네비게이션 화살표 */}
      <button
        onClick={() => scrollByPage(-1)}
        className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white text-black items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-105"
        aria-label="이전 순위"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={() => scrollByPage(1)}
        className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white text-black items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-105"
        aria-label="다음 순위"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {filteredFestivals.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-2">{t.noFestivalsMatch}</p>
          <Button
            onClick={onResetFilters}
            variant="outline"
            className="bg-gray-900 text-white border-gray-800 hover:bg-gray-800"
          >
            {t.resetFilters}
          </Button>
        </div>
      )}
    </div>
  );
}