import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, ChevronRight, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useLanguage } from "@/lib/useLanguage";

const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return '날짜 미정';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '날짜 미정';
    return format(date, formatString, { locale: ko });
  } catch (e) {
    return '날짜 미정';
  }
};

const formatDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return '날짜 미정';
  if (startDate && endDate) {
    return `${safeFormatDate(startDate, 'yyyy.MM.dd')} - ${safeFormatDate(endDate, 'MM.dd')}`;
  }
  return safeFormatDate(startDate || endDate, 'yyyy.MM.dd');
};

const QUICK_QUESTIONS = [
  "3월에 한국 축제 추천해줘",
  "일본 벚꽃 축제 언제야?",
  "무료 축제 있어?",
  "가족과 가기 좋은 축제는?",
];

export default function HomeChatbot({ festivals = [] }) {
  const STORAGE_KEY = "festee_home_chatbot_messages";
  const DEFAULT_MESSAGE = {
    role: "assistant",
    content: "안녕하세요! Festee AI 도우미입니다 🎉\n\nFestee에 있는 모든 축제 정보를 알고 있고, 날짜·위치·카테고리 기반으로 딱 맞는 축제를 추천해드려요.\n\n어떤 축제가 궁금하신가요?",
  };

  const { language } = useLanguage();

  // 사용자 정보 및 좋아요한 축제 조회
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: myLikes = [] } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const loadMessages = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [DEFAULT_MESSAGE];
    } catch {
      return [DEFAULT_MESSAGE];
    }
  };

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(loadMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const handleSend = async (text) => {
    const userMessage = (text || input).trim();
    if (!userMessage || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // 모든 축제의 핵심 필드 전송 (최대 120개)
      const festivalSummaries = festivals.slice(0, 120).map(f => ({
        id: f.id,
        name_ko: f.name_ko,
        name_en: f.name_en,
        name_original: f.name_original,
        country: f.country,
        city: f.city,
        city_ko: f.city_ko,
        category: f.category,
        start_date: f.start_date,
        end_date: f.end_date,
        price: f.price,
        tags_ko: f.tags_ko,
        summary_ko: f.summary_ko,
        likes_count: f.likes_count,
        popularity: f.popularity,
        star_rating: f.star_rating,
        thumbnail_url: f.thumbnail_url,
        date_status: f.date_status,
      }));

      // 사용자가 좋아요한 축제 ID 목록
      const likedFestivalIds = myLikes.map(like => like.festival_id);

      const response = await base44.functions.invoke("homeChatbot", {
        question: userMessage,
        festivals: festivalSummaries,
        conversationHistory: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content
        })),
        userLanguage: language,
        likedFestivalIds,
      });

      const data = response.data;

      if (data.error === 'rate_limit_exceeded') {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message, error: true },
        ]);
        setUsageInfo({ usedCount: data.usedCount, dailyLimit: data.dailyLimit, isAdmin: false });
        return;
      }

      // 사용량 정보 업데이트
      if (data.dailyLimit !== undefined) {
        setUsageInfo({ usedCount: data.usedCount, dailyLimit: data.dailyLimit, isAdmin: data.isAdmin });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          recommendedFestivals: data.recommendedFestivals || [],
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "죄송합니다. 잠시 후 다시 시도해주세요.",
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <AnimatePresence>
        {!isOpen && (
          <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-1">
            <span className="text-gray-400 text-xs font-medium">AI 추천</span>
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => setIsOpen(true)}
              className="w-14 h-14 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all relative"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="w-6 h-6 text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 rounded-full animate-pulse" />
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* 챗봇 창 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 right-4 z-50 w-[calc(100%-2rem)] max-w-md bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 flex flex-col"
            style={{ height: "560px", maxHeight: "calc(100vh - 160px)" }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">Festee AI</h3>
                  <p className="text-cyan-400 text-xs">축제 추천 · 정보 검색</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* 사용량 표시 */}
                {usageInfo && !usageInfo.isAdmin && usageInfo.dailyLimit && (
                  <div className="flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1">
                    <span className="text-xs text-gray-400">오늘</span>
                    <span className={`text-xs font-bold ${usageInfo.usedCount >= usageInfo.dailyLimit ? 'text-red-400' : 'text-cyan-400'}`}>
                      {usageInfo.usedCount}/{usageInfo.dailyLimit}
                    </span>
                    <span className="text-xs text-gray-400">회</span>
                  </div>
                )}
                {usageInfo?.isAdmin && (
                  <div className="bg-purple-900/50 border border-purple-500/30 rounded-full px-2 py-0.5">
                    <span className="text-purple-400 text-xs font-bold">무제한</span>
                  </div>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="flex flex-col gap-2 max-w-[90%]">
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${
                        message.role === "user"
                          ? "bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
                          : message.error
                          ? "bg-red-900/30 text-red-200 border border-red-500/30"
                          : "bg-gray-800 text-gray-200"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </div>

                    {/* 추천 축제 카드 */}
                    {message.recommendedFestivals?.length > 0 && (
                      <div className="space-y-2 mt-1">
                        <p className="text-gray-500 text-xs px-1">🎪 추천 축제 · 탭해서 자세히 보기</p>
                        {message.recommendedFestivals.map((f) => (
                          <Link
                            key={f.id}
                            to={createPageUrl(`FestivalDetail?id=${f.id}`)}
                            onClick={() => setIsOpen(false)}
                            className="block"
                          >
                            <div className="flex items-center py-2.5 pr-3 rounded-2xl bg-gray-900/70 hover:bg-gray-900 border border-gray-800 hover:border-cyan-500/40 transition-all active:scale-[0.98]">
                              <div className="flex-shrink-0 ml-2.5">
                                {f.thumbnail_url ? (
                                  <img
                                    src={f.thumbnail_url}
                                    alt={f.name}
                                    className="w-14 h-14 rounded-xl object-cover"
                                    onError={(e) => { e.target.style.display='none'; }}
                                  />
                                ) : (
                                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                                    <span className="text-xl">🎉</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 ml-3">
                                <h3 className="text-white font-bold text-sm truncate mb-1">{f.name}</h3>
                                <div className="text-gray-400 text-xs flex items-center gap-1 mb-0.5">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{f.country ? `${f.country}, ` : ''}{f.city}{f.category ? ` / ${f.category}` : ''}</span>
                                </div>
                                <div className="text-gray-500 text-xs flex items-center gap-1">
                                  <Calendar className="w-3 h-3 flex-shrink-0" />
                                  <span>{formatDateRange(f.start_date, f.end_date)}</span>
                                </div>
                              </div>
                              <div className="flex-shrink-0 pr-1">
                                <ChevronRight className="w-5 h-5 text-gray-600" />
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-gray-400 text-xs">검색 중...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 빠른 질문 (첫 메시지만) */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="flex-shrink-0 text-xs bg-gray-800 text-cyan-400 border border-cyan-400/30 rounded-full px-3 py-1.5 hover:bg-cyan-900/30 transition-colors whitespace-nowrap"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* 입력창 */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50 rounded-b-2xl">
              {/* 사용량 바 */}
              {usageInfo && !usageInfo.isAdmin && usageInfo.dailyLimit && (
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">무료 사용량</span>
                    <span className={`text-xs font-medium ${usageInfo.usedCount >= usageInfo.dailyLimit ? 'text-red-400' : 'text-gray-400'}`}>
                      {usageInfo.dailyLimit - usageInfo.usedCount}회 남음
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        usageInfo.usedCount >= usageInfo.dailyLimit
                          ? 'bg-red-500'
                          : usageInfo.usedCount >= usageInfo.dailyLimit - 1
                          ? 'bg-yellow-500'
                          : 'bg-gradient-to-r from-cyan-500 to-purple-500'
                      }`}
                      style={{ width: `${Math.min((usageInfo.usedCount / usageInfo.dailyLimit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="축제 추천 받기, 정보 질문..."
                  className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none min-h-[44px] max-h-[100px] text-sm"
                  rows={1}
                  disabled={isLoading}
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading || (usageInfo && !usageInfo.isAdmin && usageInfo.usedCount >= usageInfo.dailyLimit)}
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 h-11 w-11 p-0 flex-shrink-0"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}