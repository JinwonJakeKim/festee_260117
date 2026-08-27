import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Search, MessageCircle, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 안전한 날짜 포맷팅 함수
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

export default function Messages() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  // 로그인 체크
  useEffect(() => {
    if (!isLoading && !user) {
      alert('로그인이 필요한 페이지입니다');
      base44.auth.redirectToLogin(window.location.pathname);
    }
  }, [user, isLoading, navigate]);

  const { data: messages } = useQuery({
    queryKey: ['messages', user?.email],
    queryFn: async () => {
      if (!user) return [];
      const sent = await base44.entities.Message.filter({ sender_email: user.email });
      const received = await base44.entities.Message.filter({ receiver_email: user.email });
      return [...sent, ...received].sort((a, b) => 
        new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
    },
    enabled: !!user,
    initialData: [],
  });

  // 전체 유저 목록 조회 (admin만 가능)
  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      try {
        return await base44.entities.User.list();
      } catch (error) {
        // 일반 유저는 User.list()를 호출할 수 없으므로 빈 배열 반환
        return [];
      }
    },
    initialData: [],
  });

  // 대화 목록 생성 (각 사용자와의 마지막 메시지만 표시)
  const conversations = useMemo(() => {
    if (!user) return [];

    const convMap = new Map();

    messages.forEach(msg => {
      const otherUserEmail = msg.sender_email === user.email ? msg.receiver_email : msg.sender_email;
      const otherUserName = msg.sender_email === user.email ? msg.receiver_name : msg.sender_name;
      const otherUserImage = msg.sender_email === user.email ? msg.receiver_profile_image : msg.sender_profile_image;

      // Ensure that a user doesn't have a conversation with themselves
      if (otherUserEmail === user.email) return;

      if (!convMap.has(otherUserEmail)) {
        const unreadCount = messages.filter(m => 
          m.sender_email === otherUserEmail && 
          m.receiver_email === user.email && 
          !m.is_read
        ).length;

        convMap.set(otherUserEmail, {
          email: otherUserEmail,
          name: otherUserName,
          profileImage: otherUserImage,
          lastMessage: msg.content,
          lastMessageDate: msg.created_date,
          unreadCount,
          isLastMessageMine: msg.sender_email === user.email,
          hasConversation: true,
        });
      }
    });

    return Array.from(convMap.values()).sort((a, b) => 
      new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime()
    );
  }, [messages, user]);

  // 검색된 유저 목록 (자기 자신 제외)
  const searchedUsers = useMemo(() => {
    if (!searchQuery.trim() || !user) return [];
    
    return allUsers
      .filter(u => 
        u.email !== user.email && 
        (u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         u.nickname?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .map(u => ({
        email: u.email,
        name: u.nickname || u.full_name,
        profileImage: u.profile_image,
        hasConversation: conversations.some(conv => conv.email === u.email),
      }));
  }, [searchQuery, allUsers, user, conversations]);

  // 검색 중일 때는 검색 결과, 아니면 기존 대화 표시
  const displayList = searchQuery.trim() ? searchedUsers : conversations;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">로그인이 필요합니다</p>
          <Button 
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            로그인하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">메시지</h1>
        </div>

        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="사용자 이름으로 검색..."
            className="bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* User List */}
      <div className="px-4 py-4">
        {displayList.length > 0 ? (
          <div className="space-y-3"> {/* Changed from space-y-2 to space-y-3 */}
            {displayList.map((item) => {              
              return (
                <Link
                  key={item.email}
                  to={createPageUrl(`MessageDetail?user=${item.email}&name=${encodeURIComponent(item.name)}&image=${encodeURIComponent(item.profileImage || '')}`)}
                >
                  <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4">
                    <div className="flex items-start gap-3"> {/* Changed from items-center to items-start */}
                      {item.profileImage ? (
                        <img
                          src={item.profileImage}
                          alt={item.name}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                          {item.name[0]}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-white">{item.name}</span> {/* Changed h3 to span */}
                          {item.hasConversation && item.lastMessageDate && (
                            <span className="text-xs text-gray-500">
                              {safeFormatDate(item.lastMessageDate, 'M.d HH:mm')} {/* Applied safeFormatDate */}
                            </span>
                          )}
                        </div>
                        
                        {item.hasConversation && item.lastMessage ? (
                          <div className="flex items-center justify-between">
                            <p className={`text-sm truncate ${item.unreadCount > 0 && !item.isLastMessageMine ? 'text-white font-medium' : 'text-gray-400'}`}>
                              {item.isLastMessageMine && <span className="text-cyan-400 mr-1">나:</span>}
                              {item.lastMessage}
                            </p>
                            {item.unreadCount > 0 && (
                              <Badge className="bg-cyan-500 text-white ml-2 min-w-[20px] h-5 flex items-center justify-center rounded-full">
                                {item.unreadCount}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">
                            {searchQuery.trim() ? '메시지 보내기' : '대화 시작하기'}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            {searchQuery.trim() ? (
              <>
                <User className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">
                  "{searchQuery}" 검색 결과가 없습니다
                </p>
                <p className="text-gray-600 text-sm">
                  다른 이름으로 검색해보세요
                </p>
              </>
            ) : (
              <>
                <MessageCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">
                  아직 메시지가 없습니다
                </p>
                <p className="text-gray-600 text-sm">
                  다른 사용자를 검색하여 대화를 시작해보세요!
                </p>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}