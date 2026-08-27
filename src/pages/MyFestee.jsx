import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User, Camera, Settings, LogOut, MessageCircle, Star, ChevronRight, MapPin, Sparkles, Edit2, Check, X, Copy, Share2, Gift, Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useLanguage } from "@/lib/useLanguage";
import { myFesteeTranslations } from "@/lib/myFesteeTranslations";

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

// 추천코드 생성 함수
const generateReferralCode = (userEmail) => {
  // 이메일 기반 시드로 일관된 코드 생성
  let hash = 0;
  for (let i = 0; i < userEmail.length; i++) {
    hash = userEmail.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // 6자리 알파벳+숫자 코드 생성
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 가능한 문자 제외 (I, O, 0, 1)
  let code = '';
  let tempHash = Math.abs(hash);
  
  for (let i = 0; i < 6; i++) {
    code += chars[tempHash % chars.length];
    tempHash = Math.floor(tempHash / chars.length);
  }
  
  return code;
};

export default function MyFestee() {
  const { language } = useLanguage();
  const t = myFesteeTranslations[language] || myFesteeTranslations.ko;
  const navigate = useNavigate();
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [showCodeCopied, setShowCodeCopied] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralError, setReferralError] = useState("");
  const [referralSuccess, setReferralSuccess] = useState("");
  const [showCoinInfo, setShowCoinInfo] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: myCatches, isLoading: myCatchesLoading, isFetching: myCatchesFetching } = useQuery({
    queryKey: ['myCatches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }) : [],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  const { data: myLikesCount, isLoading: myLikesLoading, isFetching: myLikesFetching } = useQuery({
    queryKey: ['myLikesCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      
      const likes = await base44.entities.FestivalLike.filter({ user_email: user.email });
      const uniqueFestivalIds = Array.from(new Set(likes.map(like => like.festival_id)));
      
      if (uniqueFestivalIds.length === 0) return 0;
      
      // $in 연산자로 한 번에 여러 축제 존재 확인
      const existingFestivals = await base44.entities.Festival.filter({ 
        id: { $in: uniqueFestivalIds } 
      }, null, uniqueFestivalIds.length);
      
      return existingFestivals.length;
    },
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  const { data: myComments } = useQuery({
    queryKey: ['myComments', user?.email],
    queryFn: () => user ? base44.entities.Comment.filter({ user_email: user.email }) : [],
    enabled: !!user,
  });

  // 팔로워/팔로잉 데이터 가져오기
  const { data: myFollowers, isLoading: myFollowersLoading, isFetching: myFollowersFetching } = useQuery({
    queryKey: ['myFollowers', user?.email],
    queryFn: () => user ? base44.entities.Follow.filter({ following_email: user.email }) : [],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  const { data: myFollowing, isLoading: myFollowingLoading, isFetching: myFollowingFetching } = useQuery({
    queryKey: ['myFollowing', user?.email],
    queryFn: () => user ? base44.entities.Follow.filter({ follower_email: user.email }) : [],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  // 내가 추천한 친구 수 조회
  const { data: myReferrals, isLoading: myReferralsLoading, isFetching: myReferralsFetching } = useQuery({
    queryKey: ['myReferrals', user?.email],
    queryFn: () => user ? base44.entities.ReferralLog.filter({ referrer_email: user.email }) : [],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  // 내가 추천 코드를 사용했는지 확인
  const { data: myReferralUsage, isLoading: myReferralUsageLoading, isFetching: myReferralUsageFetching } = useQuery({
    queryKey: ['myReferralUsage', user?.email],
    queryFn: () => user ? base44.entities.ReferralLog.filter({ referred_email: user.email }) : [],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: undefined,
  });

  const uploadProfileImageMutation = useMutation({
    mutationFn: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.auth.updateMe({ profile_image: file_url });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setIsUploadingProfileImage(false);
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (newName) => {
      console.log('[MyFestee] 닉네임 업데이트 시작:', newName);
      await base44.auth.updateMe({ nickname: newName });
      console.log('[MyFestee] 업데이트 완료, 최신 데이터 조회 중...');
      const updatedUser = await base44.auth.me();
      console.log('[MyFestee] 최신 사용자 데이터:', updatedUser.nickname);
      return updatedUser;
    },
    onSuccess: async (updatedUser) => {
      console.log('[MyFestee] 캐시 업데이트:', updatedUser.nickname);
      queryClient.setQueryData(['currentUser'], updatedUser);
      setIsEditingName(false);
      setEditedName("");
    },
    onError: (error) => {
      console.error('[MyFestee] 닉네임 업데이트 실패:', error);
      alert(t.updateNameError);
    },
  });

  const redeemReferralMutation = useMutation({
    mutationFn: async (referralCode) => {
      const response = await base44.functions.invoke('redeemReferralCode', { referralCode });
      return response.data;
    },
    onSuccess: (data) => {
      setReferralSuccess(data.message);
      setReferralError("");
      setReferralCodeInput("");
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['myReferralUsage'] });
      setTimeout(() => {
        setShowReferralModal(false);
        setReferralSuccess("");
      }, 3000);
    },
    onError: (error) => {
      setReferralError(error.response?.data?.error || '추천 코드 처리 중 오류가 발생했습니다');
      setReferralSuccess("");
    },
  });

  const handleProfileImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingProfileImage(true);
      try {
        await uploadProfileImageMutation.mutateAsync(file);
      } finally {
        setIsUploadingProfileImage(false);
      }
    }
  };

  const handleStartEditName = () => {
    setEditedName(user?.nickname || user?.full_name || "");
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmedName = editedName.trim();
    const currentName = user?.nickname || user?.full_name;
    console.log('[MyFestee] 저장 시도:', trimmedName, '현재:', currentName);
    
    if (!trimmedName) {
      console.log('[MyFestee] 빈 이름, 취소');
      setIsEditingName(false);
      return;
    }
    
    if (trimmedName === currentName) {
      console.log('[MyFestee] 이름 변경 없음, 취소');
      setIsEditingName(false);
      return;
    }
    
    console.log('[MyFestee] Mutation 실행...');
    updateNameMutation.mutate(trimmedName);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  // 추천코드 복사 핸들러
  const handleCopyReferralCode = async () => {
    const referralCode = generateReferralCode(user.email);
    try {
      await navigator.clipboard.writeText(referralCode);
      setShowCodeCopied(true);
      setTimeout(() => {
        setShowCodeCopied(false);
      }, 2000);
    } catch (error) {
      console.error('코드 복사 실패:', error);
    }
  };

  const handleShareReferralCode = async () => {
    const referralCode = generateReferralCode(user.email);
    const shareText = `🎉 Festee에서 전 세계 축제를 만나고, 친구와 함께 500 코인도 받으세요!\n\n내 추천 코드: ${referralCode}\n\n앱 다운로드: ${window.location.origin}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Festee 친구 초대',
          text: shareText,
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.log('공유 실패, 클립보드로 복사합니다.');
          await navigator.clipboard.writeText(shareText);
          setShowCodeCopied(true);
          setTimeout(() => {
            setShowCodeCopied(false);
          }, 2000);
        }
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setShowCodeCopied(true);
      setTimeout(() => {
        setShowCodeCopied(false);
      }, 2000);
    }
  };

  const handleOpenReferralModal = () => {
    setShowReferralModal(true);
    setReferralError("");
    setReferralSuccess("");
    setReferralCodeInput("");
  };

  const handleSubmitReferralCode = () => {
    if (!referralCodeInput.trim()) {
      setReferralError(t.referralEmptyError);
      return;
    }
    if (user && generateReferralCode(user.email).toUpperCase() === referralCodeInput.trim().toUpperCase()) {
      setReferralError(t.referralSelfError);
      return;
    }
    redeemReferralMutation.mutate(referralCodeInput);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // 비로그인 상태 UI
  if (!user) {
    return (
      <div className="min-h-screen bg-black pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800 px-6 py-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-white text-2xl font-bold">{t.title}</h1>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-white text-xl font-bold mb-1">{t.loginRequired}</h2>
              <p className="text-gray-400 text-sm">{t.loginSubtitle}</p>
            </div>
          </div>

          <Button
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12 text-base font-bold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {t.loginBtn}
          </Button>
        </div>

        {/* Features Preview */}
        <div className="px-4 py-6 space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-white">{t.messages}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-white">{t.comments}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-yellow-400" />
                <span className="text-white">{t.myRecommendations}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Link to="/PrivacyPolicy">
            <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-white font-medium">{t.privacy}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </div>
            </Card>
          </Link>
        </div>

        {/* Login Benefits */}
        <div className="px-4 py-4">
          <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30">
            <div className="p-6">
              <h3 className="text-white font-bold text-lg mb-4">{t.loginBenefitsTitle}</h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{t.benefit1}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{t.benefit2}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{t.benefit3}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{t.benefit4}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{t.benefit5}</span>
                </li>
              </ul>
              <Button
                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                className="w-full mt-6 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-11"
              >
                {t.startBtn}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const referralCode = generateReferralCode(user.email);
  const userCoins = user.coins || 0;
  const usedReferralCount = (myReferralUsage?.length || 0);

  // 수정된 menuItems - 순서 변경, 좋아요 제거, 댓글 색상 변경, 설정 추가
  const menuItems = [
    {
      label: t.adminDashboard,
      link: createPageUrl("AdminDashboard"),
      icon: Settings,
      bgColor: "bg-gradient-to-r from-purple-500 to-pink-500",
      adminOnly: true,
    },
    {
      label: t.myRecommendations,
      link: createPageUrl("MyRecommendations"),
      icon: Star,
      bgColor: "bg-yellow-500",
    },
    {
      label: t.messages,
      link: createPageUrl("Messages"),
      icon: MessageCircle,
      bgColor: "bg-cyan-500",
    },
    {
      label: t.comments,
      link: createPageUrl("MyComments"),
      icon: MessageCircle,
      bgColor: "bg-green-500",
    },
    {
      label: t.settings,
      link: createPageUrl("Settings"),
      icon: Settings,
      bgColor: "bg-gray-600",
    },
    {
      label: t.privacy,
      link: "/PrivacyPolicy",
      icon: Lock,
      bgColor: "bg-gray-700",
    },
  ].filter(item => !item.adminOnly || user.role === 'admin');

  // 로그인 상태 UI
  return (
    <div className="min-h-screen bg-black pb-20">
      {/* 코드 복사 알림 */}
      {showCodeCopied && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border border-cyan-400 rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
          <Check className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm font-medium">{t.copiedMsg}</span>
        </div>
      )}

      {/* 추천인 코드 입력 모달 */}
      <AnimatePresence>
        {showReferralModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReferralModal(false)}
              className="fixed inset-0 bg-black/80 z-[10000]"
              />
              <motion.div
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-gray-950 rounded-t-3xl z-[10001] max-h-[85vh] overflow-y-auto pb-24"
              >
              <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white text-xl font-bold">{t.referralModalTitle}</h2>
                <button
                  onClick={() => setShowReferralModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-6">
                <div className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border border-cyan-400/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3 mb-3">
                    <Gift className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-white font-bold mb-2">{t.referralBenefitTitle}</h3>
                      <ul className="space-y-1 text-gray-300 text-sm">
                        <li>• {t.referralBenefit1(500).split('500').map((part, i, arr) => i < arr.length - 1 ? <span key={i}>{part}<span className="text-yellow-400 font-bold">500</span></span> : part)}</li>
                        <li>• {t.referralBenefit2(500).split('500').map((part, i, arr) => i < arr.length - 1 ? <span key={i}>{part}<span className="text-yellow-400 font-bold">500</span></span> : part)}</li>
                        <li>• {t.referralBenefit3}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 이미 사용한 추천 코드 목록 */}
                {usedReferralCount > 0 && (
                  <div className="mb-4">
                    <p className="text-gray-400 text-xs mb-2">사용한 추천 코드 ({usedReferralCount}개)</p>
                    <div className="space-y-1.5">
                      {myReferralUsage.map((r, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-400 font-bold text-sm tracking-wider">{r.referrer_code}</span>
                            <span className="text-gray-500 text-xs">· {r.referrer_name || r.referrer_email}</span>
                          </div>
                          <span className="text-yellow-400 text-xs font-bold">+{r.coins_awarded || 500}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-white text-sm font-medium mb-2 block">
                      {t.referralCodeLabel}
                    </label>
                    <Input
                      value={referralCodeInput}
                      onChange={(e) => {
                        setReferralCodeInput(e.target.value.toUpperCase());
                        setReferralError("");
                      }}
                      placeholder={t.referralPlaceholder}
                      className="bg-gray-900 border-gray-700 text-white text-lg tracking-wider text-center"
                      maxLength={6}
                    />
                  </div>

                  {referralError && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                      <p className="text-red-400 text-sm">{referralError}</p>
                    </div>
                  )}

                  {referralSuccess && (
                    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                      <p className="text-green-400 text-sm">{referralSuccess}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleSubmitReferralCode}
                    disabled={redeemReferralMutation.isPending || !referralCodeInput.trim()}
                    className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12 text-base font-bold"
                  >
                    {redeemReferralMutation.isPending ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                        <span>{t.processing}</span>
                      </div>
                    ) : (
                      t.referralSubmitBtn
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 코인 정보 모달 */}
      <AnimatePresence>
        {showCoinInfo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCoinInfo(false)}
              className="fixed inset-0 bg-black/80 z-[10000]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-gray-950 rounded-t-3xl z-[10001] max-h-[85vh] overflow-y-auto pb-24"
            >
              <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  <h2 className="text-white text-xl font-bold">Festee 코인 안내</h2>
                </div>
                <button
                  onClick={() => setShowCoinInfo(false)}
                  className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1">Festee 코인이란?</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      Festee 앱 내에서 활동하며 모은 가상 코인입니다.
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border border-cyan-400/30 rounded-lg p-4">
                  <p className="text-cyan-400 font-bold text-sm mb-3 flex items-center gap-1.5">
                    <Info className="w-4 h-4" />
                    사용 예정 서비스
                  </p>
                  <p className="text-white leading-relaxed text-sm">
                    Festee 코인은 추후 앱 내 유료 서비스에 사용 예정입니다.
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2 bg-gray-900/50 rounded-lg px-3 py-2">
                      <span className="text-cyan-400 font-bold text-sm">•</span>
                      <span className="text-gray-200 text-sm">AI 챗봇 등 프리미엄 기능</span>
                    </div>
                  </div>
                </div>

                <p className="text-gray-500 text-xs leading-relaxed">
                  * 코인 사용 서비스는 순차적으로 추가될 예정이며, 안내 드릴 때까지 조금만 기다려주세요.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Header - 톱니바퀴 제거 */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800 px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white text-2xl font-bold">{t.title}</h1>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <label className="relative cursor-pointer group">
            <input
              type="file"
              accept="image/*"
              onChange={handleProfileImageUpload}
              className="hidden"
            />
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center overflow-hidden relative">
              {isUploadingProfileImage ? (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
                </div>
              ) : user.profile_image ? (
                <>
                  <img src={user.profile_image} alt={user.nickname || user.full_name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </>
              ) : (
                <>
                  <User className="w-10 h-10 text-white" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </>
              )}
            </div>
          </label>
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white h-9 text-lg font-bold flex-1"
                  placeholder={t.namePlaceholder}
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    }
                  }}
                />
                <button
                  onClick={handleSaveName}
                  className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-600 flex items-center justify-center transition-colors"
                  aria-label="저장"
                >
                  <Check className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                  aria-label="취소"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-white text-xl font-bold">{user.nickname || user.full_name}</h2>
                <button
                  onClick={handleStartEditName}
                  className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
                  aria-label="이름 편집"
                >
                  <Edit2 className="w-4 h-4 text-cyan-400" />
                </button>
              </div>
            )}
            <p className="text-gray-400 text-sm mb-1">{user.email}</p>
            {user.home_city && (
              <Link to={createPageUrl("SelectCity")}>
                <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span className="text-cyan-400 text-base font-medium">{user.home_city}</span>
                  {user.city_verified && (
                    <Badge className="bg-cyan-500 text-white text-xs ml-1">{t.verified}</Badge>
                  )}
                </div>
              </Link>
            )}
            {!user.home_city && (
              <Link to={createPageUrl("SelectCity")}>
                <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 text-base">{t.setCity}</span>
                </div>
              </Link>
            )}
            {user.bio && <p className="text-gray-300 text-sm mt-2">{user.bio}</p>}
          </div>
        </div>

        {/* 추천코드 섹션 */}
        <div className="mb-4">
          <div className="bg-gray-900 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-gray-400 text-xs">{t.myReferralCode}</p>
                  <p className="text-white font-bold text-lg tracking-wider">{referralCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyReferralCode}
                  className="w-9 h-9 rounded-lg bg-cyan-500 hover:bg-cyan-600 flex items-center justify-center transition-colors"
                  aria-label="추천코드 복사"
                >
                  <Copy className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={handleShareReferralCode}
                  className="w-9 h-9 rounded-lg bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
                  aria-label="친구에게 공유"
                >
                  <Share2 className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={handleOpenReferralModal}
                  className="w-9 h-9 rounded-lg bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-colors"
                  aria-label="추천인 코드 입력"
                >
                  <Gift className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            
            {/* 추천 현황 표시 */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
              <p className="text-gray-400 text-xs">{t.referredFriends}</p>
              <p className="text-cyan-400 font-bold text-sm">
                {(myReferralsLoading || myReferralsFetching) ? (
                  <span className="text-gray-600">-</span>
                ) : (
                  t.people(myReferrals?.length || 0)
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Profile Stats - 순서 변경: 좋아요, 캐치, 팔로워, 팔로잉, 코인 */}
        <div className="grid grid-cols-5 gap-2">
          <Link to={createPageUrl("MyLikes")} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-white text-2xl font-bold">
              {(myLikesLoading || myLikesFetching || myLikesCount === undefined) ? (
                <span className="text-gray-600">-</span>
              ) : (
                myLikesCount || 0
              )}
            </p>
            <p className="text-gray-400 text-xs">{t.likes}</p>
          </Link>
          <Link to={createPageUrl("MyCatches")} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-white text-2xl font-bold">
              {(myCatchesLoading || myCatchesFetching) ? (
                <span className="text-gray-600">-</span>
              ) : (
                myCatches?.length || 0
              )}
            </p>
            <p className="text-gray-400 text-xs">{t.catches}</p>
          </Link>
          <Link to={createPageUrl("MyFollowers")} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-white text-2xl font-bold">
              {(myFollowersLoading || myFollowersFetching) ? (
                <span className="text-gray-600">-</span>
              ) : (
                myFollowers?.length || 0
              )}
            </p>
            <p className="text-gray-400 text-xs">{t.followers}</p>
          </Link>
          <Link to={createPageUrl("MyFollowing")} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-white text-2xl font-bold">
              {(myFollowingLoading || myFollowingFetching) ? (
                <span className="text-gray-600">-</span>
              ) : (
                myFollowing?.length || 0
              )}
            </p>
            <p className="text-gray-400 text-xs">{t.following}</p>
          </Link>
          <div className="text-center">
            <p className="text-white text-2xl font-bold flex items-center justify-center gap-1">
              {userCoins.toLocaleString()}
              <button
                onClick={() => setShowCoinInfo(true)}
                className="w-4 h-4 rounded-full bg-gray-700 hover:bg-cyan-500 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="코인 정보"
              >
                <Info className="w-3 h-3 text-gray-300" />
              </button>
            </p>
            <p className="text-gray-400 text-xs">{t.coins}</p>
          </div>
        </div>

        {/* External Links */}
        {user.youtube_url && (
          <div className="flex gap-2 mt-4">
            <Badge variant="outline" className="text-gray-400 border-gray-700">
              🎥 {user.youtube_url}
            </Badge>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="px-4 py-6 space-y-2">
        {menuItems.map((item) => (
          <Link key={item.label} to={item.link}>
            <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${item.bgColor} flex items-center justify-center`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-white font-medium">{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </Card>
          </Link>
        ))}
      </div>

      {/* Logout Button */}
      <div className="px-4 py-4">
        <button
          onClick={handleLogout}
          className="w-full bg-gray-900 hover:bg-gray-800 rounded-lg p-4 flex items-center gap-3 text-white transition-colors border border-gray-800"
        >
          <LogOut className="w-5 h-5 text-gray-400" />
          <span>{t.logout}</span>
        </button>
      </div>
    </div>
  );
}