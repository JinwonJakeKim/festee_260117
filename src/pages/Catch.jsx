import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation, CheckCircle, AlertCircle, Target, Trophy, Instagram, Facebook } from "lucide-react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LoginPromptModal from "../components/LoginPromptModal";
import { useLanguage } from "@/lib/useLanguage";
import { catchTranslations } from "@/lib/catchTranslations";

export default function Catch() {
  const { language } = useLanguage();
  const t = catchTranslations[language] || catchTranslations.ko;

  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [catchedFestival, setCatchedFestival] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
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

  const { data: catches = [] } = useQuery({ // Renamed to myCatches logically
    queryKey: ['catches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }, '-created_date') : [],
    enabled: !!user, // Only fetch if user is logged in
    initialData: [],
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

      {/* My Catch History - Festival Card Format */}
      <div className="px-4 py-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-cyan-400" />
          {t.myCatch(catches.length)}
        </h2>

        {user ? (
          catches.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {catches.map((catchItem) => (
                <Link
                  key={catchItem.id}
                  to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)}
                  className="block"
                >
                  <div className="relative rounded-xl overflow-hidden group">
                    <div className="relative aspect-[3/4]">
                      <img
                        src={catchItem.image_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
                        alt={catchItem.festival_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white text-base font-bold mb-1 line-clamp-2">
                          {catchItem.festival_name}
                        </h3>
                        <p className="text-gray-300 text-xs">{catchItem.location}</p>
                      </div>
                    </div>
                  </div>
                </Link>
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