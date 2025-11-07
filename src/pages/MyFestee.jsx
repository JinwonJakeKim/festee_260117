
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User, Camera, Heart, Settings, LogOut, MessageCircle, Star, BookOpen, ChevronRight, MapPin, Sparkles, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

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

export default function MyFestee() {
  const navigate = useNavigate();
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    initialData: [],
  });

  const { data: myCatches } = useQuery({
    queryKey: ['myCatches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const { data: myComments } = useQuery({
    queryKey: ['myComments', user?.email],
    queryFn: () => user ? base44.entities.Comment.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const { data: unreadMessagesCount } = useQuery({
    queryKey: ['unreadMessagesCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      const messages = await base44.entities.Message.filter({ 
        receiver_email: user.email,
        is_read: false 
      });
      return messages.length;
    },
    enabled: !!user,
    initialData: 0,
  });

  const likedFestivals = festivals.filter(f => 
    myLikes.some(like => like.festival_id === f.id)
  );

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
      await base44.auth.updateMe({ full_name: newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setIsEditingName(false);
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
    setEditedName(user?.full_name || "");
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== user?.full_name) {
      updateNameMutation.mutate(editedName.trim());
    } else {
      setIsEditingName(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleLogout = () => {
    base44.auth.logout();
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
            <h1 className="text-white text-2xl font-bold">My Festee</h1>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-white text-xl font-bold mb-1">로그인이 필요합니다</h2>
              <p className="text-gray-400 text-sm">Festee의 모든 기능을 이용해보세요</p>
            </div>
          </div>

          <Button
            onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
            className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12 text-base font-bold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            로그인하기
          </Button>
        </div>

        {/* Features Preview */}
        <div className="px-4 py-6 space-y-3">
          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-white">메시지</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-pink-500" />
                <span className="text-white">좋아요</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-white">댓글</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <div className="p-4 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-yellow-400" />
                <span className="text-white">내가 추천하는 축제</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </Card>
        </div>

        {/* Login Benefits */}
        <div className="px-4 py-4">
          <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30">
            <div className="p-6">
              <h3 className="text-white font-bold text-lg mb-4">로그인하면 이런 게 가능해요!</h3>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>축제 현장에서 GPS 기반 Catch 인증</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>좋아하는 축제 저장 및 관리</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>축제 같이가기 모집 및 참여</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>커뮤니티 활동 (글, 댓글 작성)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>FESTEE Coin 획득 및 랭커 도전</span>
                </li>
              </ul>
              <Button
                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                className="w-full mt-6 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-11"
              >
                지금 시작하기
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      label: "관리자 대시보드",
      link: createPageUrl("AdminDashboard"),
      icon: Settings,
      bgColor: "bg-gradient-to-r from-purple-500 to-pink-500",
      adminOnly: true,
    },
    {
      label: "메시지",
      link: createPageUrl("Messages"),
      icon: MessageCircle,
      bgColor: "bg-cyan-500",
    },
    {
      label: "좋아요",
      link: createPageUrl("MyLikes"),
      icon: Heart,
      bgColor: "bg-pink-500",
    },
    {
      label: "댓글",
      link: createPageUrl("MyComments"),
      icon: MessageCircle,
      bgColor: "bg-cyan-500",
    },
    {
      label: "내가 추천하는 축제",
      link: createPageUrl("MyRecommendations"),
      icon: Star,
      bgColor: "bg-yellow-500",
    },
    {
      label: "FESTEE Magazine",
      link: createPageUrl("FesteeMagazine"),
      icon: BookOpen,
      bgColor: "bg-purple-500",
    },
  ].filter(item => !item.adminOnly || user.role === 'admin');

  // 로그인 상태 UI
  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800 px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white text-2xl font-bold">My Festee</h1>
          <Link to={createPageUrl("Settings")}>
            <button className="text-gray-400 hover:text-white">
              <Settings className="w-6 h-6" />
            </button>
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-6">
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
                  <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
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
                  placeholder="이름 입력"
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
                <h2 className="text-white text-xl font-bold">{user.full_name}</h2>
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
                    <Badge className="bg-cyan-500 text-white text-xs ml-1">인증</Badge>
                  )}
                </div>
              </Link>
            )}
            {!user.home_city && (
              <Link to={createPageUrl("SelectCity")}>
                <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 text-base">도시 설정하기</span>
                </div>
              </Link>
            )}
            {user.bio && <p className="text-gray-300 text-sm mt-2">{user.bio}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-white text-2xl font-bold">{user.catches_count || 0}</p>
            <p className="text-gray-400 text-xs">캐치</p>
          </div>
          <div className="text-center">
            <p className="text-white text-2xl font-bold">1.2K</p>
            <p className="text-gray-400 text-xs">팔로워</p>
          </div>
          <div className="text-center">
            <p className="text-white text-2xl font-bold">77</p>
            <p className="text-gray-400 text-xs">팔로잉</p>
          </div>
        </div>

        {/* External Links */}
        <div className="flex gap-2">
          <Badge variant="outline" className="text-gray-400 border-gray-700">
            🎥 youtube.com/@username
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 py-6 grid grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800 p-4 text-center">
          <Camera className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{user?.catches_count || 0}</p>
          <p className="text-xs text-gray-500">Catches</p>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4 text-center">
          <Heart className="w-6 h-6 text-pink-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{myLikes.length}</p>
          <p className="text-xs text-gray-500">Likes</p>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-4 text-center">
          <MessageCircle className="w-6 h-6 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{myComments.length}</p>
          <p className="text-xs text-gray-500">Comments</p>
        </Card>
      </div>

      {/* Recommended Festivals */}
      {user?.recommended_festivals && user.recommended_festivals.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-white font-bold text-xl mb-4">내가 추천하는 축제 Top 3</h2>
          <div className="space-y-3">
            {user.recommended_festivals.map((rec) => {
              const festival = festivals.find(f => f.id === rec.festival_id);
              if (!festival) return null;
              
              return (
                <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                  <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4">
                    <div className="flex gap-3">
                      <img
                        src={festival.thumbnail_url}
                        alt={festival.name}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="text-white font-bold mb-1">{festival.name}</h3>
                        <p className="text-gray-400 text-sm mb-2">
                          {festival.city}, {festival.country}
                        </p>
                        <p className="text-gray-500 text-xs mb-2">
                          {safeFormatDate(festival.start_date, 'yyyy.MM.dd')}
                        </p>
                        {rec.comment && (
                          <p className="text-cyan-400 text-sm italic">"{rec.comment}"</p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* My Catches */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-xl">내 Catch</h2>
          <Link to={createPageUrl("Catch")}>
            <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
              더보기 →
            </Button>
          </Link>
        </div>

        {myCatches.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {myCatches.slice(0, 6).map((catchItem) => (
              <div key={catchItem.id} className="aspect-square rounded-lg overflow-hidden relative">
                <img
                  src={catchItem.image_url}
                  alt={catchItem.festival_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-2">
                  <p className="text-white text-xs font-bold truncate">{catchItem.festival_name}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <Camera className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">아직 인증한 축제가 없습니다</p>
          </Card>
        )}
      </div>

      {/* Menu Items */}
      <div className="px-4 space-y-2">
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
          <span>로그아웃</span>
        </button>
      </div>
    </div>
  );
}
