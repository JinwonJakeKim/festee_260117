import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, MapPin, Check, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// 도시별 중심 좌표 및 반경 (km)
const cityCoordinates = {
  "서울": { lat: 37.5665, lng: 126.9780, radius: 30 },
  "부산": { lat: 35.1796, lng: 129.0756, radius: 25 },
  "도쿄": { lat: 35.6762, lng: 139.6503, radius: 40 },
  "오사카": { lat: 34.6937, lng: 135.5023, radius: 30 },
  "베이징": { lat: 39.9042, lng: 116.4074, radius: 50 },
  "상하이": { lat: 31.2304, lng: 121.4737, radius: 40 },
  "홍콩": { lat: 22.3193, lng: 114.1694, radius: 20 },
  "타이베이": { lat: 25.0330, lng: 121.5654, radius: 25 },
  "방콕": { lat: 13.7563, lng: 100.5018, radius: 35 },
  "싱가포르": { lat: 1.3521, lng: 103.8198, radius: 20 },
  "뉴욕": { lat: 40.7128, lng: -74.0060, radius: 40 },
  "로스앤젤레스": { lat: 34.0522, lng: -118.2437, radius: 50 },
  "런던": { lat: 51.5074, lng: -0.1278, radius: 35 },
  "파리": { lat: 48.8566, lng: 2.3522, radius: 30 },
  "베를린": { lat: 52.5200, lng: 13.4050, radius: 30 },
  "암스테르담": { lat: 52.3676, lng: 4.9041, radius: 20 },
};

// 두 좌표 간 거리 계산 (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function SelectCity() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const majorCities = [
    { name: "서울", country: "한국", emoji: "🇰🇷" },
    { name: "부산", country: "한국", emoji: "🇰🇷" },
    { name: "도쿄", country: "일본", emoji: "🇯🇵" },
    { name: "오사카", country: "일본", emoji: "🇯🇵" },
    { name: "베이징", country: "중국", emoji: "🇨🇳" },
    { name: "상하이", country: "중국", emoji: "🇨🇳" },
    { name: "홍콩", country: "중국", emoji: "🇭🇰" },
    { name: "타이베이", country: "대만", emoji: "🇹🇼" },
    { name: "방콕", country: "태국", emoji: "🇹🇭" },
    { name: "싱가포르", country: "싱가포르", emoji: "🇸🇬" },
    { name: "뉴욕", country: "미국", emoji: "🇺🇸" },
    { name: "로스앤젤레스", country: "미국", emoji: "🇺🇸" },
    { name: "런던", country: "영국", emoji: "🇬🇧" },
    { name: "파리", country: "프랑스", emoji: "🇫🇷" },
    { name: "베를린", country: "독일", emoji: "🇩🇪" },
    { name: "암스테르담", country: "네덜란드", emoji: "🇳🇱" },
  ];

  const filteredCities = majorCities.filter(city =>
    city.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    city.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateCityMutation = useMutation({
    mutationFn: async ({ city, verified }) => {
      const updateData = { 
        home_city: city,
        city_verified: verified
      };
      
      if (verified) {
        updateData.city_verified_date = new Date().toISOString();
      }
      
      await base44.auth.updateMe(updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      navigate(-1);
    },
  });

  const getUserLocation = () => {
    setLocationError("");
    
    if (!navigator.geolocation) {
      setLocationError("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
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
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000, // 20초로 증가
        maximumAge: 30000 // 30초 이내의 캐시된 위치도 허용
      }
    );
  };

  const handleSelectCity = (cityName) => {
    setSelectedCity(cityName);
    
    // GPS 위치 확인
    if (userLocation && cityCoordinates[cityName]) {
      const cityCoord = cityCoordinates[cityName];
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        cityCoord.lat,
        cityCoord.lng
      );
      
      const isWithinCity = distance <= cityCoord.radius;
      
      if (isWithinCity) {
        // 도시 내에 있으면 인증 완료
        updateCityMutation.mutate({ city: cityName, verified: true });
      } else {
        // 도시 밖에 있으면 인증 없이 등록만
        const confirmMessage = `현재 위치가 ${cityName}에서 ${Math.round(distance)}km 떨어져 있습니다.\n도시 인증 없이 등록하시겠습니까?\n\n※ 같이가기 게시글 작성을 위해서는 도시 인증이 필요합니다.`;
        if (confirm(confirmMessage)) {
          updateCityMutation.mutate({ city: cityName, verified: false });
        }
      }
    } else {
      // GPS 위치가 없으면 인증 없이 등록
      const confirmMessage = "위치 정보가 없어 도시 인증을 할 수 없습니다.\n도시 인증 없이 등록하시겠습니까?\n\n※ 같이가기 게시글 작성을 위해서는 나중에 도시 인증이 필요합니다.";
      if (confirm(confirmMessage)) {
        updateCityMutation.mutate({ city: cityName, verified: false });
      }
    }
  };

  useEffect(() => {
    getUserLocation();
  }, []);

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">거주 도시 선택</h1>
        </div>
        <div className="relative mb-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="도시 검색..."
            className="bg-gray-900 border-gray-800 text-white"
          />
        </div>
        
        {/* Location Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-gray-400">
              {userLocation ? "위치 확인 완료" : "위치 확인 중..."}
            </span>
          </div>
          {!userLocation && !locationError && (
            <Button
              onClick={getUserLocation}
              size="sm"
              variant="outline"
              className="text-xs border-gray-700 text-cyan-400"
            >
              위치 재시도
            </Button>
          )}
        </div>
        
        {locationError && (
          <p className="text-red-400 text-xs mt-2">{locationError}</p>
        )}
      </div>

      <div className="px-4 py-6">
        <div className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border border-cyan-400/30 rounded-lg p-4 mb-6">
          <p className="text-white text-sm mb-2">
            💡 도시 인증이란?
          </p>
          <p className="text-gray-400 text-xs mb-2">
            GPS로 실제 그 도시에 거주하고 있음을 확인하는 기능입니다.
          </p>
          <p className="text-cyan-400 text-xs">
            ✓ 도시 인증 완료 시 같이가기 게시글 작성 가능<br />
            ✓ 인증된 사용자는 프로필에 뱃지 표시<br />
            ✓ 신뢰성 있는 커뮤니티 조성
          </p>
        </div>

        <div className="space-y-2">
          {filteredCities.map((city) => {
            const isSelected = user?.home_city === city.name;
            const isVerified = isSelected && user?.city_verified;
            
            return (
              <button
                key={city.name}
                onClick={() => handleSelectCity(city.name)}
                disabled={updateCityMutation.isLoading}
                className="w-full"
              >
                <Card className={`border-gray-800 hover:border-cyan-400/50 transition-all p-4 ${
                  isSelected ? 'bg-cyan-900/20 border-cyan-400' : 'bg-gray-900'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{city.emoji}</span>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-bold">{city.name}</p>
                          {isVerified && (
                            <Badge className="bg-cyan-500 text-white text-xs">
                              인증됨
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">{city.country}</p>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-6 h-6 text-cyan-400" />
                    )}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}