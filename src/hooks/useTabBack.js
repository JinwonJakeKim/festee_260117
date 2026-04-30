/**
 * useTabBack
 * 
 * 탭 내에서 뒤로가기를 처리하는 훅.
 * 브라우저 history.back() 대신 window.dispatchEvent로 popstate를 트리거해
 * Layout.jsx의 탭 스택 기반 뒤로가기 로직이 동작하도록 합니다.
 * 
 * 사용법:
 *   const goBack = useTabBack();
 *   <button onClick={goBack}>뒤로</button>
 */
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

const TAB_ROOTS = [
  createPageUrl("Home"),
  createPageUrl("FestivalMap"),
  createPageUrl("Catch"),
  createPageUrl("Community"),
  createPageUrl("MyFestee"),
];

export default function useTabBack(fallbackPath) {
  const navigate = useNavigate();
  const location = useLocation();

  const goBack = () => {
    // popstate 이벤트를 발생시켜 Layout의 탭 스택 뒤로가기 로직을 트리거
    // (실제 history.back()을 쓰면 브라우저 히스토리 기반으로 동작해 탭이 섞임)
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  };

  return goBack;
}