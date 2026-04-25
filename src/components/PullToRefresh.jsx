import React, { useState, useRef, useCallback } from "react";

const PULL_THRESHOLD = 70; // px to trigger refresh

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(null);
  const isPullingRef = useRef(false);

  const handleTouchStart = useCallback((e) => {
    // 맨 위에서만 동작
    if (window.scrollY > 0) return;
    startYRef.current = e.touches[0].clientY;
    isPullingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isPullingRef.current || startYRef.current === null) return;
    if (window.scrollY > 0) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      // 당기는 거리에 저항값 적용 (자연스럽게)
      const resistance = 0.4;
      setPullDistance(Math.min(delta * resistance, PULL_THRESHOLD + 20));
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    if (pullDistance >= PULL_THRESHOLD * 0.4) {
      setIsRefreshing(true);
      setPullDistance(50);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  const showIndicator = pullDistance > 5 || isRefreshing;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: "relative" }}
    >
      {/* 당겨서 새로고침 인디케이터 */}
      <div
        style={{
          height: showIndicator ? `${isRefreshing ? 50 : pullDistance}px` : "0px",
          transition: isPullingRef.current ? "none" : "height 0.25s ease",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isRefreshing ? (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-400 text-xs">새로고침 중...</span>
          </div>
        ) : pullDistance > 5 ? (
          <div className="flex items-center gap-2">
            <div
              style={{
                transform: `rotate(${Math.min(pullDistance / (PULL_THRESHOLD * 0.4) * 180, 180)}deg)`,
                transition: "transform 0.1s ease",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <span className="text-cyan-400 text-xs">
              {pullDistance >= PULL_THRESHOLD * 0.4 ? "놓으면 새로고침" : "당겨서 새로고침"}
            </span>
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}