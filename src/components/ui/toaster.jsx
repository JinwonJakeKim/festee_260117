import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  // 화면에 표시할 Toast는 항상 1개만 유지
  const [currentToast, setCurrentToast] = useState(null);

  // 자동 제거 타이머
  const timerRef = useRef(null);

  useEffect(() => {
    // 현재 열려 있는 Toast만 가져옴
    const openToasts = toasts.filter((toast) => toast.open);

    // Toast가 없다면 화면에서 제거
    if (openToasts.length === 0) {
      setCurrentToast(null);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      return;
    }

    // 가장 최근 Toast 하나만 사용
    const latestToast = openToasts[openToasts.length - 1];


    // 기존 타이머 제거
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // 새로운 Toast 하나만 표시
    setCurrentToast(latestToast);

    // duration 설정
    const duration =
      typeof latestToast.duration === "number"
        ? latestToast.duration
        : 2000;

    // duration 후 Toast 제거
    timerRef.current = setTimeout(() => {
      setCurrentToast(null);
      timerRef.current = null;
    }, duration);

    // cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toasts]);

  // 컴포넌트 종료 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // 표시할 Toast가 없으면 아무것도 렌더링하지 않음
  if (!currentToast) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "100px",
        left: "16px",
        right: "16px",

        // Android WebView에서 다른 UI보다 위에 표시
        zIndex: 999999,

        pointerEvents: "none",

        // WebView에서 색상 처리 강제
        color: "#111111",
        WebkitTextFillColor: "#111111",

        fontFamily:
          "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif",

        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          width: "100%",
          boxSizing: "border-box",

          // Toast 배경
          backgroundColor: "#ffffff",

          // 테두리
          border: "1px solid #e5e7eb",

          // 모서리
          borderRadius: "12px",

          // 내부 여백
          padding: "16px 18px",

          // 그림자
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",

          position: "relative",

          pointerEvents: "auto",

          // ★ Android WebView 텍스트 색상 강제
          color: "#111111",
          WebkitTextFillColor: "#111111",

          fontFamily:
            "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif",

          fontSize: "16px",
          lineHeight: "24px",

          opacity: 1,
          visibility: "visible",
          display: "block",

          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* 제목 */}
        {currentToast.title && (
          <div
            style={{
              display: "block",

              // 일반 CSS 색상
              color: "#111111",

              // ★ Android WebView 핵심
              WebkitTextFillColor: "#111111",

              fontFamily:
                "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif",

              fontSize: "16px",
              fontWeight: "700",
              lineHeight: "24px",

              margin: 0,
              padding: 0,

              opacity: 1,
              visibility: "visible",

              // 혹시 부모 스타일 영향을 받더라도 텍스트 색상 유지
              WebkitTextStroke: "0px transparent",
            }}
          >
            {String(currentToast.title)}
          </div>
        )}

        {/* 설명 */}
        {currentToast.description && (
          <div
            style={{
              display: "block",

              // 일반 CSS 색상
              color: "#333333",

              // ★ Android WebView 핵심
              WebkitTextFillColor: "#333333",

              fontFamily:
                "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif",

              fontSize: "14px",
              fontWeight: "400",
              lineHeight: "21px",

              marginTop: currentToast.title ? "4px" : "0",
              padding: 0,

              opacity: 1,
              visibility: "visible",

              WebkitTextStroke: "0px transparent",
            }}
          >
            {String(currentToast.description)}
          </div>
        )}
      </div>
    </div>
  );
}