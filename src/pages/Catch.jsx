import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation, CheckCircle, AlertCircle, Target, Trophy, Share2, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import LoginPromptModal from "../components/LoginPromptModal";
import { useLanguage } from "@/lib/useLanguage";
import { catchTranslations } from "@/lib/catchTranslations";
import FestivalListItem from "@/components/FestivalListItem";
import CatchHistoryCardStack from "@/components/CatchHistoryCardStack";
import NearbyFestivalsSection from "@/components/NearbyFestivalsSection";
import { proxyImages } from "@/functions/proxyImages";
import { reverseGeocode } from "@/functions/reverseGeocode";

export default function Catch() {
  const { language, getLocalizedContent } = useLanguage();
  const t = catchTranslations[language] || catchTranslations.ko;

  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationAddress, setLocationAddress] = useState("");
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
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

  const { data: festivals = [] } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list('-popularity', 500),
    staleTime: 1000 * 60 * 5,
  });

  const { data: myLikes = [] } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const likeMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (!user) {
        setShowLoginModal(true);
        return;
      }
      const existing = myLikes.find(like => like.festival_id === festivalId);
      if (existing) {
        await base44.entities.FestivalLike.delete(existing.id);
        const festival = festivals.find(f => f.id === festivalId);
        await base44.entities.Festival.update(festivalId, {
          likes_count: Math.max(0, (festival?.likes_count || 0) - 1)
        });
      } else {
        await base44.entities.FestivalLike.create({ festival_id: festivalId, user_email: user.email });
        const festival = festivals.find(f => f.id === festivalId);
        await base44.entities.Festival.update(festivalId, {
          likes_count: (festival?.likes_count || 0) + 1
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
    },
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
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ latitude: lat, longitude: lng });
        setIsLoadingLocation(false);

        // Reverse geocoding으로 주소 변환
        setIsLoadingAddress(true);
        setLocationAddress("");
        try {
          const res = await reverseGeocode({ lat, lng, language });
          const data = res.data || res;
          if (data.success && data.address) {
            setLocationAddress(data.address);
          } else {
            setLocationAddress("");
          }
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
          setLocationAddress("");
        } finally {
          setIsLoadingAddress(false);
        }
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
        setIsLoadingAddress(false);
        setLocationAddress("");
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
        festival_name: getLocalizedContent(festival, 'name'),
        user_email: user.email,
        user_name: user.nickname || user.full_name,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catches'] });
      queryClient.invalidateQueries({ queryKey: ['allCatches'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
    },
    onError: (error) => {
        console.error("Catch mutation failed:", error);
        alert(t.catchError);
    }
  });

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname);
  };

  const handleShareCatch = async () => {
    const latestCatch = catches[0];
    if (!latestCatch) return;
    const festival = festivals.find(f => f.id === latestCatch.festival_id);
    const name = festival ? getLocalizedContent(festival, 'name') : latestCatch.festival_name;
    const text = `🎉 ${name}에서 Catch 성공! #Festee`;
    const url = window.location.origin + createPageUrl(`FestivalDetail?id=${latestCatch.festival_id}`);

    if (navigator.share) {
      try {
        await navigator.share({ text, url });
      } catch (e) { /* cancelled */ }
    } else {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    }
  };

  const handleDownloadImage = async () => {
    const containerEl = document.getElementById('catch-history-container');
    if (!containerEl) return;
    try {
      const images = Array.from(containerEl.querySelectorAll('img'));
      const originalSrcs = images.map((img) => img.src);
      const urlsToConvert = originalSrcs.filter((src) => src && !src.startsWith('data:'));

      // 백엔드 함수로 모든 이미지를 한 번에 base64로 변환
      if (urlsToConvert.length > 0) {
        const res = await proxyImages({ urls: urlsToConvert });
        const urlToDataUrl = new Map();
        (res.data?.results || []).forEach((r) => {
          if (r.dataUrl) urlToDataUrl.set(r.url, r.dataUrl);
        });
        images.forEach((img) => {
          const dataUrl = urlToDataUrl.get(img.src);
          if (dataUrl) img.src = dataUrl;
        });
      }

      // 변환된 이미지 로드 대기
      await Promise.all(images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 5000);
        });
      }));

      const canvas = await html2canvas(containerEl, {
        backgroundColor: '#211e1b',
        scale: 2,
        useCORS: false,
        allowTaint: false,
        imageTimeout: 15000,
        logging: false,
      });

      // 원본 src 복원
      images.forEach((img, i) => {
        if (originalSrcs[i]) img.src = originalSrcs[i];
      });

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${catches[0]?.festival_name || 'festee-catch'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Download failed:', e);
      alert(t?.downloadError || '이미지 저장에 실패했습니다.');
    }
  };

  // 캐치한 축제들을 FestivalListItem용 축제 객체로 변환
  const catchFestivals = useMemo(() => {
    const festivalMap = new Map();
    festivals.forEach(f => festivalMap.set(f.id, f));
    return catches
      .map(c => {
        const festival = festivalMap.get(c.festival_id);
        if (festival) return festival;
        // 삭제된 축제인 경우 캐치 데이터로 폴백 객체 생성
        const [city, ...countryParts] = (c.location || '').split(', ');
        const country = countryParts.join(', ');
        return {
          id: c.festival_id,
          name_ko: c.festival_name,
          name_en: c.festival_name,
          name_jp: c.festival_name,
          name_zh: c.festival_name,
          thumbnail_url: c.image_url,
          city,
          country,
          city_ko: city,
          country_ko: country,
          likes_count: 0,
        };
      })
      .filter(Boolean);
  }, [catches, festivals]);

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message={t.loginMessage}
      />

      {/* History Card Stack or Header */}
      {user ? (
        <CatchHistoryCardStack
          catches={catches}
          festivals={festivals}
          catchCount={user.catches_count || catches.length}
          emptyMessage={t.emptyCardMessage}
        />
      ) : (
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
        </div>
      )}

      {/* Download Button */}
      {user && catches.length > 0 && (
        <div className="px-4 py-3">
          <Button
            onClick={handleDownloadImage}
            className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold border-none"
          >
            <Download className="w-4 h-4 mr-2" />
            {t.downloadImage}
          </Button>
        </div>
      )}

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
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                {t.locationOk}
              </div>
              {isLoadingAddress && (
                <div className="flex items-center gap-2 text-gray-400 text-xs pl-6">
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-cyan-400" />
                  {t.addressLoading}
                </div>
              )}
              {!isLoadingAddress && locationAddress && (
                <div className="flex items-start gap-2 text-white text-sm pl-6">
                  <Navigation className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="font-medium">{locationAddress}</span>
                </div>
              )}
              {!isLoadingAddress && !locationAddress && userLocation && (
                <div className="text-gray-500 text-xs pl-6">
                  {t.addressFallback(userLocation.latitude, userLocation.longitude)}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Nearby Festivals - Catch Section */}
      <NearbyFestivalsSection
        userLocation={userLocation}
        festivals={festivals}
        catches={catches}
        onCatch={catchMutation.mutate}
        isCatching={catchMutation.isPending}
        t={t}
      />

      {/* My Catch History - Festival Card Format */}
      <div className="px-4 py-6">
        <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-cyan-400" />
          {t.myCatch(catches.length)}
        </h2>

        {user ? (
          catchFestivals.length > 0 ? (
            <div className="space-y-1">
              {catchFestivals.map((festival, i) => (
                <FestivalListItem
                  key={festival.id}
                  festival={festival}
                  index={i}
                  isLiked={myLikes.some(like => like.festival_id === festival.id)}
                  onLike={(id) => likeMutation.mutate(id)}
                  getLocalizedContent={getLocalizedContent}
                  language={language}
                />
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