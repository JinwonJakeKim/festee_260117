import React, { useMemo } from "react";
import { Target, Check, Loader2, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useLanguage } from "@/lib/useLanguage";

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function NearbyFestivalsSection({ userLocation, festivals, catches, onCatch, isCatching, t }) {
  const { getLocalizedContent } = useLanguage();

  const nearbyFestivals = useMemo(() => {
    if (!userLocation) return [];
    const caughtIds = new Set(catches.map(c => c.festival_id));
    const todayStr = new Date().toISOString().split('T')[0];
    return festivals
      .filter(f => f.latitude && f.longitude && f.show !== 'N')
      .filter(f => !f.end_date || f.end_date >= todayStr)
      .map(f => ({
        ...f,
        distance: calcDistance(userLocation.latitude, userLocation.longitude, f.latitude, f.longitude),
        isCaught: caughtIds.has(f.id),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [userLocation, festivals, catches]);

  if (!userLocation) return null;

  return (
    <div className="px-4 py-4">
      <h2 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
        <Target className="w-5 h-5 text-cyan-400" />
        {t.nearbyTitle}
      </h2>
      {nearbyFestivals.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">{t.noNearby}</p>
      ) : (
        <div className="space-y-2">
          {nearbyFestivals.map((festival) => {
            const name = getLocalizedContent(festival, 'name');
            const city = getLocalizedContent(festival, 'city');
            const country = getLocalizedContent(festival, 'country');
            return (
              <div key={festival.id} className="flex items-center gap-3 bg-gray-900 rounded-xl p-3">
                <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)} className="flex-1 flex items-center gap-3 min-w-0">
                  <img
                    src={festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=200'}
                    alt={name}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-white font-bold text-sm line-clamp-1">{name}</p>
                    <p className="text-gray-400 text-xs">{city}, {country}</p>
                    <p className="text-cyan-400 text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {festival.distance < 1 ? `${Math.round(festival.distance * 1000)}m` : `${festival.distance.toFixed(1)}km`}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => !festival.isCaught && onCatch(festival)}
                  disabled={festival.isCaught || isCatching}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                    festival.isCaught
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                  }`}
                >
                  {festival.isCaught ? (
                    <span className="flex items-center gap-1"><Check className="w-4 h-4" /> {t.done}</span>
                  ) : isCatching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t.catchNow
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}