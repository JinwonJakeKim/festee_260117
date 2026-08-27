import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom"; 
import { ArrowLeft, User, Mail, Globe, MapPin, Bell, Lock, HelpCircle, Info, ChevronRight, MessageCircle, Heart, UserPlus, Star, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslation } from "@/components/useTranslation";

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

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

  const handleLanguageChange = (lang) => {
    updateLanguageMutation.mutate(lang);
  };

  const getLanguageLabel = (code) => {
    const labels = {
      ko: '한국어',
      en: 'English',
      ja: '日本語',
      zh: '中文',
    };
    return labels[code] || '한국어';
  };

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
      <LanguageSelector
        isOpen={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        currentLanguage={language}
        onSelect={handleLanguageChange}
      />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 pb-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">{t('settings')}</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* 계정 설정 */}
        <div>
          <h2 className="text-white font-bold mb-3">{t('account')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4">
                <p className="text-gray-400 text-sm mb-1">{t('email')}</p>
                <p className="text-white">{user?.email || t('loginRequired')}</p>
              </div>
              <div className="p-4">
                <p className="text-gray-400 text-sm mb-1">{t('name')}</p>
                <p className="text-white">{user?.nickname || user?.full_name || t('loginRequired')}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 알림 설정 - 전체 */}
        <div>
          <h2 className="text-white font-bold mb-3">{t('notificationSettings')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Bell className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-white font-medium">{t('pushNotification')}</p>
                    <p className="text-gray-500 text-xs">{t('pushNotificationDesc')}</p>
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
                    <p className="text-white font-medium">{t('emailNotification')}</p>
                    <p className="text-gray-500 text-xs">{t('emailNotificationDesc')}</p>
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
          <h2 className="text-white font-bold mb-3">{t('detailedNotificationSettings')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-white">{t('newMessage')}</p>
                    <p className="text-gray-500 text-xs">{t('newMessageDesc')}</p>
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
                    <p className="text-white">{t('comment')}</p>
                    <p className="text-gray-500 text-xs">{t('commentDesc')}</p>
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
                    <p className="text-white">{t('newFollower')}</p>
                    <p className="text-gray-500 text-xs">{t('newFollowerDesc')}</p>
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
                    <p className="text-white">{t('recommendedFestivalUpdate')}</p>
                    <p className="text-gray-500 text-xs">{t('recommendedFestivalUpdateDesc')}</p>
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
                    <p className="text-white">{t('postLike')}</p>
                    <p className="text-gray-500 text-xs">{t('postLikeDesc')}</p>
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
                    <p className="text-white">{t('catchLike')}</p>
                    <p className="text-gray-500 text-xs">{t('catchLikeDesc')}</p>
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
                    <p className="text-white">{t('commentLike')}</p>
                    <p className="text-gray-500 text-xs">{t('commentLikeDesc')}</p>
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
                    <p className="text-white">{t('festivalReminder')}</p>
                    <p className="text-gray-500 text-xs">{t('festivalReminderDesc')}</p>
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
                    <p className="text-white">{t('goTogetherJoin')}</p>
                    <p className="text-gray-500 text-xs">{t('goTogetherJoinDesc')}</p>
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
          <h2 className="text-white font-bold mb-3">{t('appSettings')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button 
                onClick={() => setShowLanguageModal(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('language')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{getLanguageLabel(language)}</span>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('region')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{t('korea')}</span>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('currency')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{t('krw')}</span>
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </button>
            </div>
          </Card>
        </div>

        {/* 지원 */}
        <div>
          <h2 className="text-white font-bold mb-3">{t('support')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button 
                onClick={() => navigate('/FeedbackForm')}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                  <span className="text-white">{t('sendFeedback')}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('help')}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </Card>
        </div>

        {/* 계정 관리 */}
        <div>
          <h2 className="text-white font-bold mb-3">계정 관리</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button
                onClick={() => navigate('/AccountManagement')}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-red-400" />
                  <span className="text-white">계정 비활성화 / 삭제</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </Card>
        </div>

        {/* 기타 */}
        <div>
          <h2 className="text-white font-bold mb-3">{t('other')}</h2>
          <Card className="bg-gray-900 border-gray-800">
            <div className="divide-y divide-gray-800">
              <button
                onClick={() => navigate('/PrivacyPolicy')}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('privacyPolicy')}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>

              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-gray-400" />
                  <span className="text-white">{t('appInfo')}</span>
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