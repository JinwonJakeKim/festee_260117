import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const QUICK_QUESTIONS = [
  "3월에 한국 축제 추천해줘",
  "일본 벚꽃 축제 언제야?",
  "무료 축제 있어?",
  "가족과 가기 좋은 축제는?",
];

export default function HomeChatbot({ festivals = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "안녕하세요! Festee AI 도우미입니다 🎉\n\nFestee에 있는 모든 축제 정보를 알고 있고, 날짜·위치·카테고리 기반으로 딱 맞는 축제를 추천해드려요.\n\n어떤 축제가 궁금하신가요?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text) => {
    const userMessage = (text || input).trim();
    if (!userMessage || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // 관련 축제만 필터링해서 보내기 (최대 80개, 핵심 필드만)
      const festivalSummaries = festivals.slice(0, 80).map(f => ({
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
      }));

      const response = await base44.functions.invoke("homeChatbot", {
        question: userMessage,
        festivals: festivalSummaries,
        conversationHistory: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content
        })),
      });

      const data = response.data;
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
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
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
                      <div className="space-y-2">
                        {message.recommendedFestivals.map((f) => (
                          <Link
                            key={f.id}
                            to={createPageUrl(`FestivalDetail?id=${f.id}`)}
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="bg-gray-800/80 border border-gray-700 hover:border-cyan-400/50 rounded-xl p-3 flex items-center gap-3 transition-all">
                              {f.thumbnail_url && (
                                <img src={f.thumbnail_url} alt={f.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" onError={(e) => e.target.style.display='none'} />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-bold truncate">{f.name}</p>
                                <p className="text-gray-400 text-xs truncate">{f.city} · {f.date}</p>
                              </div>
                              <span className="text-cyan-400 text-xs">→</span>
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
                  disabled={!input.trim() || isLoading}
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