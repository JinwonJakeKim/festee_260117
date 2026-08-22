import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { useToast } from "@/components/ui/use-toast";

const EXIT_TIMEOUT = 2000;

export default function BackButtonExitHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const toastRef = useRef(toast);
  const backPressedOnce = useRef(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const isHomePage =
    location.pathname === "/" || location.pathname === "/Home";

  useEffect(() => {
    let listener;

    const setupBackButtonListener = async () => {
      listener = await App.addListener("backButton", ({ canGoBack }) => {
        // 홈 화면이 아니면 일반적인 뒤로가기
        if (!isHomePage) {
          backPressedOnce.current = false;

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          if (canGoBack) {
            navigate(-1);
          } else {
            navigate("/");
          }

          return;
        }

        // 홈 화면에서 첫 번째 뒤로가기
        if (!backPressedOnce.current) {
          backPressedOnce.current = true;

          toastRef.current({
            title: "앱 종료",
            description: "뒤로 버튼을 한 번 더 누르면 앱이 종료됩니다.",
            duration: EXIT_TIMEOUT,
          });

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          timeoutRef.current = setTimeout(() => {
            backPressedOnce.current = false;
            timeoutRef.current = null;
          }, EXIT_TIMEOUT);

          return;
        }

        // 홈 화면에서 두 번째 뒤로가기
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        backPressedOnce.current = false;

        App.exitApp();
      });
    };

    setupBackButtonListener();

    return () => {
      if (listener) {
        listener.remove();
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isHomePage, navigate]);

  return null;
}