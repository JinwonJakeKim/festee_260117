import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, BookOpen, Mail, Send, Check, Sparkles, Calendar, Globe, Heart, Star, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

export default function FesteeMagazine() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  // 사용자의 구독 상태 확인
  const isSubscribed = user?.magazine_subscription || false;

  const subscribeMutation = useMutation({
    mutationFn: async (subscriptionEmail) => {
      if (!user) {
        // 비로그인 사용자: 이메일만 저장 (별도 엔티티에 저장하거나 알림만)
        // 여기서는 간단히 알림만 표시
        return { guest: true, email: subscriptionEmail };
      }
      
      // 로그인 사용자: User 엔티티에 구독 정보 저장
      await base44.auth.updateMe({
        magazine_subscription: true,
        magazine_email: subscriptionEmail
      });
      
      // 구독 환영 이메일 발송 (선택사항)
      await base44.integrations.Core.SendEmail({
        to: subscriptionEmail,
        subject: "🎉 FESTEE Magazine 구독을 환영합니다!",
        body: `안녕하세요, ${user?.full_name || '고객'}님!

FESTEE Magazine 구독을 진심으로 환영합니다.

매월 전 세계의 흥미진진한 축제 소식과 여행 팁을 
${subscriptionEmail}로 보내드리겠습니다.

🎪 이번 달 특집
- 세계 3대 축제 완벽 가이드
- 축제 현장에서 살아남는 꿀팁
- 숨겨진 로컬 축제 10선

첫 번째 매거진은 곧 발송됩니다!

감사합니다.
FESTEE 팀 드림`
      });
      
      return { guest: false, email: subscriptionEmail };
    },
    onSuccess: (data) => {
      if (!data.guest) {
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      }
      setShowSuccess(true);
      setEmail("");
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({
        magazine_subscription: false,
        magazine_email: null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      alert('구독이 취소되었습니다.');
    },
  });

  const handleSubscribe = () => {
    if (!email.trim()) {
      alert('이메일을 입력해주세요');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('올바른 이메일 형식이 아닙니다');
      return;
    }
    
    subscribeMutation.mutate(email);
  };

  const magazineFeatures = [
    {
      icon: Calendar,
      title: "매월 발행",
      description: "매월 1일, 신선한 축제 소식을 받아보세요"
    },
    {
      icon: Globe,
      title: "전 세계 축제",
      description: "아시아부터 유럽까지, 전 세계 축제 정보"
    },
    {
      icon: Heart,
      title: "큐레이션",
      description: "FESTEE 에디터가 직접 선정한 추천 축제"
    },
    {
      icon: Star,
      title: "독점 혜택",
      description: "구독자 전용 할인 코드 및 이벤트"
    },
    {
      icon: TrendingUp,
      title: "트렌드 분석",
      description: "올해 핫한 축제 트렌드와 인사이트"
    },
    {
      icon: BookOpen,
      title: "여행 가이드",
      description: "축제 여행을 위한 실전 팁과 가이드"
    }
  ];

  const sampleIssues = [
    {
      title: "2024 겨울 특집호",
      subtitle: "크리스마스 마켓 & 윈터 페스티벌",
      image: "https://images.unsplash.com/photo-1482754409974-c0d6b7e5c39c?w=800",
      date: "2024년 12월"
    },
    {
      title: "여름 음악 축제 대전",
      subtitle: "전 세계 여름 페스티벌 총정리",
      image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800",
      date: "2024년 6월"
    },
    {
      title: "봄꽃 축제 특별판",
      subtitle: "벚꽃부터 튤립까지, 봄을 즐기는 방법",
      image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800",
      date: "2024년 4월"
    }
  ];

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Success Animation */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50"
          >
            <Card className="bg-green-500 border-green-400 p-4 flex items-center gap-3">
              <Check className="w-6 h-6 text-white" />
              <div>
                <p className="text-white font-bold">구독 완료!</p>
                <p className="text-white text-sm">곧 첫 매거진을 보내드릴게요</p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">FESTEE Magazine</h1>
            <p className="text-gray-400 text-sm">축제 전문 디지털 매거진</p>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="px-4 py-8">
        <div className="relative rounded-2xl overflow-hidden mb-8">
          <img
            src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200"
            alt="FESTEE Magazine"
            className="w-full h-64 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-8 h-8 text-cyan-400" />
              <Badge className="bg-purple-500 text-white">Premium</Badge>
            </div>
            <h2 className="text-white text-3xl font-bold mb-2">
              FESTEE Magazine
            </h2>
            <p className="text-gray-300 text-base">
              전 세계 축제의 모든 것을 담은 프리미엄 디지털 매거진
            </p>
          </div>
        </div>

        {/* Subscription Box */}
        <Card className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border-purple-400/30 p-6 mb-8">
          <h3 className="text-white font-bold text-xl mb-3 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-yellow-400" />
            무료 구독하고 매거진 받아보기
          </h3>
          {isSubscribed ? (
            <div>
              <div className="bg-green-900/20 border border-green-400/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-green-400 font-bold">구독 중</span>
                </div>
                <p className="text-gray-300 text-sm">
                  {user.magazine_email || user.email}로<br />
                  매월 매거진이 발송됩니다
                </p>
              </div>
              <Button
                onClick={() => {
                  if (confirm('정말 구독을 취소하시겠습니까?')) {
                    unsubscribeMutation.mutate();
                  }
                }}
                variant="outline"
                className="w-full border-gray-700 text-gray-400 hover:bg-gray-800"
              >
                구독 취소
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-gray-300 text-sm mb-4">
                이메일을 입력하시면 매월 1일 최신 매거진을 무료로 받아보실 수 있습니다
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="이메일 주소 입력"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSubscribe();
                    }
                  }}
                  className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                />
                <Button
                  onClick={handleSubscribe}
                  disabled={subscribeMutation.isLoading}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {subscribeMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      구독
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Features */}
        <h3 className="text-white font-bold text-xl mb-4">매거진 특징</h3>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {magazineFeatures.map((feature, index) => (
            <Card key={index} className="bg-gray-900 border-gray-800 p-4">
              <feature.icon className="w-8 h-8 text-cyan-400 mb-2" />
              <h4 className="text-white font-bold text-sm mb-1">{feature.title}</h4>
              <p className="text-gray-400 text-xs">{feature.description}</p>
            </Card>
          ))}
        </div>

        {/* Sample Issues */}
        <h3 className="text-white font-bold text-xl mb-4">지난 호 보기</h3>
        <div className="space-y-4">
          {sampleIssues.map((issue, index) => (
            <Card key={index} className="bg-gray-900 border-gray-800 overflow-hidden">
              <div className="flex gap-4">
                <img
                  src={issue.image}
                  alt={issue.title}
                  className="w-32 h-32 object-cover"
                />
                <div className="flex-1 p-4">
                  <Badge className="bg-purple-500 text-white text-xs mb-2">
                    {issue.date}
                  </Badge>
                  <h4 className="text-white font-bold mb-1">{issue.title}</h4>
                  <p className="text-gray-400 text-sm">{issue.subtitle}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div className="px-4 py-6">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
            <Mail className="w-5 h-5 text-cyan-400" />
            발송 안내
          </h3>
          <ul className="text-gray-300 text-sm space-y-2">
            <li>• 매월 1일 오전 10시에 발송됩니다</li>
            <li>• 스팸 메일함을 확인해주세요</li>
            <li>• 언제든지 구독을 취소할 수 있습니다</li>
            <li>• 개인정보는 매거진 발송 목적으로만 사용됩니다</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}