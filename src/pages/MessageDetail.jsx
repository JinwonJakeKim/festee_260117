import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Send, Home, Map, Camera, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    console.error("Error formatting date:", e); // Log error for debugging
    return '날짜 미정';
  }
};

export default function MessageDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const [messageText, setMessageText] = useState("");
  
  const urlParams = new URLSearchParams(window.location.search);
  const otherUserEmail = urlParams.get('user');
  const otherUserName = urlParams.get('name');
  const otherUserImage = urlParams.get('image');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: messages, refetch } = useQuery({
    queryKey: ['conversation', user?.email, otherUserEmail],
    queryFn: async () => {
      if (!user || !otherUserEmail) return [];
      
      const sent = await base44.entities.Message.filter({ 
        sender_email: user.email, 
        receiver_email: otherUserEmail 
      });
      const received = await base44.entities.Message.filter({ 
        sender_email: otherUserEmail, 
        receiver_email: user.email 
      });
      
      return [...sent, ...received].sort((a, b) => 
        new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
      );
    },
    enabled: !!user && !!otherUserEmail,
    initialData: [],
  });

  // Combine and group messages by date for display
  const groupedMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [];

    const groups = [];
    let currentGroup = null;

    messages.forEach((message) => {
      // Use safeFormatDate to get the date string for grouping (e.g., '2023-10-27')
      const messageDate = safeFormatDate(message.created_date, 'yyyy-MM-dd');

      if (!currentGroup || currentGroup.date !== messageDate) {
        // Start a new group if date changes or it's the first message
        currentGroup = {
          date: messageDate,
          messages: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(message);
    });
    return groups;
  }, [messages]);

  // 읽음 처리
  useEffect(() => {
    if (!user || !otherUserEmail || !messages) return;

    const unreadMessages = messages.filter(m => 
      m.sender_email === otherUserEmail && 
      m.receiver_email === user.email && 
      !m.is_read
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => {
        try {
          await base44.entities.Message.update(msg.id, { is_read: true });
        } catch (error) {
          console.error(`Failed to mark message ${msg.id} as read:`, error);
        }
      });
      // Invalidate relevant queries to update UI for read status and unread count
      queryClient.invalidateQueries({ queryKey: ['conversation', user?.email, otherUserEmail] });
      queryClient.invalidateQueries({ queryKey: ['messages'] }); 
      queryClient.invalidateQueries({ queryKey: ['unreadMessagesCount'] });
    }
  }, [messages, user, otherUserEmail, queryClient]); // Added queryClient to dependencies

  // 자동 스크롤 (최신 메시지로)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 주기적 메시지 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 3000);

    return () => clearInterval(interval);
  }, [refetch]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content) => {
      console.log('=== 메시지 전송 시작 ===');
      console.log('발신자:', user.email, user.full_name);
      console.log('수신자:', otherUserEmail, otherUserName);
      console.log('내용:', content);
      
      // 1. 메시지 생성
      const senderName = user.nickname || user.full_name;
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: senderName,
        sender_profile_image: user.profile_image,
        receiver_email: otherUserEmail,
        receiver_name: otherUserName,
        receiver_profile_image: otherUserImage,
        content,
        conversation_id: [user.email, otherUserEmail].sort().join('_'),
      });
      console.log('✓ 메시지 생성 완료');

      // 2. 수신자의 알림 설정 확인
      try {
        const receiverUsers = await base44.entities.User.filter({ email: otherUserEmail });
        console.log('수신자 정보 조회:', receiverUsers);
        
        const receiver = receiverUsers && receiverUsers.length > 0 ? receiverUsers[0] : null;
        const receiverSettings = receiver?.notification_settings || {};
        
        console.log('수신자 알림 설정:', receiverSettings);
        console.log('new_message 설정:', receiverSettings.new_message);
        
        // 3. 알림 생성 (기본값 true)
        if (receiverSettings.new_message !== false) {
          const notificationData = {
            user_email: otherUserEmail,
            type: 'new_message',
            title: '새 메시지',
            content: `${user.nickname || user.full_name}님이 메시지를 보냈습니다: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
            sender_email: user.email,
            sender_name: user.nickname || user.full_name,
            sender_profile_image: user.profile_image || '',
            link_url: createPageUrl(`MessageDetail?user=${user.email}&name=${encodeURIComponent(user.nickname || user.full_name)}&image=${encodeURIComponent(user.profile_image || '')}`),
          };
          
          console.log('알림 생성 데이터:', notificationData);
          
          const createdNotification = await base44.entities.Notification.create(notificationData);
          console.log('✓ 알림 생성 완료:', createdNotification);
        } else {
          console.log('⚠ 수신자가 메시지 알림을 비활성화함');
        }
      } catch (error) {
        console.error('✗ 알림 생성 실패:', error);
        console.error('에러 상세:', error.message, error.stack);
      }
      
      console.log('=== 메시지 전송 완료 ===');
    },
    onSuccess: () => {
      console.log('메시지 전송 성공, 입력창 초기화');
      setMessageText("");
      // Invalidate specific conversation query to force refetch and update UI
      queryClient.invalidateQueries({ queryKey: ['conversation', user?.email, otherUserEmail] });
      queryClient.invalidateQueries({ queryKey: ['messages'] }); // Invalidate general messages list
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
    },
  });

  const handleSend = () => {
    if (messageText.trim()) {
      console.log('전송 버튼 클릭, 메시지:', messageText);
      sendMessageMutation.mutate(messageText);
    }
  };

  // Show loading spinner if user or otherUserEmail is not yet available
  if (!user || !otherUserEmail) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // Navigation items for the bottom bar
  const navItems = [
    { name: "홈", icon: Home, url: createPageUrl("Home") },
    { name: "지도", icon: Map, url: createPageUrl("FestivalMap") },
    { name: "캐치", icon: Camera, url: createPageUrl("Catch") },
    { name: "커뮤니티", icon: Users, url: createPageUrl("Community") },
    { name: "MY", icon: User, url: createPageUrl("MyFestee") }
  ];

  return (
    <div className="h-screen bg-black flex flex-col">
      {/* 1. Header - 최상단 고정 (높이: 56px) */}
      <div className="h-14 flex-shrink-0 bg-black border-b border-gray-800 px-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        
        <div className="flex items-center gap-3 flex-1">
          {otherUserImage ? (
            <img
              src={otherUserImage}
              alt={otherUserName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
              {otherUserName?.[0] || 'U'}
            </div>
          )}
          <div>
            <h2 className="text-white font-bold">{otherUserName}</h2>
            <p className="text-gray-500 text-xs">온라인</p>
          </div>
        </div>
      </div>

      {/* 2. Messages - 중간 스크롤 영역 (Header와 Input+Nav 사이 공간) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-black">
        {groupedMessages.length > 0 ? (
          <div className="space-y-4 pb-4">
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-6">
                <div className="text-center my-4">
                  <span className="text-xs text-gray-500 bg-gray-900 px-3 py-1 rounded-full">
                    {safeFormatDate(group.date, 'M월 d일 (EEE)')}
                  </span>
                </div>
                
                {group.messages.map((message, msgIndex) => {
                  const isMyMessage = message.sender_email === user?.email;
                  // showTime is true if it's the last message in the group OR
                  // if the next message is from a different sender, creating a block effect.
                  const showTime = msgIndex === group.messages.length - 1 || 
                                   group.messages[msgIndex + 1].sender_email !== message.sender_email;

                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 mb-2 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {!isMyMessage && (
                        otherUserImage ? (
                          <img
                            src={otherUserImage}
                            alt={otherUserName}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {otherUserName?.[0] || 'U'}
                          </div>
                        )
                      )}
                      
                      <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                        <div className={`px-4 py-2 rounded-2xl ${
                          isMyMessage 
                            ? 'bg-cyan-500 text-white' 
                            : 'bg-gray-800 text-white'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                        {showTime && (
                          <span className={`text-xs text-gray-500 mt-1 ${isMyMessage ? 'mr-1' : 'ml-1'}`}>
                            {safeFormatDate(message.created_date, 'HH:mm')}
                            {isMyMessage && message.is_read && <span className="ml-1 text-cyan-400">읽음</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">대화를 시작해보세요!</p>
          </div>
        )}
      </div>

      {/* 3. Input - 하단 고정 (높이: 68px) */}
      <div className="h-17 flex-shrink-0 bg-black border-t border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-gray-900 border-gray-800 text-white rounded-full h-11"
          />
          <Button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isLoading}
            className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 rounded-full w-11 h-11 p-0 flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 4. Bottom Navigation - 최하단 고정 (높이: 64px) */}
      <nav className="h-16 flex-shrink-0 bg-black border-t border-gray-800">
        <div className="max-w-screen-xl mx-auto h-full">
          <div className="flex justify-around items-center h-full px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.url}
                  className="flex flex-col items-center justify-center gap-1 flex-1"
                >
                  <Icon className="w-6 h-6 text-gray-500" />
                  <span className="text-xs text-gray-500">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}