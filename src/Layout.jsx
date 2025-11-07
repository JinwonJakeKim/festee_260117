
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Map, Camera, Users, User } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();

  // 앱 로드 시 루트 경로면 홈 페이지로 강제 리다이렉트
  React.useEffect(() => {
    // 정확한 루트 경로 체크
    const isRootPath = location.pathname === '/' || 
                      location.pathname === '' || 
                      location.pathname === '/index.html';
    
    const homeUrl = createPageUrl("Home");
    
    if (isRootPath && location.pathname !== homeUrl) {
      console.log('🏠 Redirecting to Home from:', location.pathname);
      navigate(homeUrl, { replace: true });
    }
  }, [location.pathname, navigate]);

  // 추가: 페이지 이름이 없거나 잘못된 경우에도 홈으로
  React.useEffect(() => {
    if (!currentPageName || currentPageName === 'Index') {
      const homeUrl = createPageUrl("Home");
      if (location.pathname !== homeUrl) {
        console.log('🏠 Redirecting to Home - invalid page:', currentPageName);
        navigate(homeUrl, { replace: true });
      }
    }
  }, [currentPageName, location.pathname, navigate]);

  const isMessageDetail = currentPageName === "MessageDetail";

  const homeRelatedPages = [
    createPageUrl("Home"),
    createPageUrl("FestivalDetail"),
    createPageUrl("FestivalMore"),
    createPageUrl("Search"),
    createPageUrl("RankerDetail"),
    createPageUrl("FestivalVenueMap"),
    createPageUrl("PostDetail"),
    createPageUrl("GoTogetherDetail"),
  ];

  const communityRelatedPages = [
    createPageUrl("Community"),
    createPageUrl("CreatePost"),
  ];

  const catchRelatedPages = [
    createPageUrl("Catch"),
  ];

  const myRelatedPages = [
    createPageUrl("MyFestee"),
    createPageUrl("Settings"),
    createPageUrl("MyLikes"),
    createPageUrl("MyComments"),
    createPageUrl("MyRecommendations"),
    createPageUrl("SelectCity"),
  ];

  const navItems = [
    { 
      name: "홈", 
      icon: Home, 
      url: createPageUrl("Home"),
      relatedPages: homeRelatedPages
    },
    { 
      name: "지도", 
      icon: Map, 
      url: createPageUrl("FestivalMap"),
      relatedPages: [createPageUrl("FestivalMap")]
    },
    { 
      name: "캐치", 
      icon: Camera, 
      url: createPageUrl("Catch"),
      relatedPages: catchRelatedPages
    },
    { 
      name: "커뮤니티", 
      icon: Users, 
      url: createPageUrl("Community"),
      relatedPages: communityRelatedPages
    },
    { 
      name: "MY", 
      icon: User, 
      url: createPageUrl("MyFestee"),
      relatedPages: myRelatedPages
    }
  ];

  return (
    <div className="min-h-screen bg-black">
      
      <style>{`
        /* Festee 테마 색상 */
        :root {
          --neon-blue: #00d4ff;
          --neon-pink: #ff006e;
          --neon-purple: #8b5cf6;
        }
        
        /* 전체 페이지 배경 검정색 */
        * {
          scrollbar-width: thin;
          scrollbar-color: #333 #000;
        }
        
        *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        *::-webkit-scrollbar-track {
          background: #000;
        }
        
        *::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #fff !important;
        }

        #root {
          background: #000 !important;
          min-height: 100vh !important;
        }

        /* 로그인/인증 페이지 스타일링 - 최우선 순위 */
        body > div,
        body > main,
        body > section,
        [data-auth],
        [data-login],
        [class*="auth"],
        [class*="Auth"],
        [class*="login"],
        [class*="Login"],
        [class*="sign"],
        [class*="Sign"] {
          background: #000 !important;
          background-color: #000 !important;
        }

        /* base44 인증 페이지 컨테이너 */
        body > div:not(#root),
        body > div:not(#root) > *,
        main[class*="auth"],
        section[class*="auth"] {
          background: #000 !important;
          background-color: #000 !important;
        }

        /* 로그인 폼 컨테이너 */
        form,
        form > div,
        [role="form"],
        div[class*="form"],
        div[class*="Form"],
        div[class*="container"],
        div[class*="Container"],
        div[class*="wrapper"],
        div[class*="Wrapper"] {
          background: #1a1a1a !important;
          background-color: #1a1a1a !important;
          border: 1px solid #333 !important;
          border-radius: 16px !important;
        }

        /* 로그인 입력 필드 */
        input,
        input[type="email"],
        input[type="password"],
        input[type="text"] {
          background: #2a2a2a !important;
          background-color: #2a2a2a !important;
          border: 1px solid #444 !important;
          color: #fff !important;
          border-radius: 8px !important;
          padding: 12px !important;
        }

        input::placeholder {
          color: #888 !important;
        }

        input:focus {
          outline: 2px solid #00d4ff !important;
          outline-offset: 2px !important;
        }

        /* 로그인 버튼 */
        button[type="submit"],
        button[class*="submit"],
        button[class*="Submit"],
        a[class*="button"],
        a[class*="Button"] {
          background: linear-gradient(to right, #00d4ff, #ff006e) !important;
          background-color: #00d4ff !important;
          border: none !important;
          color: #fff !important;
          font-weight: bold !important;
          border-radius: 8px !important;
          padding: 12px 24px !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
        }

        button[type="submit"]:hover,
        button[class*="submit"]:hover {
          opacity: 0.9 !important;
          transform: translateY(-1px) !important;
        }

        /* 모든 텍스트 요소 */
        label,
        a,
        p,
        span,
        h1, h2, h3, h4, h5, h6,
        div {
          color: #fff !important;
        }

        /* 링크 */
        a {
          color: #00d4ff !important;
          text-decoration: none !important;
        }

        a:hover {
          color: #00b8e6 !important;
          text-decoration: underline !important;
        }

        /* 카드/패널 요소 */
        [class*="card"],
        [class*="Card"],
        [class*="panel"],
        [class*="Panel"] {
          background: #1a1a1a !important;
          border: 1px solid #333 !important;
          border-radius: 12px !important;
        }

        /* 에러 메시지 */
        [class*="error"],
        [class*="Error"],
        [role="alert"] {
          background: #2a1a1a !important;
          color: #ff6b6b !important;
          border: 1px solid #ff6b6b !important;
          border-radius: 8px !important;
          padding: 12px !important;
        }

        /* 로딩 스피너 */
        [class*="spinner"],
        [class*="Spinner"],
        [class*="loading"],
        [class*="Loading"] {
          border-color: #00d4ff !important;
        }

        /* ========== 날짜 선택 캘린더 스타일 - 최고 우선순위 ========== */
        
        /* 캘린더 기본 설정 */
        .rdp {
          --rdp-cell-size: 40px !important;
          --rdp-accent-color: #00d4ff !important;
          --rdp-background-color: #000 !important;
        }

        /* 캘린더 배경 */
        .rdp,
        .rdp-months,
        .rdp-month {
          background: #000 !important;
          background-color: #000 !important;
        }

        /* 모든 날짜 셀과 버튼 기본 스타일 - 흰색 텍스트 */
        .rdp-day,
        .rdp-cell {
          background: transparent !important;
        }

        .rdp-button_reset,
        .rdp-day button,
        .rdp button,
        button.rdp-button_reset {
          color: #fff !important;
          background: transparent !important;
          background-color: transparent !important;
        }

        /* 범위 시작 날짜 - 최고 우선순위 */
        .rdp-day_range_start,
        td.rdp-day_range_start,
        .rdp-cell.rdp-day_range_start,
        [class*="rdp-day_range_start"] {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
        }
        
        .rdp-day_range_start button,
        .rdp-day_range_start .rdp-button_reset,
        td.rdp-day_range_start button,
        button.rdp-day_range_start,
        .rdp-cell.rdp-day_range_start button,
        [class*="rdp-day_range_start"] button {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
          color: #000 !important;
          font-weight: bold !important;
        }

        /* 범위 종료 날짜 - 최고 우선순위 */
        .rdp-day_range_end,
        td.rdp-day_range_end,
        .rdp-cell.rdp-day_range_end,
        [class*="rdp-day_range_end"] {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
        }
        
        .rdp-day_range_end button,
        .rdp-day_range_end .rdp-button_reset,
        td.rdp-day_range_end button,
        button.rdp-day_range_end,
        .rdp-cell.rdp-day_range_end button,
        [class*="rdp-day_range_end"] button {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
          color: #000 !important;
          font-weight: bold !important;
        }

        /* 시작과 종료가 같은 날 */
        .rdp-day_range_start.rdp-day_range_end,
        td.rdp-day_range_start.rdp-day_range_end,
        .rdp-cell.rdp-day_range_start.rdp-day_range_end {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
        }

        .rdp-day_range_start.rdp-day_range_end button,
        td.rdp-day_range_start.rdp-day_range_end button,
        .rdp-cell.rdp-day_range_start.rdp-day_range_end button {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
          color: #000 !important;
          font-weight: bold !important;
        }

        /* 범위 내 날짜 - 가장 강력한 우선순위 */
        .rdp-day_range_middle,
        td.rdp-day_range_middle,
        .rdp-cell.rdp-day_range_middle,
        [class*="rdp-day_range_middle"],
        .rdp .rdp-day_range_middle {
          background: rgba(0, 212, 255, 0.25) !important;
          background-color: rgba(0, 212, 255, 0.25) !important;
        }
        
        .rdp-day_range_middle button,
        .rdp-day_range_middle .rdp-button_reset,
        td.rdp-day_range_middle button,
        button.rdp-day_range_middle,
        .rdp-cell.rdp-day_range_middle button,
        [class*="rdp-day_range_middle"] button,
        .rdp .rdp-day_range_middle button {
          background: rgba(0, 212, 255, 0.25) !important;
          background-color: rgba(0, 212, 255, 0.25) !important;
          color: #00d4ff !important;
          font-weight: 600 !important;
        }

        /* 선택된 날짜 일반 */
        .rdp-day_selected,
        td.rdp-day_selected,
        .rdp-cell.rdp-day_selected {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
        }

        .rdp-day_selected button,
        .rdp-day_selected .rdp-button_reset,
        td.rdp-day_selected button,
        button.rdp-day_selected,
        .rdp-cell.rdp-day_selected button {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
          color: #000 !important;
          font-weight: bold !important;
        }

        /* 오늘 날짜 */
        .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_range_start):not(.rdp-day_range_end):not(.rdp-day_range_middle) button {
          border: 2px solid #ff006e !important;
          color: #ff006e !important;
          font-weight: bold !important;
        }

        /* 선택된 오늘 날짜 */
        .rdp-day_today.rdp-day_selected button,
        .rdp-day_today.rdp-day_range_start button,
        .rdp-day_today.rdp-day_range_end button {
          background: #00d4ff !important;
          background-color: #00d4ff !important;
          color: #000 !important;
          border: 2px solid #ff006e !important;
        }

        /* 호버 효과 */
        .rdp-day:not(.rdp-day_selected):not(.rdp-day_disabled):not(.rdp-day_range_start):not(.rdp-day_range_end):not(.rdp-day_range_middle):hover {
          background: rgba(0, 212, 255, 0.1) !important;
          background-color: rgba(0, 212, 255, 0.1) !important;
        }

        .rdp-day:not(.rdp-day_selected):not(.rdp-day_disabled):not(.rdp-day_range_start):not(.rdp-day_range_end):not(.rdp-day_range_middle):hover button {
          background: rgba(0, 212, 255, 0.3) !important;
          background-color: rgba(0, 212, 255, 0.3) !important;
          color: #fff !important;
        }

        /* 비활성 날짜 */
        .rdp-day_disabled,
        .rdp-day_disabled button,
        td.rdp-day_disabled button {
          color: #555 !important;
          opacity: 0.5 !important;
        }

        /* 캘린더 헤더 */
        .rdp-caption,
        .rdp-caption_label {
          color: #fff !important;
        }

        /* 요일 헤더 */
        .rdp-head_cell {
          color: #888 !important;
        }

        /* 월/년도 네비게이션 버튼 */
        .rdp-nav_button {
          color: #00d4ff !important;
        }

        .rdp-nav_button:hover {
          background-color: #2a2a2a !important;
        }

        /* 외부 달 날짜 (이전/다음 달) */
        .rdp-day_outside {
          color: #555 !important;
        }
      `}</style>
      
      <main className={isMessageDetail ? "h-screen overflow-hidden" : "pb-20 min-h-screen"}>
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-50 safe-area-inset-bottom">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex justify-around items-center h-16 px-2">
            {navItems.map((item) => {
              const isActive = item.relatedPages.some(page => 
                location.pathname === page || location.pathname.startsWith(page)
              );
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.name}
                  to={item.url}
                  className="flex flex-col items-center justify-center gap-1 flex-1 transition-all duration-300"
                >
                  <Icon 
                    className={`w-6 h-6 transition-all duration-300 ${
                      isActive 
                        ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,212,255,0.8)]' 
                        : 'text-gray-500'
                    }`}
                  />
                  <span className={`text-xs font-medium ${
                    isActive ? 'text-cyan-400' : 'text-gray-500'
                  }`}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
