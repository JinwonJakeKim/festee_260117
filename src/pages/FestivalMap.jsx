import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Heart, Search, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { geocodePlace } from "@/functions/geocodePlace";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import DateRangeBottomSheet from "@/components/DateRangeBottomSheet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

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

const festivalIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCAzMCA0NSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cGF0aCBkPSJNMTUgMEMxMC4xIDAgNiA0LjEgNiA5YzAgNS4yIDkgMjAgOSAyMHM5LTE0LjggOS0yMGMwLTQuOS00LjEtOS05LTl6bTAgMTJjLTEuNyAwLTMtMS4zLTMtM3MxLjMtMyAzLTMgMyAxLjMgMyAzLTEuMyAzLTMgM3oiIGZpbGw9IiNFRjQ0NDQiLz4KPC9zdmc+',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -45],
});


function MapController({ center }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

function LocateButton({ userLocation, onLocate }) {
  const map = useMap();

  const handleClick = () => {
    if (userLocation) {
      map.setView(userLocation, 13);
      onLocate();
    } else {
      alert("위치 정보를 가져올 수 없습니다");
    }
  };

  return (
    <div className="leaflet-bottom leaflet-right" style={{ zIndex: 1000 }}>
      <div className="leaflet-control" style={{ marginBottom: '80px', marginRight: '12px' }}>
        <button
          onClick={handleClick}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            border: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
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
      </div>
    </div>
  );
}

const getFestivalName = (festival) => {
  return festival.name_ko || festival.name_original || festival.name_en || festival.name || '';
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState([20, 0]);
  const [userLocation, setUserLocation] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: festivals, isLoading } = useQuery({
    queryKey: ['festivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list();
      return removeDuplicateFestivals(allFestivals);
    },
    initialData: [],
  });

  const categories = [...new Set(festivals.map(f => f.category).filter(Boolean))];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const festivalsWithLocation = festivals.filter(f => {
    if (!f.latitude || !f.longitude) return false;
    if (f.end_date && new Date(f.end_date) < today) return false;
    if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
    if (dateRange.from && dateRange.to) {
      const start = new Date(f.start_date);
      const end = new Date(f.end_date);
      const filterFrom = new Date(dateRange.from);
      const filterTo = new Date(dateRange.to);
      if (end < filterFrom || start > filterTo) return false;
    }
    return true;
  });

  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          setMapCenter([latitude, longitude]);
        },
        (error) => {
          console.log("위치 정보를 가져올 수 없습니다:", error);
        }
      );
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const result = await geocodePlace({ query: searchQuery });
      if (result?.data?.success) {
        setMapCenter([result.data.latitude, result.data.longitude]);
      } else {
        alert("위치를 찾을 수 없습니다.");
      }
    } catch (e) {
      alert("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleMyLocation = () => {
    if (userLocation) {
      setMapCenter(userLocation);
    } else {
      alert("위치 정보를 가져올 수 없습니다");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-black">
      <div className="bg-black border-b border-gray-800 py-3 px-4 z-[1000] flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="지명을 검색하세요 (예: 오사카, 도쿄, 서울)"
              className="w-full pl-12 pr-16 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-cyan-400 text-xs font-bold disabled:opacity-50"
              >
                {isSearching ? "검색중..." : "이동"}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${categoryFilter !== "all" ? "bg-purple-500/20 border-purple-400 text-purple-400" : "bg-gray-900 border-gray-800 text-white"}`}>
              <div className="flex items-center gap-1.5 text-xs">
                <Tag className="w-4 h-4 text-purple-400" />
                <span>{categoryFilter !== "all" ? categoryFilter : "분류"}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800 text-white">
              <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">전체 카테고리</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setIsDatePickerOpen(true)}
            className={`px-4 h-9 rounded-full whitespace-nowrap flex items-center gap-2 text-xs hover:bg-gray-800 transition-colors border ${dateRange.from && dateRange.to ? "bg-pink-500/20 border-pink-400 text-pink-400" : "bg-gray-900 border-gray-800 text-white"}`}
          >
            <Calendar className="w-4 h-4 text-pink-500" />
            <span>{dateRange.from && dateRange.to ? `${safeFormatDate(dateRange.from, 'M/d')}~${safeFormatDate(dateRange.to, 'M/d')}` : "날짜"}</span>
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
        {isLoading ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
          </div>
        ) : festivalsWithLocation.length > 0 ? (
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="h-full w-full"
            style={{ background: '#ffffff' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            <MapController center={mapCenter} />
            <LocateButton userLocation={userLocation} onLocate={() => setMapCenter(userLocation)} />

            {userLocation && (
              <Marker
                position={userLocation}
                icon={new L.Icon({
                  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI4IiBmaWxsPSIjMDA5OEZGIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=',
                  iconSize: [20, 20],
                  iconAnchor: [10, 10],
                })}
              >
                <Popup className="custom-popup">
                  <div className="bg-gray-900 p-2 rounded">
                    <p className="text-white text-sm font-bold">내 위치</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {festivalsWithLocation.map((festival) => (
              <Marker
                key={festival.id}
                position={[festival.latitude, festival.longitude]}
                icon={festivalIcon}
              >
                <Popup className="custom-popup">
                  <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                    <div className="min-w-[200px] bg-gray-900 p-3 rounded-lg">
                      {festival.thumbnail_url && (
                        <img
                          src={festival.thumbnail_url}
                          alt={festival.name}
                          className="w-full h-32 object-cover rounded-lg mb-2"
                        />
                      )}
                      <h3 className="font-bold text-base mb-2 text-white">{getFestivalName(festival)}</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <MapPin className="w-4 h-4 text-cyan-400" />
                          {festival.city_ko || festival.city}, {festival.country_ko || festival.country}
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Calendar className="w-4 h-4 text-pink-500" />
                          {safeFormatDate(festival.start_date, 'M월 d일')}
                        </div>
                        <div className="flex items-center gap-2 text-gray-300">
                          <Heart className="w-4 h-4 text-pink-500" />
                          {festival.likes_count || 0} 좋아요
                        </div>
                      </div>
                      <Badge className="mt-2 bg-cyan-500 text-white">
                        {festival.category}
                      </Badge>
                    </div>
                  </Link>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <Card className="bg-gray-800 border-gray-700 p-8 text-center">
              <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">위치 정보가 있는 축제가 없습니다</p>
            </Card>
          </div>
        )}
      </div>

      <div className="bg-black border-t border-gray-800 px-4 py-3 mb-20 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-full"></div>
              <span className="text-white text-sm">축제</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-white text-sm">내 위치</span>
            </div>
          </div>
          <Badge variant="outline" className="text-cyan-400 border-cyan-400">
            {festivalsWithLocation.length}개 축제
          </Badge>
        </div>
      </div>
      <style jsx global>{`
        /* Leaflet controls should be below buttons */
        .leaflet-control-container {
          z-index: 100 !important;
        }
        .leaflet-pane {
          z-index: 1 !important;
        }
        
        /* Zoom control styling */
        .leaflet-control-zoom a {
          background-color: #1f2937 !important; /* Tailwind gray-800 */
          color: white !important;
          border: 1px solid #374151 !important; /* Tailwind gray-700 */
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #374151 !important; /* Tailwind gray-700 */
        }
      `}</style>
    </div>
  );
}