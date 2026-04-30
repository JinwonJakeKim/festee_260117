import React, { useEffect, useCallback, useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Map, Target, Users, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TabNavigationProvider, TAB_ROUTES, getTabForPath } from "./lib/TabNavigationContext";
import TabNavigationContext from "./lib/TabNavigationContext";

const splashShown = { value: false };

function LayoutInner({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = React.useState(!splashShown.value);

  const ctx = React.useContext(TabNavigationContext);

  // 스플래시 화면 타이머
  React.useEffect(() => {
    if (!splashShown.value) {
      splashShown.value = true;
      const timer = setTimeout(() => setShowSplash(false), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // 경로 변경 감지 → 탭 스택 업데이트
  useEffect(() => {
    ctx?.pushToStack(location.pathname);
  }, [location.pathname, ctx]);

  const currentTab = getTabForPath(location.pathname) || "home";

  // 탭 클릭 핸들러
  const handleTabClick = useCallback((e, tabKey) => {
    e.preventDefault();

    if (tabKey === currentTab) {
      // 같은 탭 클릭 시 루트로 리셋
      ctx?.resetTabStack(tabKey);
      navigate(TAB_ROUTES[tabKey].root, { replace: true });
    } else {
      // 다른 탭으로 전환: 해당 탭의 마지막 경로로 이동
      // replace: true → 브라우저 히스토리를 오염시키지 않음
      const targetPath = ctx?.getLastTabPath(tabKey) || TAB_ROUTES[tabKey].root;
      navigate(targetPath, { replace: true });
    }
  }, [currentTab, navigate, ctx]);

  const isMessageDetail = currentPageName === "MessageDetail";

  const navItems = [
    { key: "home", name: "홈", icon: Home },
    { key: "map", name: "지도", icon: Map },
    { key: "catch", name: "캐치", icon: Target },
    { key: "community", name: "커뮤니티", icon: Users },
    { key: "my", name: "MY", icon: User },
  ];

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
                  animate={{ y: [0, -30, 0], opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
                />
              ))}
            </div>
            <div className="relative z-10 text-center px-8">
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}>
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
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="h-8">
                <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-gray-400 text-sm font-medium">
                  세상의 모든 축제를 한 곳에서
                </motion.p>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex justify-center gap-2 mt-8">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{ background: ['#FF9500', '#00C8AF', '#2060FF'][i] }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        :root { --neon-blue: #00d4ff; --neon-pink: #ff006e; --neon-purple: #8b5cf6; }
        * { scrollbar-width: none; scrollbar-color: #333 #000; }
        *::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        html, body {
          background: #000 !important; margin: 0 !important; padding: 0 !important;
          color: #fff !important; overscroll-behavior-y: none !important;
          -webkit-user-select: none !important; -moz-user-select: none !important;
          user-select: none !important; -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        #root { background: #000 !important; min-height: 100vh !important; }
        input, textarea, [contenteditable="true"] {
          -webkit-user-select: text !important; user-select: text !important;
        }
        /* 캘린더 스타일 */
        .rdp { --rdp-cell-size: 40px !important; --rdp-accent-color: #00d4ff !important; --rdp-background-color: #000 !important; }
        .rdp, .rdp-months, .rdp-month { background: #000 !important; }
        .rdp-button_reset, .rdp-day button, .rdp button { color: #fff !important; background: transparent !important; }
        .rdp-day_range_start button, td.rdp-day_range_start button { background: #00d4ff !important; color: #000 !important; font-weight: bold !important; }
        .rdp-day_range_end button, td.rdp-day_range_end button { background: #00d4ff !important; color: #000 !important; font-weight: bold !important; }
        .rdp-day_range_middle button, td.rdp-day_range_middle button { background: rgba(0, 212, 255, 0.25) !important; color: #00d4ff !important; }
        .rdp-day_selected button { background: #00d4ff !important; color: #000 !important; font-weight: bold !important; }
        .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_disabled):not(.rdp-day_range_start):not(.rdp-day_range_end):not(.rdp-day_range_middle) button { border: 2px solid #ff006e !important; color: #ff006e !important; }
        .rdp-caption_label { color: #fff !important; }
        .rdp-head_cell { color: #888 !important; }
        .rdp-nav_button { color: #00d4ff !important; }
        .rdp-day_outside { color: #555 !important; }
      `}</style>

      <div className="relative overflow-hidden">
        <main
          className={isMessageDetail ? "overflow-hidden" : "min-h-screen"}
          style={isMessageDetail
            ? { height: '100vh', paddingTop: 'env(safe-area-inset-top)' }
            : { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }
          }
        >
          {children}
        </main>
      </div>

      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-[9998]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="max-w-screen-xl mx-auto">
          <div className="flex justify-around items-center h-16 px-2">
            {navItems.map((item) => {
              const isActive = currentTab === item.key;
              const Icon = item.icon;
              return (
                <a
                  key={item.key}
                  href={TAB_ROUTES[item.key].root}
                  onClick={(e) => handleTabClick(e, item.key)}
                  className="flex flex-col items-center justify-center gap-1 flex-1 transition-all duration-300"
                >
                  <Icon className={`w-6 h-6 transition-all duration-300 ${isActive ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,212,255,0.8)]' : 'text-gray-500'}`} />
                  <span className={`text-xs font-medium ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>{item.name}</span>
                </a>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <TabNavigationProvider>
      <LayoutInner currentPageName={currentPageName}>
        {children}
      </LayoutInner>
    </TabNavigationProvider>
  );
}