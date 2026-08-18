import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

const EXIT_TIMEOUT = 2000;

export default function BackButtonExitHandler() {
  const location = useLocation();
  const { toast } = useToast();
  const backPressedOnce = useRef(false);
  const timeoutRef = useRef(null);

  const isHomePage =
    location.pathname === "/" || location.pathname === "/Home";

  useEffect(() => {
    if (!isHomePage) {
      backPressedOnce.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // 더미 히스토리 상태를 푸시하여 뒤로가기 버튼 인터셉트
    window.history.pushState({ exitGuard: true }, "");

    const handlePopState = () => {
      if (!backPressedOnce.current) {
        // 첫 번째 뒤로가기 - 토스트 표시 후 다시 가드 상태 푸시
        backPressedOnce.current = true;
        window.history.pushState({ exitGuard: true }, "");

        toast({
          title: "앱 종료",
          description: "뒤로 버튼을 한 번 더 누르면 앱이 종료됩니다.",
          duration: EXIT_TIMEOUT,
        });

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          backPressedOnce.current = false;
        }, EXIT_TIMEOUT);
      } else {
        // 두 번째 뒤로가기 - 앱 종료
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (typeof navigator.app?.exitApp === "function") {
          navigator.app.exitApp();
        } else if (window.Capacitor?.exitApp) {
          window.Capacitor.exitApp();
        } else {
          // 웹 fallback: 더 이상 뒤로 갈 곳이 없으면 webview가 종료됨
          window.history.back();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isHomePage, toast]);

  return null;
}