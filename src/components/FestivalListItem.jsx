import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion } from "framer-motion";

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
  const [likeAnimating, setLikeAnimating] = React.useState(false);

  const handleLikeClick = (e) => {
    e.preventDefault();
    // 햅틱 피드백
    if (navigator.vibrate) navigator.vibrate(30);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 400);
    onLike(festival.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (index % 5) * 0.05, ease: "easeOut" }}
    >
    <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
      <div className="flex items-center py-3 pr-3 rounded-2xl bg-gray-900/50 hover:bg-gray-900 transition-all">
        <div className="flex-shrink-0 w-6 text-center">
          <span className="text-white font-bold text-lg leading-none">
            {index + 1}
          </span>
        </div>

        <div className="flex-shrink-0 ml-0.5">
          <img
            src={festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
            alt={localizedName}
            className="w-16 h-16 rounded-xl object-cover"
          />
        </div>

        <div className="flex-1 min-w-0 ml-3">
          <h3 className="text-white font-bold text-sm truncate mb-1">
            {localizedName}
          </h3>
          <div className="text-white text-xs">
            {getLocalizedContent(festival, 'country')}, {getLocalizedContent(festival, 'city')}{festival.category ? ` / ${festival.category}` : ''}
          </div>
          <div className="text-white text-xs flex items-center gap-1 flex-wrap">
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
          onClick={handleLikeClick}
          className="flex-shrink-0 flex flex-col items-center gap-1"
        >
          <motion.div
            animate={likeAnimating ? { scale: [1, 1.4, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, type: "spring", stiffness: 400, damping: 15 }}
          >
            <Heart
              className={`w-6 h-6 transition-colors duration-200 ${
                isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-500'
              }`}
            />
          </motion.div>
          <motion.span
            key={festival.likes_count}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`text-xs font-medium ${isLiked ? 'text-pink-500' : 'text-gray-500'}`}
          >
            {formatNumber(festival.likes_count || 0)}
          </motion.span>
        </button>
      </div>
    </Link>
    </motion.div>
  );
}