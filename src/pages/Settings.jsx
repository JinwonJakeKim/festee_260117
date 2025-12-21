import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom"; 
import { ArrowLeft, User, Mail, Globe, MapPin, Bell, Lock, HelpCircle, Info, ChevronRight, MessageCircle, Heart, UserPlus, Star, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const currentUser = await base44.auth.me();
      console.log('=== 설정 페이지 유저 정보 ===');
      console.log('유저:', currentUser.email, currentUser.full_name);
      console.log('알림 설정:', currentUser.notification_settings);
      return currentUser;
    },
  });

  const updateNotificationSettingMutation = useMutation({
    mutationFn: async (settings) => {
      const currentSettings = user.notification_settings || {};
      const newSettings = { ...currentSettings, ...settings };
      
      console.log('=== 알림 설정 업데이트 ===');
      console.log('이전 설정:', currentSettings);
      console.log('새 설정:', newSettings);
      
      await base44.auth.updateMe({ 
        notification_settings: newSettings
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });

  const updateLanguageMutation = useMutation({
    mutationFn: async (language) => {
      await base44.auth.updateMe({ 
        preferred_language: language
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });

  const handleToggle = (key, value) => {
    console.log(`알림 설정 변경: ${key} = ${value}`);
    updateNotificationSettingMutation.mutate({ [key]: value });
  };

  const handleLanguageChange = (language) => {
    updateLanguageMutation.mutate(language);
  };

  const languageOptions = [
    { code: 'ko', label: '한국어' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  const settings = user?.notification_settings || {};

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">설정</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* 계정 설정 */}
        <div>
          <h2 className="text-white font-bold mb-3">계정</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4">
                <p className="text-gray-400 text-sm mb-1">이메일</p>
                <p className="text-white">{user?.email || '로그인 필요'}</p>
              </div>
              <div className="p-4">
                <p className="text-gray-400 text-sm mb-1">이름</p>
                <p className="text-white">{user?.full_name || '로그인 필요'}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 알림 설정 - 전체 */}
        <div>
          <h2 className="text-white font-bold mb-3">알림 설정</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Bell className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-white font-medium">푸시 알림</p>
                    <p className="text-gray-500 text-xs">앱 푸시 알림 받기</p>
                  </div>
                </div>
                <Switch
                  checked={settings.push_enabled !== false}
                  onCheckedChange={(value) => handleToggle('push_enabled', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Mail className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-white font-medium">이메일 알림</p>
                    <p className="text-gray-500 text-xs">이메일로 알림 받기</p>
                  </div>
                </div>
                <Switch
                  checked={settings.email_enabled !== false}
                  onCheckedChange={(value) => handleToggle('email_enabled', value)}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* 알림 세부 설정 */}
        <div>
          <h2 className="text-white font-bold mb-3">알림 세부 설정</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-white">새 메시지</p>
                    <p className="text-gray-500 text-xs">새로운 메시지를 받았을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.new_message !== false}
                  onCheckedChange={(value) => handleToggle('new_message', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <MessageCircle className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-white">댓글</p>
                    <p className="text-gray-500 text-xs">내 게시글에 댓글이 달렸을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.new_comment !== false}
                  onCheckedChange={(value) => handleToggle('new_comment', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <UserPlus className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-white">새 팔로워</p>
                    <p className="text-gray-500 text-xs">누군가 나를 팔로우했을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.new_follower !== false}
                  onCheckedChange={(value) => handleToggle('new_follower', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-white">추천 축제 업데이트</p>
                    <p className="text-gray-500 text-xs">팔로우한 유저가 추천 축제를 업데이트했을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.recommended_festival_update !== false}
                  onCheckedChange={(value) => handleToggle('recommended_festival_update', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Heart className="w-5 h-5 text-pink-500" />
                  <div>
                    <p className="text-white">게시글 좋아요</p>
                    <p className="text-gray-500 text-xs">내 게시글에 좋아요를 받았을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.post_like !== false}
                  onCheckedChange={(value) => handleToggle('post_like', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Heart className="w-5 h-5 text-pink-500" />
                  <div>
                    <p className="text-white">캐치 좋아요</p>
                    <p className="text-gray-500 text-xs">내 캐치에 좋아요를 받았을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.catch_like !== false}
                  onCheckedChange={(value) => handleToggle('catch_like', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Heart className="w-5 h-5 text-pink-500" />
                  <div>
                    <p className="text-white">댓글 좋아요</p>
                    <p className="text-gray-500 text-xs">내 댓글에 좋아요를 받았을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.comment_like !== false}
                  onCheckedChange={(value) => handleToggle('comment_like', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <div>
                    <p className="text-white">축제 리마인더</p>
                    <p className="text-gray-500 text-xs">좋아요한 축제 시작 3일 전 알림</p>
                  </div>
                </div>
                <Switch
                  checked={settings.festival_reminder !== false}
                  onCheckedChange={(value) => handleToggle('festival_reminder', value)}
                />
              </div>

              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Users className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-white">같이가기 참여</p>
                    <p className="text-gray-500 text-xs">내 같이가기 게시글에 참여 요청이 왔을 때</p>
                  </div>
                </div>
                <Switch
                  checked={settings.gotogether_join !== false}
                  onCheckedChange={(value) => handleToggle('gotogether_join', value)}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* 앱 설정 */}
        <div>
          <h2 className="text-white font-bold mb-3">앱 설정</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">언어</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {languageOptions.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`p-3 rounded-lg border transition-all ${
                        (user?.preferred_language || 'ko') === lang.code
                          ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">지역</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">대한민국</span>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">통화</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">₩ KRW</span>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>
            </div>
          </Card>
        </div>

        {/* 지원 */}
        <div>
          <h2 className="text-white font-bold mb-3">지원</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button 
                onClick={() => navigate('/FeedbackForm')}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                  <span className="text-white">피드백 보내기</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-white">도움말</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </Card>
        </div>

        {/* 기타 */}
        <div>
          <h2 className="text-white font-bold mb-3">기타</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-gray-400" />
                  <span className="text-white">개인정보 처리방침</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-gray-400" />
                  <span className="text-white">앱 정보</span>
                </div>
                <span className="text-gray-500 text-sm">v1.0.0</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}