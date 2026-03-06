import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const getRankColor = (index) => {
  if (index === 0) return "bg-cyan-400 text-black";
  if (index === 1) return "bg-gray-600 text-white";
  if (index === 2) return "bg-gray-700 text-white";
  return "bg-gray-800 text-gray-400";
};

export default function FestivalListItem({ festival, index, isLiked, onLike, getLocalizedContent }) {
  const dateStatus = festival.date_status || 'confirmed';
  const localizedName = getLocalizedContent(festival, 'name');

  return (
    <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-900/50 hover:bg-gray-900 transition-all">
        <div className="flex-shrink-0 w-6 text-center">
          <span className="text-gray-600 font-bold text-lg leading-none">
            {index + 1}
          </span>
        </div>

        <div className="flex-shrink-0">
          <img
            src={festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
            alt={localizedName}
            className="w-16 h-16 rounded-xl object-cover"
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm truncate mb-1">
            {localizedName}
          </h3>
          <div className="text-gray-400 text-xs">
            {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}{festival.category ? ` / ${festival.category}` : ''}
          </div>
          <div className="text-gray-500 text-xs flex items-center gap-1 flex-wrap">
            <span>
              {safeFormatDate(festival.start_date, 'yyyy.MM.dd')} - {safeFormatDate(festival.end_date, 'MM.dd')}
            </span>
            {dateStatus === 'tentative' && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 border-yellow-500 text-yellow-500">
                미확정
              </Badge>
            )}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            onLike(festival.id);
          }}
          className="flex-shrink-0 flex flex-col items-center gap-1"
        >
          <Heart
            className={`w-6 h-6 transition-all ${
              isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-500'
            }`}
          />
          <span className={`text-xs font-medium ${isLiked ? 'text-pink-500' : 'text-gray-500'}`}>
            {formatNumber(festival.likes_count || 0)}
          </span>
        </button>
      </div>
    </Link>
  );
}