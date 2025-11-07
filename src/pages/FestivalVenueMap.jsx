
import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import { ArrowLeft, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom icons
const createIcon = (emoji, color) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${emoji}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const zoneIcon = (zoneName, color) => {
  return L.divIcon({
    className: 'custom-zone-icon',
    html: `<div style="background: ${color}; width: 60px; height: 60px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5);">${zoneName}</div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
};

export default function FestivalVenueMap() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const festivalId = urlParams.get('id');
  const festivalName = urlParams.get('name') || '축제';

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: festival } = useQuery({
    queryKey: ['festival', festivalId],
    queryFn: () => base44.entities.Festival.filter({ id: festivalId }).then(res => res[0]),
    enabled: !!festivalId,
  });

  if (!festival || !festival.latitude || !festival.longitude) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">위치 정보를 불러올 수 없습니다</p>
          <Button onClick={() => navigate(-1)} className="mt-4">
            돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const centerLat = festival.latitude;
  const centerLng = festival.longitude;

  // Zone positions (상대적 오프셋 - 약 200-300미터 간격)
  const zones = [
    { 
      id: 'A', 
      name: 'Zone A',
      lat: centerLat + 0.002, 
      lng: centerLng - 0.003,
      color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      description: 'Main Stage'
    },
    { 
      id: 'B', 
      name: 'Zone B',
      lat: centerLat + 0.002, 
      lng: centerLng + 0.003,
      color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      description: 'EDM Stage'
    },
    { 
      id: 'C', 
      name: 'Zone C',
      lat: centerLat - 0.002, 
      lng: centerLng - 0.003,
      color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      description: 'Food Court'
    },
    { 
      id: 'D', 
      name: 'Zone D',
      lat: centerLat - 0.002, 
      lng: centerLng + 0.003,
      color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      description: 'Chill Zone'
    },
  ];

  // Facilities positions
  const facilities = [
    { 
      name: '화장실', 
      emoji: '🚻',
      color: '#3b82f6',
      lat: centerLat + 0.001, 
      lng: centerLng - 0.001 
    },
    { 
      name: '응급실', 
      emoji: '🏥',
      color: '#ef4444',
      lat: centerLat + 0.001, 
      lng: centerLng + 0.001 
    },
    { 
      name: '안내센터', 
      emoji: 'ℹ️',
      color: '#8b5cf6',
      lat: centerLat - 0.001, 
      lng: centerLng - 0.001 
    },
    { 
      name: 'FESTEE Center', 
      emoji: '🎪',
      color: '#ec4899',
      lat: centerLat - 0.001, 
      lng: centerLng + 0.001 
    },
  ];

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-[1000] bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{festivalName}</h1>
            <p className="text-gray-400 text-sm">행사장 지도</p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="h-[60vh]">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={16}
          className="h-full w-full"
          // Removed style={{ background: '#1a1a1a' }} to allow bright default map background
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />

          {/* Festival Center Marker with Circle */}
          <Circle
            center={[centerLat, centerLng]}
            radius={50}
            pathOptions={{ 
              color: '#06b6d4', 
              fillColor: '#06b6d4', 
              fillOpacity: 0.2 
            }}
          />
          <Marker
            position={[centerLat, centerLng]}
            icon={createIcon('🎉', '#06b6d4')}
          >
            <Popup className="custom-popup">
              <div className="bg-white p-3 rounded text-center"> {/* Changed from bg-gray-900 */}
                <p className="text-black font-bold mb-1">축제 중심</p> {/* Changed from text-white */}
                <p className="text-gray-700 text-xs">{festival.name}</p> {/* Changed from text-gray-300 */}
              </div>
            </Popup>
          </Marker>

          {/* Zone Markers */}
          {zones.map((zone) => (
            <Marker
              key={zone.id}
              position={[zone.lat, zone.lng]}
              icon={zoneIcon(zone.id, zone.color)}
            >
              <Popup className="custom-popup">
                <div className="bg-white p-3 rounded"> {/* Changed from bg-gray-900 */}
                  <p className="text-black font-bold mb-1">{zone.name}</p> {/* Changed from text-white */}
                  <p className="text-gray-700 text-sm">{zone.description}</p> {/* Changed from text-gray-300 */}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Facility Markers */}
          {facilities.map((facility, idx) => (
            <Marker
              key={idx}
              position={[facility.lat, facility.lng]}
              icon={createIcon(facility.emoji, facility.color)}
            >
              <Popup className="custom-popup">
                <div className="bg-white p-2 rounded"> {/* Changed from bg-gray-900 */}
                  <p className="text-black font-bold text-sm">{facility.name}</p> {/* Changed from text-white */}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="p-4 space-y-4">
        <h3 className="text-white font-bold text-lg">범례</h3>
        
        <div>
          <h4 className="text-white font-bold mb-2 text-sm">🎪 공연 구역</h4>
          <div className="grid grid-cols-2 gap-3">
            {zones.map((zone) => (
              <Card key={zone.id} className="bg-gray-900 border-gray-800 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: zone.color }}
                  >
                    {zone.id}
                  </div>
                  <span className="text-white font-bold text-sm">{zone.name}</span>
                </div>
                <p className="text-gray-400 text-xs">{zone.description}</p>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-white font-bold mb-2 text-sm">🏢 편의시설</h4>
          <div className="grid grid-cols-2 gap-2">
            {facilities.map((facility, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-900 rounded-lg p-2">
                <span className="text-2xl">{facility.emoji}</span>
                <span className="text-white text-sm">{facility.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30 p-4">
          <h3 className="text-white font-bold mb-2">💡 이용 안내</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• 각 Zone을 클릭하면 상세 정보를 확인할 수 있습니다</li>
            <li>• 응급 상황 시 가까운 응급실(🏥)을 이용하세요</li>
            <li>• FESTEE Center(🎪)에서 행사 정보를 얻을 수 있습니다</li>
            <li>• 화장실(🚻)은 지도에 표시된 위치를 참고하세요</li>
          </ul>
        </Card>

        {/* Map Information */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-cyan-400" />
            축제 정보
          </h3>
          <div className="text-gray-300 text-sm space-y-1">
            <p>• 위치: {festival.city}, {festival.country}</p>
            <p>• GPS: {festival.latitude.toFixed(4)}, {festival.longitude.toFixed(4)}</p>
          </div>
        </Card>
      </div>

      <style jsx global>{`
        .custom-popup .leaflet-popup-content-wrapper {
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .custom-popup .leaflet-popup-tip {
          background: white; /* Changed from #1f2937 for bright theme */
        }
        
        /* Zoom control styling */
        .leaflet-control-zoom a {
          background-color: #1f2937 !important;
          color: white !important;
          border: 1px solid #374151 !important;
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #374151 !important;
        }
      `}</style>
    </div>
  );
}
