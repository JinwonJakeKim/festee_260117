import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { APIProvider, Map as GoogleMap, Marker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Heart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import DateRangeBottomSheet from "@/components/DateRangeBottomSheet";
import { useLanguage } from "@/lib/useLanguage";
import { mapTranslations } from "@/lib/mapTranslations";
import CategoryMultiSelect from "@/components/CategoryMultiSelect";

const FESTIVAL_MARKER_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCAzMCA0NSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cGF0aCBkPSJNMTUgMEMxMC4xIDAgNiA0LjEgNiA5YzAgNS4yIDkgMjAgOSAyMHM5LTE0LjggOS0yMGMwLTQuOS00LjEtOS05LTl6bTAgMTJjLTEuNyAwLTMtMS4zLTMtM3MxLjMtMyAzLTMgMyAxLjMgMyAzLTEuMyAzLTMgM3oiIGZpbGw9IiNFRjQ0NDQiLz4KPC9zdmc+';

const USER_LOCATION_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjMDA5OEZGIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=';

const DEFAULT_CENTER = { lat: 20, lng: 0 };
const DEFAULT_ZOOM = 13;

const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return format(date, formatString, { locale: ko });
  } catch (e) {
    return '';
  }
};

// mapMoveRequest 변경 시 지도를 해당 좌표(및 zoom)로 이동시킴
function MapMoveController({ request }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !request?.center) return;
    const [lat, lng] = request.center;
    map.panTo({ lat, lng });
    if (request.zoom) map.setZoom(request.zoom);
  }, [request, map]);
  return null;
}

function LocateButton({ onLocate, isLocating }) {
  return (
    <button
      onClick={onLocate}
      disabled={isLocating}
      className="absolute z-20"
      style={{
        top: '64px',
        right: '10px',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: '#fff',
        border: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isLocating ? 'wait' : 'pointer',
        opacity: isLocating ? 0.65 : 1,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3.5" fill="#0098FF"/>
        <circle cx="12" cy="12" r="6.5" stroke="#0098FF" strokeWidth="2" fill="none"/>
        <line x1="12" y1="2" x2="12" y2="5.5" stroke="#0098FF" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="18.5" x2="12" y2="22" stroke="#0098FF" strokeWidth="2" strokeLinecap="round"/>
        <line x1="2" y1="12" x2="5.5" y2="12" stroke="#0098FF" strokeWidth="2" strokeLinecap="round"/>
        <line x1="18.5" y1="12" x2="22" y2="12" stroke="#0098FF" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

const getFestivalName = (festival, language = 'ko') => {
  if (language === 'en') return festival.name_en || festival.name_ko || festival.name_original || festival.name || '';
  if (language === 'ja') return festival.name_jp || festival.name_ko || festival.name_original || festival.name || '';
  if (language === 'zh') return festival.name_zh || festival.name_ko || festival.name_original || festival.name || '';
  return festival.name_ko || festival.name_original || festival.name_en || festival.name || '';
};

const getLocalizedCity = (festival, language = 'ko') => {
  if (language === 'en') return festival.city_en || festival.city || '';
  if (language === 'ja') return festival.city_jp || festival.city_en || festival.city || '';
  if (language === 'zh') return festival.city_zh || festival.city_en || festival.city || '';
  return festival.city_ko || festival.city_en || festival.city || '';
};

const getLocalizedCountry = (festival, language = 'ko') => {
  if (language === 'en') return festival.country_en || festival.country || '';
  if (language === 'ja') return festival.country_jp || festival.country_en || festival.country || '';
  if (language === 'zh') return festival.country_zh || festival.country_en || festival.country || '';
  return festival.country_ko || festival.country_en || festival.country || '';
};

const removeDuplicateFestivals = (festivals) => {
  const festivalMap = new Map();

  festivals.forEach(festival => {
    const key = getFestivalName(festival);
    if (!key) return; // 이름 없는 경우 스킵
    const existing = festivalMap.get(key);

    if (!existing) {
      festivalMap.set(key, festival);
    } else {
      const existingScore = calculateInfoScore(existing);
      const currentScore = calculateInfoScore(festival);

      if (currentScore > existingScore) {
        festivalMap.set(key, festival);
      }
    }
  });

  return Array.from(festivalMap.values());
};

const calculateInfoScore = (festival) => {
  let score = 0;
  if (festival.description) score += 1;
  if (festival.thumbnail_url) score += 1;
  if (festival.video_url) score += 1;
  if (festival.website) score += 1;
  if (festival.highlights?.length > 0) score += 2;
  if (festival.lineup?.length > 0) score += 2;
  if (festival.tags?.length > 0) score += festival.tags.length * 0.5;
  if (festival.price && festival.price > 0) score += 1;
  if (festival.latitude && festival.longitude) score += 1;
  return score;
};

export default function FestivalMap() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = mapTranslations[language] || mapTranslations.ko;
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [mapMoveRequest, setMapMoveRequest] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedFestival, setSelectedFestival] = useState(null);
  const [selectedUserMarker, setSelectedUserMarker] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const toggleCategory = (category) => setSelectedCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: festivalsData, isLoading } = useQuery({
    queryKey: ['festivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list();
      return removeDuplicateFestivals(allFestivals);
    },
  });
  const festivals = festivalsData || [];

  const { data: mapsKeyResult, isLoading: isLoadingMapsKey } = useQuery({
    queryKey: ['googleMapsApiKey'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getGoogleMapsApiKey', {});
      return res.data;
    },
    staleTime: Infinity,
  });
  const mapsApiKey = mapsKeyResult?.success ? mapsKeyResult.apiKey : null;

  const categories = [...new Set(festivals.map(f => f.category).filter(Boolean))];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const festivalsWithLocation = festivals.filter(f => {
    if (!f.latitude || !f.longitude) return false;
    if (f.end_date && new Date(f.end_date) < today) return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(f.category)) return false;
    if (dateRange.from && dateRange.to) {
      const start = new Date(f.start_date);
      const end = new Date(f.end_date);
      const filterFrom = new Date(dateRange.from);
      const filterTo = new Date(dateRange.to);
      if (end < filterFrom || start > filterTo) return false;
    }
    return true;
  });

  const isLocatingRef = useRef(false);

  // 현재 위치 요청: 고정밀 우선 요청 → TIMEOUT/POSITION_UNAVAILABLE 시 저정밀 fallback
  const requestUserLocation = React.useCallback(({ showError = false } = {}) => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported", {
        code: null,
        message: "navigator.geolocation is unavailable",
      });
      if (showError) alert(t.locationError);
      return;
    }
    if (isLocatingRef.current) return; // 중복 요청 방지
    isLocatingRef.current = true;
    setIsLocating(true);

    const finish = () => {
      isLocatingRef.current = false;
      setIsLocating(false);
    };

    const onSuccess = (position) => {
      const { latitude, longitude } = position.coords;
      setUserLocation([latitude, longitude]);
      setMapMoveRequest({ center: [latitude, longitude], zoom: 13 });
      finish();
    };

    const handleFinalError = (error, useHighAccuracy) => {
      console.error("Geolocation request failed", {
        code: error.code,
        message: error.message,
        enableHighAccuracy: useHighAccuracy,
      });
      finish();

      if (!showError) return;

      if (error.code === error.PERMISSION_DENIED) {
        alert(t.locationPermissionDenied);
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        alert(t.locationUnavailable);
      } else if (error.code === error.TIMEOUT) {
        alert(t.locationTimeout);
      } else {
        alert(t.locationError);
      }
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        console.error("Geolocation request failed", {
          code: error.code,
          message: error.message,
          enableHighAccuracy: true,
        });

        if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (fallbackError) => handleFinalError(fallbackError, false),
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
          );
        } else {
          handleFinalError(error, true);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [t]);

  React.useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await base44.functions.invoke("geocodePlace", {
  query: searchQuery
});
      if (result?.data?.success) {
        setMapMoveRequest({ center: [result.data.latitude, result.data.longitude], zoom: null });
      } else {
        alert(t.searchError);
      }
    } catch (e) {
      alert(t.searchFail);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-black isolate">
      <div className="bg-black border-b border-gray-800 py-3 px-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t.searchPlaceholder}
              className="festival-map-search-input w-full bg-gray-900 border-gray-800 text-white placeholder:text-gray-500 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-cyan-400 text-xs font-bold disabled:opacity-50"
              >
                {isSearching ? t.searching : t.go}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CategoryMultiSelect
            categories={categories}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            label={t.categoryLabel}
          />

          <button
            onClick={() => setIsDatePickerOpen(true)}
            className={`px-4 h-9 rounded-full whitespace-nowrap flex items-center gap-2 text-xs hover:bg-gray-800 transition-colors border ${dateRange.from && dateRange.to ? "bg-pink-500/20 border-pink-400 text-pink-400" : "bg-gray-900 border-gray-800 text-white"}`}
          >
            <Calendar className="w-4 h-4 text-pink-500" />
            <span>{dateRange.from && dateRange.to ? `${safeFormatDate(dateRange.from, 'M/d')}~${safeFormatDate(dateRange.to, 'M/d')}` : t.dateLabel}</span>
          </button>

          <DateRangeBottomSheet
            isOpen={isDatePickerOpen}
            onClose={() => setIsDatePickerOpen(false)}
            dateRange={dateRange}
            onApply={(range) => setDateRange(range)}
          />
        </div>
      </div>

      <div className="flex-1 relative" style={{ height: 'calc(100vh - 220px)' }}>
        {isLoading || isLoadingMapsKey ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
          </div>
        ) : !mapsApiKey ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <Card className="bg-gray-800 border-gray-700 p-8 text-center">
              <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">{t.mapLoadError}</p>
            </Card>
          </div>
        ) : festivalsWithLocation.length > 0 ? (
          <APIProvider apiKey={mapsApiKey}>
            <GoogleMap
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
              gestureHandling="greedy"
              disableDefaultUI={false}
              style={{ width: '100%', height: '100%' }}
              onClick={() => { setSelectedFestival(null); setSelectedUserMarker(false); }}
            >
              <MapMoveController request={mapMoveRequest} />

              {userLocation && (
                <Marker
                  position={{ lat: userLocation[0], lng: userLocation[1] }}
                  icon={USER_LOCATION_ICON}
                  onClick={() => setSelectedUserMarker(true)}
                />
              )}

              {selectedUserMarker && userLocation && (
                <InfoWindow
                  position={{ lat: userLocation[0], lng: userLocation[1] }}
                  onCloseClick={() => setSelectedUserMarker(false)}
                >
                  <div className="bg-gray-900 p-2 rounded">
                    <p className="text-white text-sm font-bold">{t.myLocation}</p>
                  </div>
                </InfoWindow>
              )}

              {festivalsWithLocation.map((festival) => (
                <Marker
                  key={festival.id}
                  position={{ lat: festival.latitude, lng: festival.longitude }}
                  icon={FESTIVAL_MARKER_ICON}
                  onClick={() => setSelectedFestival(festival)}
                />
              ))}

              {selectedFestival && (
                <InfoWindow
                  position={{ lat: selectedFestival.latitude, lng: selectedFestival.longitude }}
                  onCloseClick={() => setSelectedFestival(null)}
                >
                  <Link to={createPageUrl(`FestivalDetail?id=${selectedFestival.id}`)}>
                    <div className="min-w-[200px] bg-gray-900 p-3 rounded-lg">
                      {selectedFestival.thumbnail_url && (
                        <img
                          src={selectedFestival.thumbnail_url}
                          alt={getFestivalName(selectedFestival, language)}
                          className="w-full h-32 object-cover rounded-lg mb-2"
                        />
                      )}
                      <h3 className="font-bold text-base mb-2 text-white">{getFestivalName(selectedFestival, language)}</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <MapPin className="w-4 h-4 text-cyan-400" />
                          {getLocalizedCity(selectedFestival, language)}, {getLocalizedCountry(selectedFestival, language)}
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Calendar className="w-4 h-4 text-pink-500" />
                          {safeFormatDate(selectedFestival.start_date, language === 'ko' ? 'M월 d일' : 'MMM d')}
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Heart className="w-4 h-4 text-pink-500" />
                          {selectedFestival.likes_count || 0} {t.likes}
                        </div>
                      </div>
                      <Badge className="mt-2 bg-cyan-500 text-white">
                        {language === 'en' ? selectedFestival.category_en || selectedFestival.category
                          : language === 'ja' ? selectedFestival.category_jp || selectedFestival.category
                          : language === 'zh' ? selectedFestival.category_zh || selectedFestival.category
                          : selectedFestival.category}
                      </Badge>
                    </div>
                  </Link>
                </InfoWindow>
              )}

              <LocateButton
                onLocate={() => requestUserLocation({ showError: true })}
                isLocating={isLocating}
              />
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <Card className="bg-gray-800 border-gray-700 p-8 text-center">
              <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">{t.noFestivals}</p>
            </Card>
          </div>
        )}
      </div>

      <div className="bg-black border-t border-gray-800 px-4 py-3 mb-20 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="text-white text-sm">{t.festivalMarker}</span>
            </div>
            <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <span className="text-white text-sm">{t.myLocation}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-cyan-400 border-cyan-400">
            {t.festivalsCount(festivalsWithLocation.length)}
          </Badge>
        </div>
      </div>
      <style jsx global>{`
        .festival-map-search-input {
          padding-left: 3rem !important;
          padding-right: 4rem !important;
        }
      `}</style>
    </div>
  );
}
