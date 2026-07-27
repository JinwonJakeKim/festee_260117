import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { MessageCircle, Bell, Globe } from "lucide-react";
import { useLanguage } from "@/lib/useLanguage";

// 검색창 우측 액션 아이콘 (메시지/알림/언어설정)
// 모바일: 검색창 옆, 데스크톱: 상단 헤더 우측
export default function HomeHeaderActions({ variant = "mobile" }) {
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { language, changeLanguage } = useLanguage();
  const isDesktop = variant === "desktop";

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ['unreadMessagesCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      const messages = await base44.entities.Message.filter({
        receiver_email: user.email,
        is_read: false,
      });
      return messages.length;
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  const { data: unreadNotificationsCount = 0 } = useQuery({
    queryKey: ['unreadNotificationsCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      const allNotifications = await base44.entities.Notification.filter({
        user_email: user.email,
      }, '-created_date');
      const unreadNotifs = allNotifications.filter(n => !n.is_read);
      return unreadNotifs.length;
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  const btnClass = isDesktop
    ? "w-9 h-9 rounded-full hover:bg-white/[0.06]"
    : "w-10 h-10 rounded-full bg-gray-900";
  const iconClass = isDesktop ? "w-[18px] h-[18px] text-gray-400" : "w-5 h-5 text-gray-400";

  return (
    <div className="flex items-center gap-1">
      <Link to={createPageUrl("Messages")} className="flex-shrink-0">
        <button className={`flex items-center justify-center relative transition-colors ${btnClass}`}>
          <MessageCircle className={iconClass} />
          {unreadMessagesCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-pink-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
              {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
            </span>
          )}
        </button>
      </Link>
      <Link to={createPageUrl("Notifications")} className="flex-shrink-0">
        <button className={`flex items-center justify-center relative transition-colors ${btnClass}`}>
          <Bell className={iconClass} />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-cyan-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
              {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </Link>
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowLangMenu(!showLangMenu)}
          className={`flex items-center justify-center transition-colors ${btnClass}`}
        >
          <Globe className={iconClass} />
        </button>
        {showLangMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />
            <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[100px]">
              {[
                { code: 'ko', label: '한국어' },
                { code: 'en', label: 'English' },
                { code: 'ja', label: '日本語' },
                { code: 'zh', label: '中文' },
              ].map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => { changeLanguage(code); setShowLangMenu(false); }}
                  className={`w-full px-4 py-3 text-sm text-left transition-colors ${
                    language === code
                      ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}