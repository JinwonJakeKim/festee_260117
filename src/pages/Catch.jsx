import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation, MapPin, CheckCircle, AlertCircle, Target, Trophy, Share2, Instagram, Facebook, ChevronRight, User } from "lucide-react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LoginPromptModal from "../components/LoginPromptModal";
import { useLanguage } from "@/lib/useLanguage";
import { catchTranslations } from "@/lib/catchTranslations";

// 두 좌표 간 거리 계산 (Haversine formula) - 미터 단위
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // 지구 반경 (미터)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // 미터 단위
};

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

export default function Catch() {
  const { language, getLocalizedContent } = useLanguage();
  const t = catchTranslations[language] || catchTranslations.ko;

  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [catchedFestival, setCatchedFestival] = useState(null);
  const [nearbyFestivals, setNearbyFestivals] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState('explore');
  const queryClient = useQueryClient();

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false, // Don't retry if user fetch fails (user not logged in)
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    initialData: [],
  });

  const { data: catches = [] } = useQuery({ // Renamed to myCatches logically
    queryKey: ['catches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }, '-created_date') : [],
    enabled: !!user, // Only fetch if user is logged in
    initialData: [],
  });

  const { data: allCatches = [] } = useQuery({ // New query for all catches
    queryKey: ['allCatches'],
    queryFn: () => base44.entities.Catch.list('-created_date'), // Fetch all catches, sorted by creation date
  });

  // GPS 위치 가져오기
  const getUserLocation = () => {
    setLocationError("");
    setIsLoadingLocation(true);
    
    if (!navigator.geolocation) {
      setLocationError(t.locationUnsupported);
      setIsLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setIsLoadingLocation(false);
      },
      (error) => {
        let errorMessage = t.locationFailPrefix;
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += t.locationDenied;
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += t.locationUnavailable;
            break;
          case error.TIMEOUT:
            errorMessage += t.locationTimeout;
            break;
          default:
            errorMessage += t.locationUnknown;
        }
        
        setLocationError(errorMessage);
        setIsLoadingLocation(false);
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000, // 20초로 증가
        maximumAge: 30000 // 30초 이내의 캐시된 위치도 허용
      }
    );
  };

  // 페이지 로드 시 위치 가져오기
  useEffect(() => {
    getUserLocation();
  }, []);

  // 근처 축제 계산 - 중복 제거 로직 추가
  useEffect(() => {
    if (userLocation && festivals.length > 0) {
      // 축제 이름을 key로 하는 Map을 사용하여 중복 제거
      const festivalMap = new Map();
      
      festivals
        .filter(f => f.latitude && f.longitude && f.name) // 위치와 이름이 있는 축제만
        .forEach(festival => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            festival.latitude,
            festival.longitude
          );
          
          // 5km 이내만
          if (distance <= 5000) {
            const existingFestival = festivalMap.get(festival.name);
            
            // 같은 이름의 축제가 없거나, 기존 축제보다 더 가까우면 업데이트
            if (!existingFestival || distance < existingFestival.distance) {
              festivalMap.set(festival.name, { ...festival, distance });
            }
          }
        });
      
      // Map을 배열로 변환하고 거리순으로 정렬
      const nearby = Array.from(festivalMap.values())
        .sort((a, b) => a.distance - b.distance);
      
      setNearbyFestivals(nearby);
    }
  }, [userLocation, festivals]);

  const catchMutation = useMutation({
    mutationFn: async (festival) => {
      // Check if user is logged in before attempting to catch
      if (!user) {
        setShowLoginModal(true); // Show login modal instead of alert and redirect
        return; // Stop the mutation if not logged in
      }

      // Catch 생성
      await base44.entities.Catch.create({
        festival_id: festival.id,
        festival_name: festival.name,
        user_email: user.email,
        user_name: user.full_name,
        image_url: festival.thumbnail_url,
        location: `${festival.city}, ${festival.country}`,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });

      // 축제의 캐치 카운트 증가
      await base44.entities.Festival.update(festival.id, {
        catches_count: (festival.catches_count || 0) + 1
      });

      // 유저의 캐치 카운트 증가
      const currentCatches = user.catches_count || 0;
      await base44.auth.updateMe({ catches_count: currentCatches + 1 });

      return festival;
    },
    onSuccess: (festival) => {
      queryClient.invalidateQueries({ queryKey: ['catches'] });
      queryClient.invalidateQueries({ queryKey: ['allCatches'] }); // Invalidate all catches too
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      setCatchedFestival(festival);
      setShowSuccess(true);
      
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    },
    onError: (error) => {
        console.error("Catch mutation failed:", error);
        alert(t.catchError);
    }
  });

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname);
  };

  const handleCatch = (festival) => {
    if (festival.distance <= 500) {
      catchMutation.mutate(festival);
    }
  };

  const isCatched = (festivalId) => {
    return catches.some(c => c.festival_id === festivalId);
  };

  const handleShare = (platform) => {
    if (!catchedFestival) return;
    
    const text = `🎉 ${catchedFestival.name}에서 Catch 성공! #Festee #${catchedFestival.name}`;
    const url = window.location.origin + createPageUrl(`FestivalDetail?id=${catchedFestival.id}`); // Link to festival detail
    
    switch(platform) {
      case 'instagram':
        alert('Instagram 앱으로 이동하여 공유해주세요!');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
        break;
      default:
        break;
    }
  };

  // 표시할 축제는 최대 3개
  const displayedFestivals = nearbyFestivals.slice(0, 3);
  const hasMoreFestivals = nearbyFestivals.length > 3;

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message={t.loginMessage}
      />

      {/* Success Animation */}
      <AnimatePresence>
        {showSuccess && catchedFestival && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="text-center px-6"
            >
              <motion.div
                animate={{
                  rotate: [0, 360],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 1,
                  repeat: 2,
                }}
                className="text-8xl mb-4"
              >
                🎉
              </motion.div>
              <h2 className="text-white text-4xl font-bold mb-2">Catch!</h2>
              <p className="text-cyan-400 text-2xl mb-6">{catchedFestival.name}</p>
              
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex justify-center gap-4"
              >
                <button
                  onClick={() => handleShare('instagram')}
                  className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center hover:from-purple-600 hover:to-pink-600 transition-colors"
                >
                  <Instagram className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={() => handleShare('twitter')}
                  className="w-14 h-14 rounded-full bg-black border-2 border-white flex items-center justify-center hover:bg-gray-900 transition-colors"
                >
                  <XIcon className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={() => handleShare('facebook')}
                  className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors"
                >
                  <Facebook className="w-6 h-6 text-white" />
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-gray-800 px-6 py-8">
        <div className="text-center mb-6">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatDelay: 1,
            }}
          >
            <Target className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
          </motion.div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent mb-2">
            Catch
          </h1>
          <p className="text-gray-400">{t.headerDesc}</p>
        </div>

        {user && (
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-gray-400 text-sm mb-1">{t.myCatchCount}</p>
            <p className="text-cyan-400 text-3xl font-bold">{user.catches_count || 0}</p>
          </div>
        )}
      </div>

      {/* Location Status */}
      <div className="px-4 py-4">
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-cyan-400" />
              <span className="text-white font-bold">{t.myLocation}</span>
            </div>
            <Button
              onClick={getUserLocation}
              size="sm"
              variant="outline"
              className="border-gray-700 text-cyan-400 hover:bg-gray-800"
              disabled={isLoadingLocation}
            >
              {isLoadingLocation ? t.checking : t.refresh}
            </Button>
          </div>
          
          {isLoadingLocation && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-cyan-400" />
              {t.locationChecking}
            </div>
          )}
          
          {locationError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {locationError}
            </div>
          )}
          
          {userLocation && !isLoadingLocation && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              {t.locationOk}
            </div>
          )}
        </Card>
      </div>

      {/* Nearby Festivals */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-pink-500" />
            {t.nearbyTitle}
          </h2>
          {hasMoreFestivals && (
            <Link to={createPageUrl("NearbyCatch")}>
              <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                {t.more} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {!userLocation || isLoadingLocation ? (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <Navigation className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">{t.loadingLocation}</p>
          </Card>
        ) : displayedFestivals.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">{t.noNearby}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayedFestivals.map((festival) => {
              const canCatch = festival.distance <= 500;
              const alreadyCatched = isCatched(festival.id);
              const distanceKm = (festival.distance / 1000).toFixed(1);
              const distanceM = Math.round(festival.distance);
              
              return (
                <Card
                  key={festival.id}
                  className={`border transition-all ${
                    canCatch && !alreadyCatched
                      ? 'bg-gradient-to-r from-cyan-900/30 to-pink-900/30 border-cyan-400'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  <div className="p-3">
                    <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                      <div className="flex items-center gap-3 mb-2 cursor-pointer">
                        <img
                          src={festival.thumbnail_url}
                          alt={festival.name}
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-bold text-sm truncate mb-1 hover:text-cyan-400 transition-colors">
                            {getLocalizedContent(festival, 'name')}
                          </h3>
                          <p className="text-gray-400 text-xs mb-1 truncate">
                            {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              className={`text-xs ${
                                canCatch
                                  ? 'bg-green-500 text-white'
                                  : distanceM < 1000
                                  ? 'bg-yellow-500 text-black'
                                  : 'bg-gray-700 text-white'
                              }`}
                            >
                              {distanceM < 1000 ? `${distanceM}m` : `${distanceKm}km`}
                            </Badge>
                            {alreadyCatched && (
                              <Badge className="bg-cyan-500 text-white text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {t.done}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                    
                    {canCatch && !alreadyCatched ? (
                      <Button
                        onClick={(e) => {
                          e.preventDefault(); // Prevent Link navigation when button is clicked
                          handleCatch(festival);
                        }}
                        disabled={catchMutation.isLoading}
                        className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold h-10 text-sm"
                      >
                        {catchMutation.isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                            {t.catching}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            {t.catchNow}
                          </div>
                        )}
                      </Button>
                    ) : alreadyCatched ? (
                      <div className="w-full bg-gray-800 text-gray-400 font-bold h-10 rounded-lg flex items-center justify-center text-sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {t.alreadyCatched}
                      </div>
                    ) : (
                      <div className="w-full bg-gray-800 text-gray-400 font-bold h-10 rounded-lg flex items-center justify-center text-xs">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {distanceM < 1000 ? t.needCloserM(distanceM) : t.needCloserKm(distanceKm)}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Catch Explore & My History Tabs */}
      <div className="px-4 py-6">
        <div className="flex justify-center mb-6">
          <Button
            variant={activeTab === 'explore' ? 'default' : 'outline'}
            onClick={() => setActiveTab('explore')}
            className={`flex-1 rounded-r-none ${activeTab === 'explore' ? 'bg-cyan-500 text-white hover:bg-cyan-600' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
          >
            {t.allCatch}
          </Button>
          <Button
            variant={activeTab === 'my' ? 'default' : 'outline'}
            onClick={() => setActiveTab('my')}
            className={`flex-1 rounded-l-none ${activeTab === 'my' ? 'bg-cyan-500 text-white hover:bg-cyan-600' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
          >
            {t.myCatch(catches.length)}
          </Button>
        </div>

        {activeTab === "explore" && (
          <div className="space-y-4">
            {allCatches.length > 0 ? (
              allCatches.map((catchItem) => (
                <Card key={catchItem.id} className="bg-gray-900 border-gray-800 overflow-hidden">
                  <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)} className="block">
                    <img
                      src={catchItem.image_url}
                      alt={catchItem.festival_name}
                      className="w-full h-48 object-cover"
                    />
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${catchItem.user_email}`}
                          alt={catchItem.user_name}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <p className="text-white font-bold text-sm">{catchItem.user_name}</p>
                          <p className="text-gray-500 text-xs">{safeFormatDate(catchItem.created_date, 'yyyy.MM.dd')}</p>
                        </div>
                      </div>
                      {/* Likes placeholder removed as it's not core functionality */}
                    </div>
                    <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)}>
                      <h3 className="text-white font-bold text-lg mb-1 hover:text-cyan-400 transition-colors">{catchItem.festival_name}</h3>
                      <p className="text-gray-400 text-sm">{catchItem.location}</p>
                    </Link>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 mb-3">{t.noCatches}</p>
                <p className="text-gray-600 text-sm">{t.beFirst}</p>
              </Card>
            )}
          </div>
        )}

        {activeTab === "my" && (
          user ? (
            catches.length > 0 ? (
              <div className="space-y-4">
                {catches.map((catchItem) => (
                  <Card key={catchItem.id} className="bg-gray-900 border-gray-800 overflow-hidden">
                    <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)} className="block">
                      <img
                        src={catchItem.image_url}
                        alt={catchItem.festival_name}
                        className="w-full h-48 object-cover"
                      />
                    </Link>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-gray-500 text-xs">{safeFormatDate(catchItem.created_date, 'yyyy.MM.dd HH:mm')}</p>
                        </div>
                        {/* Likes placeholder removed as it's not core functionality */}
                      </div>
                      <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)}>
                        <h3 className="text-white font-bold text-lg mb-1 hover:text-cyan-400 transition-colors">{catchItem.festival_name}</h3>
                        <p className="text-gray-400 text-sm">{catchItem.location}</p>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 mb-3">{t.noMyCatch}</p>
                <p className="text-gray-600 text-sm">{t.beFirst}</p>
              </Card>
            )
          ) : (
            <Card className="bg-gray-900 border-gray-800 p-12 text-center">
              <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 mb-3">{t.loginForHistory}</p>
              <Button
                  onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold"
              >
                  {t.login}
              </Button>
            </Card>
          )
        )}
      </div>

      <Card className="mx-4 mb-6 bg-gray-900 border-gray-800 p-6">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          {t.infoTitle}
        </h3>
        <ul className="text-gray-300 text-sm space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">1.</span>
            <span>{t.infoStep1}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">2.</span>
            <span>{t.infoStep2}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">3.</span>
            <span>{t.infoStep3}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold">4.</span>
            <span>{t.infoStep4}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}