
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Navigation, MapPin, CheckCircle, AlertCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// 두 좌표 간 거리 계산
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function NearbyCatch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [nearbyFestivals, setNearbyFestivals] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    initialData: [],
  });

  const { data: catches } = useQuery({
    queryKey: ['catches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const getUserLocation = () => {
    setLocationError("");
    setIsLoadingLocation(true);
    
    if (!navigator.geolocation) {
      setLocationError("이 브라우저는 위치 서비스를 지원하지 않습니다.");
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
        let errorMessage = "위치 정보를 가져올 수 없습니다. ";
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += "위치 권한을 허용해주세요.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += "위치 정보를 사용할 수 없습니다.";
            break;
          case error.TIMEOUT:
            errorMessage += "위치 확인 시간이 초과되었습니다. 다시 시도해주세요.";
            break;
          default:
            errorMessage += "알 수 없는 오류가 발생했습니다.";
        }
        
        setLocationError(errorMessage);
        setIsLoadingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000, // 20초로 증가
        maximumAge: 30000 // 30초 이내의 캐시된 위치도 허용
      }
    );
  };

  useEffect(() => {
    getUserLocation();
  }, []);

  useEffect(() => {
    if (userLocation && festivals.length > 0) {
      const nearby = festivals
        .filter(f => f.latitude && f.longitude)
        .map(festival => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            festival.latitude,
            festival.longitude
          );
          return { ...festival, distance };
        })
        .filter(festival => festival.distance <= 100000) // 100km = 100,000m 이내만
        .sort((a, b) => a.distance - b.distance);
      
      setNearbyFestivals(nearby);
    }
  }, [userLocation, festivals]);

  const catchMutation = useMutation({
    mutationFn: async (festival) => {
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

      await base44.entities.Festival.update(festival.id, {
        catches_count: (festival.catches_count || 0) + 1
      });

      const currentCatches = user.catches_count || 0;
      await base44.auth.updateMe({ catches_count: currentCatches + 1 });

      return festival;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catches'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('Catch 성공! 🎉');
    },
  });

  const handleCatch = (festival) => {
    if (festival.distance <= 500) {
      catchMutation.mutate(festival);
    }
  };

  const isCatched = (festivalId) => {
    return catches.some(c => c.festival_id === festivalId);
  };

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">근처 축제 전체보기 (100km 이내)</h1>
        </div>

        <Card className="bg-gray-900 border-gray-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-cyan-400" />
              <span className="text-white text-sm font-medium">내 위치</span>
            </div>
            <Button
              onClick={getUserLocation}
              size="sm"
              variant="outline"
              className="border-gray-700 text-cyan-400 hover:bg-gray-800 h-8 text-xs"
              disabled={isLoadingLocation}
            >
              {isLoadingLocation ? "확인 중..." : "새로고침"}
            </Button>
          </div>
        </Card>
      </div>

      <div className="px-4 py-4">
        {!userLocation || isLoadingLocation ? (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <Navigation className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">위치 정보를 확인하는 중입니다...</p>
            {locationError && (
              <p className="text-red-400 text-sm mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4" /> {locationError}
              </p>
            )}
          </Card>
        ) : nearbyFestivals.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">100km 이내에 축제가 없습니다</p>
          </Card>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-gray-400 text-sm">
                총 <span className="text-cyan-400 font-bold">{nearbyFestivals.length}</span>개의 축제
              </p>
            </div>

            <div className="space-y-3">
              {nearbyFestivals.map((festival) => {
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
                      <div className="flex items-center gap-3 mb-2">
                        <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)} className="flex-shrink-0">
                          <img
                            src={festival.thumbnail_url}
                            alt={festival.name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                            <h3 className="text-white font-bold text-sm mb-1 truncate hover:text-cyan-400 transition-colors">
                              {festival.name}
                            </h3>
                          </Link>
                          <p className="text-gray-400 text-xs mb-1 truncate">
                            {festival.city}, {festival.country}
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
                                완료
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {canCatch && !alreadyCatched ? (
                        <Button
                          onClick={() => handleCatch(festival)}
                          disabled={catchMutation.isLoading}
                          className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold h-10 text-sm"
                        >
                          {catchMutation.isLoading ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                              인증 중...
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4" />
                              지금 Catch 하기!
                            </div>
                          )}
                        </Button>
                      ) : alreadyCatched ? (
                        <div className="w-full bg-gray-800 text-gray-400 font-bold h-10 rounded-lg flex items-center justify-center text-sm">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          이미 인증한 축제입니다
                        </div>
                      ) : (
                        <div className="w-full bg-gray-800 text-gray-400 font-bold h-10 rounded-lg flex items-center justify-center text-xs">
                          <AlertCircle className="w-4 h-4 mr-2" />
                          {distanceM < 1000
                            ? `${distanceM}m 더 가까이 가야 합니다`
                            : `${distanceKm}km 떨어져 있습니다`}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
