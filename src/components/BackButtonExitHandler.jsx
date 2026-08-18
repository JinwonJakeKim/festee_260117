import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";

const EXIT_TIMEOUT = 2000;
const GUARD_HASH = "#exit-guard";

export default function BackButtonExitHandler() {
  const location = useLocation();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  const backPressedOnce = useRef(false);
  const timeoutRef = useRef(null);
  const handlingRef = useRef(false);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const isHomePage =
    location.pathname === "/" || location.pathname === "/Home";

  useEffect(() => {
    if (!isHomePage) {
      backPressedOnce.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // 홈이 아닌 경우 해시 제거 (replaceState로 뒤로가기 히스토리 남기지 않음)
      if (window.location.hash === GUARD_HASH) {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, "", cleanUrl);
      }
      return;
    }

    // 가드 상태 설정: 해시를 포함한 URL로 pushState
    // 해시 기반은 WebView에서 pushState만 사용할 때보다 popstate/hashchange 발생률이 높음
    const guardUrl = window.location.pathname + window.location.search + GUARD_HASH;
    window.history.pushState({ exitGuard: true }, "", guardUrl);

    const handleBack = () => {
      // popstate + hashchange 중복 실행 방지
      if (handlingRef.current) return;
      handlingRef.current = true;
      setTimeout(() => { handlingRef.current = false; }, 300);

      if (!backPressedOnce.current) {
        // 첫 번째 뒤로가기 - 토스트 표시 후 가드 재설정
        backPressedOnce.current = true;
        const reGuardUrl = window.location.pathname + window.location.search + GUARD_HASH;
        window.history.pushState({ exitGuard: true }, "", reGuardUrl);

        toastRef.current({
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
        backPressedOnce.current = false;

        if (typeof navigator.app?.exitApp === "function") {
          navigator.app.exitApp();
        } else if (window.Capacitor?.exitApp) {
          window.Capacitor.exitApp();
        } else {
          // WebView fallback: 가드 상태를 지우고 뒤로가기
          // WebView에 더 이상 history가 없으면 native onBackPressed가 앱 종료
          window.history.go(-1);
        }
      }
    };

    // popstate (표준 History API) + hashchange (WebView 백업)
    const handlePopState = () => handleBack();
    const handleHashChange = () => {
      // 해시가 제거된 경우만 = 뒤로가기 버튼 눌림
      if (window.location.hash !== GUARD_HASH) {
        handleBack();
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleHashChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isHomePage]);

  return null;
}