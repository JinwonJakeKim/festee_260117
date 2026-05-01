
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageCircle, Heart, UserPlus, Star, Calendar, Users, CheckCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false, // Added: Prevents retries on failed auth check
  });

  // 로그인 체크 및 리다이렉션
  useEffect(() => {
    // If loading is complete and no user data is present, redirect to login.
    // This ensures the user is prompted to log in if they try to access this page unauthenticated.
    if (!isLoading && !user) {
      alert('로그인이 필요한 페이지입니다');
      base44.auth.redirectToLogin(window.location.pathname);
    }
  }, [user, isLoading, navigate]); // Added navigate to dependency array for best practice

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.email], // Query key now depends on user email
    queryFn: async () => {
      if (!user) return []; // If no user, no notifications to fetch
      
      console.log('=== 알림 페이지 조회 ===');
      console.log('현재 유저:', user.email, user.full_name);
      console.log('알림 설정:', user.notification_settings);
      
      const notifs = await base44.entities.Notification.filter({ 
        user_email: user.email 
      }, '-created_date');
      
      console.log('조회된 알림 개수:', notifs.length);
      console.log('알림 목록 상세:');
      notifs.forEach((n, i) => {
        console.log(`  ${i+1}. [${n.is_read ? '읽음' : '안읽음'}] ${n.type} - ${n.title}`);
      });
      
      return notifs;
    },
    enabled: !!user, // Only run this query if user is present
    initialData: [],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, { is_read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Assuming such a query exists for global unread count
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      await Promise.all(unreadNotifications.map(n => 
        base44.entities.Notification.update(n.id, { is_read: true })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Assuming such a query exists for global unread count
    },
  });

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link_url) {
      navigate(notification.link_url);
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'new_message': return <MessageCircle className="w-5 h-5 text-cyan-400" />;
      case 'new_comment': return <MessageCircle className="w-5 h-5 text-green-400" />;
      case 'new_follower': return <UserPlus className="w-5 h-5 text-purple-400" />;
      case 'recommended_festival_update': return <Star className="w-5 h-5 text-yellow-400" />;
      case 'post_like': return <Heart className="w-5 h-5 text-pink-500" />;
      case 'catch_like': return <Heart className="w-5 h-5 text-pink-500" />;
      case 'comment_like': return <Heart className="w-5 h-5 text-pink-500" />;
      case 'festival_reminder': return <Calendar className="w-5 h-5 text-orange-400" />;
      case 'gotogether_join': return <Users className="w-5 h-5 text-blue-400" />;
      case 'gotogether_comment': return <MessageCircle className="w-5 h-5 text-green-400" />;
      default: return <MessageCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const filteredNotifications = filter === "all" 
    ? notifications 
    : notifications.filter(n => !n.is_read);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Render loading state while authentication status is being checked
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // Render a message and button if no user is logged in after loading
  // (This block is technically unreachable if the useEffect above triggers a hard redirect.
  // It's kept for strict adherence to the provided outline, serving as a fallback UI
  // if redirection fails or is delayed).
  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">로그인이 필요합니다</p>
          <Button 
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            className="bg-cyan-500 hover:bg-cyan-600"
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">알림</h1>
            {unreadCount > 0 && (
              <Badge className="bg-cyan-500 text-white">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              onClick={() => markAllAsReadMutation.mutate()}
              variant="ghost"
              size="sm"
              className="text-cyan-400 hover:text-cyan-300"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              모두 읽음
            </Button>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <Button
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className={filter === "all" 
              ? "bg-cyan-500 hover:bg-cyan-600 text-white" 
              : "bg-gray-900 border-gray-700 text-white hover:bg-gray-800"
            }
          >
            전체
          </Button>
          <Button
            onClick={() => setFilter("unread")}
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            className={filter === "unread" 
              ? "bg-cyan-500 hover:bg-cyan-600 text-white" 
              : "bg-gray-900 border-gray-700 text-white hover:bg-gray-800"
            }
          >
            읽지 않음 {unreadCount > 0 && `(${unreadCount})`}
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-4 py-4">
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`cursor-pointer transition-all ${
                  notification.is_read 
                    ? 'bg-gray-900 border-gray-800' 
                    : 'bg-gray-800 border-cyan-400/50'
                } hover:border-cyan-400/70`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {notification.sender_profile_image ? (
                      <img
                        src={notification.sender_profile_image}
                        alt={notification.sender_name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center flex-shrink-0">
                        {getIcon(notification.type)}
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold ${notification.is_read ? 'text-gray-300' : 'text-white'}`}>
                          {notification.title}
                        </h3>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-sm mb-2 ${notification.is_read ? 'text-gray-500' : 'text-gray-300'}`}>
                        {notification.content}
                      </p>
                      <div className="text-xs text-gray-500 mt-2">
                        {safeFormatDate(notification.created_date, 'yyyy.MM.dd HH:mm')}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500">알림이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
