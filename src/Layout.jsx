import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Map, Target, Users, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useSafeAreaInsets from "@/hooks/useSafeAreaInsets";

// 페이지 전환 애니메이션 variants
const isDetailPage = (pathname) => {
  const detailPages = ['/FestivalDetail', '/FestivalMore', '/Search', '/RankerDetail', '/FestivalVenueMap', '/PostDetail', '/GoTogetherDetail'];
  return detailPages.some(p => pathname.includes(p));
};

const getPageVariants = (pathname) => {
  if (isDetailPage(pathname)) {
    return {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
    };
  }
  return {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 1 },
  };
};

const splashShown = { value: false };

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = React.useState(!splashShown.value);

  // 스플래시 화면 타이머 - 앱 최초 진입 시 1회만 표시
  React.useEffect(() => {
    if (!splashShown.value) {
      splashShown.value = true;
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);



  const insets = useSafeAreaInsets();
  const isMessageDetail = currentPageName === "MessageDetail";

  const tabGroups = {
    home: [
      createPageUrl("Home"),
      createPageUrl("FestivalDetail"),
      createPageUrl("FestivalMore"),
      createPageUrl("Search"),
      createPageUrl("RankerDetail"),
      createPageUrl("FestivalVenueMap"),
      createPageUrl("PostDetail"),
      createPageUrl("GoTogetherDetail"),
    ],
    map: [createPageUrl("FestivalMap")],
    catch: [createPageUrl("Catch"), createPageUrl("NearbyCatch")],
    community: [createPageUrl("Community"), createPageUrl("CreatePost")],
    my: [
      createPageUrl("MyFestee"),
      createPageUrl("Settings"),
      createPageUrl("MyLikes"),
      createPageUrl("MyComments"),
      createPageUrl("MyRecommendations"),
      createPageUrl("SelectCity"),
    ],
    admin: [
      createPageUrl("AdminDashboard"),
      createPageUrl("AdminTourAPI"),
      createPageUrl("AdminEventbrite"),
      createPageUrl("AdminAdForm"),
      createPageUrl("AdminFestivalExtract"),
      createPageUrl("AdminFestivalForm"),
    ],
  };

  // 현재 URL이 속한 탭 키 찾기
  const getCurrentTabKey = (pathname) => {
    for (const [key, pages] of Object.entries(tabGroups)) {
      if (pages.some(p => pathname === p || pathname.startsWith(p + "/"))) {
        return key;
      }
    }
    return null;
  };

  // 탭 클릭 핸들러: 각 탭은 항상 최상위 페이지로 이동
  const handleTabClick = (e, tabKey, defaultUrl) => {
    e.preventDefault();
    navigate(defaultUrl);
  };

  const navItems = [
    { key: "home", name: "홈", icon: Home, url: createPageUrl("Home") },
    { key: "map", name: "지도", icon: Map, url: createPageUrl("FestivalMap") },
    { key: "catch", name: "캐치", icon: Target, url: createPageUrl("Catch") },
    { key: "community", name: "커뮤니티", icon: Users, url: createPageUrl("Community") },
    { key: "my", name: "MY", icon: User, url: createPageUrl("MyFestee") },
  ];

  const currentTabKey = getCurrentTabKey(location.pathname);

  const pageVariants = getPageVariants(location.pathname);

  return (
    <div className="min-h-screen bg-black">
      {/* Splash Screen */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
          >
            {/* 파티클 효과 배경 */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    background: ['#00C846', '#78D800', '#FFD000', '#FF9500', '#FF4400', '#FF0070', '#9000FF', '#0088FF'][i % 8],
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    y: [0, -30, 0],
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}
            </div>

            {/* 로고 및 텍스트 */}
            <div className="relative z-10 text-center px-8">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <motion.h1
                  className="text-7xl font-black mb-4"
                  style={{
                    background: 'linear-gradient(90deg, #00C846 0%, #78D800 15%, #FFD000 30%, #FF9500 45%, #FF4400 60%, #FF0070 75%, #9000FF 88%, #0088FF 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  FESTEE
                </motion.h1>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="h-8"
              >
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-gray-400 text-sm font-medium"
                >
                  세상의 모든 축제를 한 곳에서
                </motion.p>
              </motion.div>

              {/* 로딩 점 애니메이션 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex justify-center gap-2 mt-8"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{ background: ['#FF9500', '#00C8AF', '#2060FF'][i] }}
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        /* Festee 테마 색상 */
        :root {
          --neon-blue: #00d4ff;
          --neon-pink: #ff006e;
          --neon-purple: #8b5cf6;
        }
        
        /* 전체 페이지 배경 검정색 */
        * {
          scrollbar-width: none;
          scrollbar-color: #333 #000;
        }
        
        *::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        
        html, body {
          background: #000 !important;
          margin: 0 !important;
          padding: 0 !important;
          color: #fff !important;
          overscroll-behavior-y: none !important;
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
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
          text-decoration: none !important;
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
        .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_disabled):not(.rdp-day_range_start):not(.rdp-day_range_end):not(.rdp-day_range_middle) button {
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
      
      <div className="relative overflow-hidden">
        <main
          className={isMessageDetail ? "overflow-hidden" : "min-h-screen"}
          style={isMessageDetail
            ? { height: '100vh', paddingTop: `${insets.top}px` }
            : { paddingTop: `${insets.top}px`, paddingBottom: `calc(4rem + ${insets.bottom}px)` }
          }
        >
          <div className="max-w-[640px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-[9998]"
        style={{
          paddingBottom: `${insets.bottom}px`,
          paddingLeft: `${insets.left}px`,
          paddingRight: `${insets.right}px`,
        }}
      >
        <div className="max-w-[640px] mx-auto">
          <div className="flex justify-around items-center h-16 px-2">
            {navItems.map((item) => {
              const isActive = currentTabKey === item.key;
              const Icon = item.icon;
              
              return (
                <a
                  key={item.key}
                  href={item.url}
                  onClick={(e) => handleTabClick(e, item.key, item.url)}
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
                </a>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}