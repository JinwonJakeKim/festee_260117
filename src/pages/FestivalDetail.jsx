import React, { useState, useEffect, useRef } from "react";

import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, Share2, MessageCircle, Star, MapPin, Calendar, ExternalLink, Map, Target, X, Images, ChevronRight, Music, Palette, Brush, Utensils, Trophy, Check, AlertCircle, Play, Youtube, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import LoginPromptModal from "../components/LoginPromptModal";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/lib/useLanguage";
import { useCurrency } from "@/lib/CurrencyContext";
import { detailTranslations } from "@/lib/detailTranslations";
import FestivalChatbot from "../components/FestivalChatbot";
import CommentItem from "@/components/CommentItem";
import { useCommentActions } from "@/hooks/useCommentActions";

// 안전한 날짜 포맷팅 함수 추가
const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return '날짜 미정';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '날짜 미정';
    return format(date, formatString, { locale: ko });
  } catch (e) {
    console.error("Error formatting date:", e);
    return '날짜 미정';
  }
};

// 구글맵스 링크 생성 함수
const getGoogleMapsUrl = (addr, city, country) => {
  const query = addr || `${city} ${country}`;
  return `https://www.google.com/maps?q=${query.trim().replace(/\s+/g, '+')}`;
};

// 짧은 ID 생성 함수
const generateShortId = (fullId) => {
  if (!fullId) return '';
  // ID의 앞 8자리만 사용 (충분히 고유함)
  return fullId.substring(0, 8);
};

// Custom red marker icon for festivals - 수정된 버전
const festivalIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Shorts Section Component
function ShortsSection({ youtubeShortUrls, getYoutubeVideoId, festivalName, festival, moreLabel }) {
  const [playingIndex, setPlayingIndex] = React.useState(null);
  const [thumbnailErrors, setThumbnailErrors] = React.useState({});

  const handleClick = (idx) => {
    setPlayingIndex(prev => prev === idx ? null : idx);
  };

  const handleMoreClick = () => {
    // original_language 기준으로 해당 name 필드 선택, 년도(4자리 숫자) 제거
    const langFieldMap = { ko: 'name_ko', en: 'name_en', ja: 'name_jp', jp: 'name_jp', zh: 'name_zh', 'zh-CN': 'name_zh' };
    const langField = langFieldMap[festival?.original_language] || null;
    const rawName = (langField && festival?.[langField]) ? festival[langField] : festivalName;
    const cleanedName = rawName.replace(/\s*\d{4}\s*/g, ' ').trim();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanedName)}`, '_blank');
  };

  const handleThumbnailError = (e, videoId, idx) => {
    const errorCount = thumbnailErrors[idx] || 0;

    // 순차적으로 여러 썸네일 옵션 시도
    if (errorCount === 0) {
      e.target.src = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
    } else if (errorCount === 1) {
      e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else if (errorCount === 2) {
      e.target.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    } else if (errorCount === 3) {
      e.target.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
    }

    setThumbnailErrors(prev => ({ ...prev, [idx]: errorCount + 1 }));
  };

  return (
    <div>
      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
        <Youtube className="w-6 h-6 text-red-600" />
        <span className="text-white">Shorts</span>
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory">
        {youtubeShortUrls.map((shortUrl, idx) => {
          const videoId = getYoutubeVideoId(shortUrl);
          if (!videoId) return null;

          // 첫 번째 시도는 0.jpg (비디오의 첫 프레임, 가장 안정적)
          const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
          const isPlaying = playingIndex === idx;

          return (
            <div key={idx} className="flex-shrink-0 relative bg-gray-900 rounded-lg overflow-hidden snap-start w-[280px] h-[498px]">
              {isPlaying ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1`}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`Short ${idx + 1}`}
                />
              ) : (
                <div 
                  className="w-full h-full cursor-pointer"
                  onClick={() => handleClick(idx)}
                >
                  <img
                    src={thumbnailUrl}
                    alt={`Short ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => handleThumbnailError(e, videoId, idx)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={handleMoreClick}
          className="flex-shrink-0 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-cyan-400/50 rounded-lg transition-all flex flex-col items-center justify-center gap-2 text-cyan-400 font-medium px-6 snap-start w-[280px] h-[498px]"
          >
          <Youtube className="w-8 h-8" />
          <span className="text-sm text-center">{(moreLabel || 'YouTube에서\n더보기').split('\n').map((line, i) => <React.Fragment key={i}>{line}{i === 0 && <br/>}</React.Fragment>)}</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function FestivalDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const festivalId = urlParams.get('id');
  const { language, getLocalizedContent } = useLanguage();
  const { formatCurrency } = useCurrency();
  const t = detailTranslations[language] || detailTranslations.ko;
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showFreeEntryAlert, setShowFreeEntryAlert] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMessage, setLoginModalMessage] = useState("");
  const [showMapModal, setShowMapModal] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [youtubeError, setYoutubeError] = useState(false);
  
  // New states for the unified gallery popup
  const [showGalleryPopup, setShowGalleryPopup] = useState(false);
  const [galleryPopupIndex, setGalleryPopupIndex] = useState(0);
  const commentSectionRef = useRef(null);

  useEffect(() => {
    // 실제 스크롤 컨테이너인 main 요소를 최상단으로 스크롤
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0, 0);
    setYoutubeError(false);
  }, [festivalId]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festival, isLoading } = useQuery({
    queryKey: ['festival', festivalId],
    queryFn: () => base44.entities.Festival.filter({ id: festivalId }).then(res => res[0]),
    enabled: !!festivalId,
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  // 일본 축제 원본 소스 URL (japantravel) 조회
  const { data: japantravelRaw } = useQuery({
    queryKey: ['japantravelRaw', festivalId],
    queryFn: () => base44.entities.JapantravelRawData.filter({ festival_id: festivalId }).then(res => res[0]),
    enabled: !!festivalId && festival?.country === 'Japan',
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        setLoginModalMessage("축제에 좋아요를 누르려면 로그인이 필요합니다");
        setShowLoginModal(true);
        return;
      }
      const existing = myLikes.find(like => like.festival_id === festivalId);
      const currentCount = festival?.likes_count || 0;
      if (existing) {
        await base44.entities.FestivalLike.delete(existing.id);
        await base44.entities.Festival.update(festivalId, { likes_count: Math.max(0, currentCount - 1) });
      } else {
        await base44.entities.FestivalLike.create({ festival_id: festivalId, user_email: user.email });
        await base44.entities.Festival.update(festivalId, { likes_count: currentCount + 1 });
      }
    },
    onMutate: async () => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: ['myLikes', user.email] });
      await queryClient.cancelQueries({ queryKey: ['festival', festivalId] });

      const prevLikes = queryClient.getQueryData(['myLikes', user.email]);
      const prevFestival = queryClient.getQueryData(['festival', festivalId]);

      const existing = prevLikes?.find(like => like.festival_id === festivalId);

      queryClient.setQueryData(['myLikes', user.email], (old = []) =>
        existing
          ? old.filter(l => l.festival_id !== festivalId)
          : [...old, { festival_id: festivalId, user_email: user.email, id: 'optimistic' }]
      );

      queryClient.setQueryData(['festival', festivalId], (old) =>
        old ? { ...old, likes_count: existing ? Math.max(0, (old.likes_count || 0) - 1) : (old.likes_count || 0) + 1 } : old
      );

      return { prevLikes, prevFestival };
    },
    onError: (err, variables, context) => {
      if (context?.prevLikes) queryClient.setQueryData(['myLikes', user.email], context.prevLikes);
      if (context?.prevFestival) queryClient.setQueryData(['festival', festivalId], context.prevFestival);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['festival', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
      queryClient.invalidateQueries({ queryKey: ['rawFestivals'] });
    },
  });

  // 공통 댓글 훅 (Optimistic UI + 작성자 닉네임 동기화 + 수정/삭제)
  const {
    comments,
    commentText,
    setCommentText,
    submitComment,
    isSubmitting,
    deleteComment,
    isDeleting,
    editingCommentId,
    editText,
    setEditText,
    startEdit,
    cancelEdit,
    submitEdit,
    isEditing,
  } = useCommentActions({
    entityId: festivalId,
    entityType: "Festival",
    commentLinkField: "festival_id",
    user,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [externalLinkModal, setExternalLinkModal] = useState(null);

  // 여러 전화번호가 붙어 있는 경우 구분자로 분리
  const formatPhoneNumbers = (phoneStr) => {
    if (!phoneStr) return phoneStr;
    const trimmed = phoneStr.trim();
    // 이미 구분자(쉼표, 슬래시, 줄바꿈, 파이프)가 있는 경우 분리
    if (/[,/\n|]/.test(trimmed)) {
      const parts = trimmed.split(/[,/\n|]/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) return parts.join(' / ');
    }
    // 하이픈 포함 한국 전화번호 패턴 추출 (예: 031-123-4567)
    const matches = trimmed.match(/\d{2,3}-\d{3,4}-\d{4}/g);
    if (matches && matches.length > 1) {
      return matches.join(' / ');
    }
    // 두 전화번호가 구분자 없이 붙어있는 경우 (예: 031-290-3622031-5191-3084)
    if (trimmed.includes('-')) {
      const tokens = trimmed.split('-').filter(Boolean);
      const phones = [];
      let i = tokens.length;
      // 끝에서부터 3개 토큰씩 전화번호 추출
      while (i >= 3) {
        const last = tokens[i - 1];
        const mid = tokens[i - 2];
        const first = tokens[i - 3];
        if (/^\d{4}$/.test(last) && /^\d{3,4}$/.test(mid) && /^\d{2,3}$/.test(first)) {
          phones.unshift(`${first}-${mid}-${last}`);
          i -= 3;
        } else {
          break;
        }
      }
      // 남은 토큰이 3개이고 마지막 토큰이 5자리 이상이면 분리 시도
      if (phones.length > 0 && i === 3) {
        const [r1, r2, r3] = tokens.slice(0, 3);
        if (/^\d{2,3}$/.test(r1) && /^\d{3,4}$/.test(r2) && r3.length > 4) {
          const frontNum = r3.slice(0, 4);
          const rest = r3.slice(4);
          if (/^\d{2,3}$/.test(rest)) {
            phones.unshift(`${r1}-${r2}-${frontNum}`);
          }
        }
      }
      if (phones.length > 1) {
        return phones.join(' / ');
      }
    }
    return trimmed;
  };

  // 외부 링크 클릭 시 확인 모달 표시
  const handleExternalLinkClick = (e, url) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    setExternalLinkModal(fullUrl);
  };

  const confirmExternalLink = () => {
    if (externalLinkModal) {
      window.open(externalLinkModal, '_blank', 'noopener,noreferrer');
    }
    setExternalLinkModal(null);
  };

  const handleLike = () => {
    if (!user) {
      setLoginModalMessage("축제에 좋아요를 누르려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(30);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 400);
    likeMutation.mutate();
  };

  const handleCommentSubmit = () => {
    if (!user) {
      setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    submitComment();
  };

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname + window.location.search);
  };

  const getStarRating = (festival) => {
    if (festival?.star_rating) {
      return Math.min(5, Math.max(1, festival.star_rating));
    }
    
    let hash = 0;
    const id = festival?.id || festival?.name || '0';
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return Math.abs(hash % 5) + 1;
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  const isLiked = myLikes.some(like => like.festival_id === festivalId);

  const ticketPlatforms = [
    { name: "멜론티켓", price: festival?.price || 187000, views: 1533, benefit: "주요 좌석 확보", url: "https://ticket.melon.com" },
    { name: "예스24티켓", price: (festival?.price || 187000) + 1000, views: 1331, benefit: "빠른 배송", url: "https://ticket.yes24.com" },
    { name: "NOL티켓", price: (festival?.price || 187000) + 4000, views: 1384, benefit: "무료 굿즈 증정", url: "https://nolticket.co.kr" },
  ];

  const getYoutubeVideoId = (url) => {
    if (!url) return null;
    const cleanUrl = url.trim();
    
    // Handle Shorts specifically (most common for this section)
    const shortsMatch = cleanUrl.match(/shorts\/([a-zA-Z0-9_-]+)/i);
    if (shortsMatch && shortsMatch[1]) return shortsMatch[1];

    // General YouTube regex
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = cleanUrl.match(regExp);
    
    return (match && match[2] && match[2].length >= 11) ? match[2] : null;
  };

  const getYoutubeEmbedUrl = (url) => {
    const videoId = getYoutubeVideoId(url);
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  };

  const isFreeEntry = !festival?.price || festival.price === 0;

  const handleTicketButtonClick = () => {
    if (isFreeEntry) {
      setShowFreeEntryAlert(true);
      setTimeout(() => {
        setShowFreeEntryAlert(false);
      }, 2500);
    } else {
      setShowTicketModal(true);
    }
  };

  const handleShare = async () => {
    const shareUrl = `https://festee.org${createPageUrl(`FestivalDetail?id=${festivalId}`)}`;
    
    const dateInfo = festival.start_date && festival.end_date
      ? `${safeFormatDate(festival.start_date, 'yyyy.MM.dd')} ~ ${safeFormatDate(festival.end_date, 'MM.dd')}`
      : '날짜 미정';
    
    const priceInfo = festival.price ? formatCurrency(festival.price) : '무료';
    const summarySnippet = localizedSummary
      ? localizedSummary.substring(0, 80) + (localizedSummary.length > 80 ? '...' : '')
      : '';

    const shareTitle = '';
    const addressLine = localizedAccessInfo || `${localizedCity}, ${localizedCountry}`;
    const shareText = [
      `[Festee]`,
      `세상의 모든축제, Festee`,
      ``,
      `축제명 : ${localizedName}`,
      `축제기간 : ${dateInfo}`,
      `금액 : ${priceInfo}`,
      `주소 : ${addressLine}`,
      ``,
      summarySnippet,
      ``,
      `FESTEE에서 자세히보기`,
    ].filter(line => line !== null && line !== undefined).join('\n');

    const shareData = { title: shareTitle, text: shareText, url: shareUrl };

    // 1. Web Share API - 이미지 포함 시도
    if (festival.thumbnail_url && navigator.canShare) {
      try {
        const imageResponse = await fetch(festival.thumbnail_url);
        const imageBlob = await imageResponse.blob();
        const imageFile = new File([imageBlob], `festival.jpg`, { type: imageBlob.type });
        const shareDataWithImage = { ...shareData, files: [imageFile] };
        
        if (navigator.canShare(shareDataWithImage)) {
          await navigator.share(shareDataWithImage);
          return;
        }
      } catch (error) {
        console.log('이미지 포함 공유 실패, 텍스트 공유 시도:', error.message);
      }
    }

    // 2. Web Share API - 텍스트만
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.log('Web Share API 실패, 클립보드 복사로 전환:', error.message);
      }
    }

    // 3. 클립보드 복사 (fallback)
    const clipboardText = `${shareText}\n${shareUrl}`;
    
    try {
      await navigator.clipboard.writeText(clipboardText);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = clipboardText;
      textArea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setShowShareCopied(true);
    setTimeout(() => setShowShareCopied(false), 2000);
  };

  // 수정된 미디어 배열 생성 로직 - media_urls 순서 정확히 반영
  const mediaItems = React.useMemo(() => {
    const items = [];
    const addedUrls = new Set();

    console.log('[FestivalDetail] 🎬 Building mediaItems for festival:', festival?.name_ko || festival?.name_original || festival?.name);
    console.log('[FestivalDetail] 📹 video_url:', festival?.video_url);
    console.log('[FestivalDetail] 🎞️ media_urls:', festival?.media_urls);

    // 1. video_url이 있으면 가장 먼저 추가
    if (festival?.video_url && !addedUrls.has(festival.video_url)) {
      const isYoutube = festival.video_url.includes('youtube.com') || festival.video_url.includes('youtu.be');
      items.push({
        type: isYoutube ? 'youtube' : 'video',
        url: festival.video_url,
        caption: festival.name_ko || festival.name_original || festival.name || ''
      });
      addedUrls.add(festival.video_url);
      console.log('[FestivalDetail] ✅ Added video_url:', festival.video_url);
    }

    // 2. image_gallery_urls 배열 추가 (japantravel 추출 이미지 - 하이라이트 영상 바로 다음)
    if (festival?.image_gallery_urls && festival.image_gallery_urls.length > 0) {
      festival.image_gallery_urls.forEach((imgObj, index) => {
        const imageUrl = imgObj?.originimgurl || imgObj?.smallimageurl;
        if (imageUrl && !addedUrls.has(imageUrl)) {
          items.push({
            type: 'image',
            url: imageUrl,
            caption: imgObj?.imgname || `${festival.name_ko || festival.name_original || festival.name} - 갤러리 이미지 ${index + 1}`
          });
          addedUrls.add(imageUrl);
          console.log(`[FestivalDetail] ✅ image_gallery_urls[${index}] → mediaItems[${items.length - 1}]:`, imageUrl);
        }
      });
    }

    // 3. media_urls 배열을 순서대로 추가 (구글 이미지 등)
    if (festival?.media_urls && festival.media_urls.length > 0) {
      festival.media_urls.forEach((media, index) => {
        let currentUrl = null;
        let currentType = null;
        let currentCaption = festival.name_ko || festival.name_original || festival.name || '';

        if (typeof media === 'string') {
          currentUrl = media;
          if (media.includes('ytimg.com')) {
            currentType = 'image';
            currentCaption = `YouTube 썸네일`;
          } else if (media.includes('youtube.com') || media.includes('youtu.be')) {
            currentType = 'youtube';
          } else if (media.match(/\.(mp4|webm|ogg)$/i)) {
            currentType = 'video';
          } else {
            currentType = 'image';
          }
        } else if (typeof media === 'object' && media !== null && media.url) {
          currentUrl = media.url;
          const isYoutubeThumbnail = media.url.includes('ytimg.com');
          if (isYoutubeThumbnail) {
            currentType = 'image';
          } else {
            const isYoutube = media.url.includes('youtube.com') || media.url.includes('youtu.be');
            currentType = isYoutube ? 'youtube' : (media.type || 'image');
          }
          if (media.caption) {
            currentCaption = media.caption;
          }
        }

        if (currentUrl && !addedUrls.has(currentUrl)) {
          items.push({
            type: currentType,
            url: currentUrl,
            caption: currentCaption
          });
          addedUrls.add(currentUrl);
          console.log(`[FestivalDetail] ✅ media_urls[${index}] → mediaItems[${items.length - 1}]:`, currentUrl);
        } else if (currentUrl) {
          console.log(`[FestivalDetail] ⏭️ Skipped duplicate media_urls[${index}]:`, currentUrl);
        }
      });
    }

    console.log('[FestivalDetail] 📊 Total mediaItems:', items.length);
    console.log('[FestivalDetail] 📊 Final mediaItems array:', items);

    return items;
  }, [festival]);

  // 갤러리 팝업용 미디어 아이템 (mediaItems를 그대로 사용)
  const allGalleryItems = React.useMemo(() => {
    console.log('[FestivalDetail] 🖼️ Building allGalleryItems, using mediaItems:', mediaItems.length);
    return mediaItems;
  }, [mediaItems]);

  // 갤러리 버튼 클릭 핸들러
  const handleGalleryClick = () => {
    // Find the index of the current mediaItems item within allGalleryItems
    const currentMediaUrl = mediaItems[mediaIndex]?.url;
    let initialGalleryIndex = 0;
    if (currentMediaUrl) {
      const foundIndex = allGalleryItems.findIndex(item => item.url === currentMediaUrl);
      if (foundIndex !== -1) {
        initialGalleryIndex = foundIndex;
      }
    }
    setGalleryPopupIndex(initialGalleryIndex); // Start from the currently visible hero media
    setShowGalleryPopup(true);
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance && mediaIndex < mediaItems.length - 1) {
      setMediaIndex(prev => prev + 1);
    } else if (distance < -minSwipeDistance && mediaIndex > 0) {
      setMediaIndex(prev => prev - 1);
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  useEffect(() => {
    if (mediaItems.length <= 1) return;

    // 현재 미디어가 동영상이면 자동 전환하지 않음
    const currentMediaType = mediaItems[mediaIndex]?.type;
    if (currentMediaType === 'video' || currentMediaType === 'youtube') {
      return;
    }

    const timer = setInterval(() => {
      setMediaIndex((prev) => (prev + 1) % mediaItems.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [mediaItems.length, mediaIndex, mediaItems]);

  if (isLoading || !festival) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // 디버깅: 축제 데이터 확인
  console.log('Festival Data:', festival);
  console.log('Image Gallery URLs:', festival.image_gallery_urls);
  console.log('🎬 YouTube Shorts URLs:', festival.youtube_shorts_urls);
  console.log('🎬 Shorts length:', festival.youtube_shorts_urls?.length);

  const starRating = getStarRating(festival);
  const currentMedia = mediaItems[mediaIndex];
  const dateStatus = festival.date_status || 'confirmed';

  // 다국어 콘텐츠 가져오기
  const localizedName = getLocalizedContent(festival, 'name');
  const localizedCity = getLocalizedContent(festival, 'city');
  const localizedCountry = getLocalizedContent(festival, 'country');
  const localizedSummary = getLocalizedContent(festival, 'summary');
  const localizedDescription = getLocalizedContent(festival, 'description');
  const localizedHighlights = getLocalizedContent(festival, 'highlights');
  const localizedOpeningHours = getLocalizedContent(festival, 'opening_hours');
  const localizedAccessInfo = getLocalizedContent(festival, 'access_info');
  const localizedParkingInfo = getLocalizedContent(festival, 'parking_info');
  const localizedRestrictions = getLocalizedContent(festival, 'restrictions');
  const localizedRecommendations = getLocalizedContent(festival, 'recommendations');

  // DEBUG: 설명 내용 확인
  console.log('📝 Description Debug:');
  console.log('Raw:', localizedDescription);
  console.log('Has \\n\\n:', localizedDescription.includes('\n\n'));
  console.log('Has \\n:', localizedDescription.includes('\n'));

  return (
    <div className="min-h-screen bg-black pb-20 overflow-x-hidden">
      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message={loginModalMessage}
      />

      {/* Share Copied Alert */}
      <AnimatePresence>
        {showShareCopied && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[110] bg-gray-900 border border-cyan-400 rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg"
          >
            <Check className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-medium">{t.linkCopied}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div />
        </div>
      </div>

      {/* Hero Media Carousel */}
      <div className="relative w-full bg-black" style={{ paddingTop: '56.25%' }}>
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden bg-black">
          {currentMedia?.type === 'youtube' ? (
            (() => {
              const videoId = getYoutubeVideoId(currentMedia.url);
              if (!videoId || youtubeError) {
                return (
                  <img
                    src={currentMedia.url.includes('youtu') && videoId
                      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                      : (festival.thumbnail_url || '')}
                    alt={currentMedia.caption || ''}
                    className="w-full h-full object-contain"
                  />
                );
              }
              // origin이 허용된 도메인이어야 autoplay가 동작함
              const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
              return (
                <iframe
                  key={videoId}
                  src={embedUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={currentMedia.caption || festival.name_ko || festival.name_original || festival.name}
                  onError={() => setYoutubeError(true)}
                />
              );
            })()
          ) : currentMedia?.type === 'video' ? (
            <video
              src={currentMedia.url}
              className="w-full h-full object-contain"
              autoPlay
              muted
              loop
              playsInline
              poster={festival.thumbnail_url}
              onError={(e) => {
                console.error('[FestivalDetail] Video load error:', currentMedia.url);
                e.target.style.display = 'none'; // Hide the broken video element
              }}
            />
          ) : (
            <img
              src={currentMedia?.url || festival.thumbnail_url}
              alt={currentMedia?.caption || festival.name_ko || festival.name_original || festival.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                console.error('[FestivalDetail] ❌ Image load FAILED in Hero Media:', e.target.src);
                console.error('[FestivalDetail] This image URL is broken or inaccessible');
              }}
            />
          )}

          {/* 스와이프 및 클릭 감지용 투명 레이어 */}
          <div 
            className="absolute inset-0 z-10 cursor-pointer"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleGalleryClick}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none z-20" />
          
          {/* 컨텐츠 번호 표시 - 왼쪽 아래 */}
          {mediaItems.length > 0 && (
            <div className="absolute bottom-4 left-4 z-30 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
                <span className="text-white font-bold text-sm">
                  {mediaIndex + 1}/{mediaItems.length}
                </span>
              </div>
            </div>
          )}

          {/* 갤러리 버튼 - 오른쪽 아래 */}
          {allGalleryItems.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleGalleryClick();
              }}
              className="absolute bottom-4 right-4 z-30 bg-black/70 backdrop-blur-sm hover:bg-black/90 rounded-lg px-4 py-2 flex items-center gap-2 transition-colors pointer-events-auto"
            >
              <Images className="w-4 h-4 text-white" />
              <span className="text-white font-medium text-sm">{t.gallery}</span>
            </button>
          )}
        </div>
        
        {/* Indicators */}
        {mediaItems.length > 1 && (
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2 z-30">
            {mediaItems.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaIndex(idx);
                }}
                className={`h-2 rounded-full transition-all ${
                  idx === mediaIndex ? 'bg-cyan-400 w-4' : 'bg-gray-600 w-2'
                }`}
              />
            ))}
          </div>
        )}
        
        {/* Navigation Arrows (Desktop) */}
        {mediaItems.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMediaIndex(prev => (prev - 1 + mediaItems.length) % mediaItems.length);
              }}
              className="hidden md:flex absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full items-center justify-center hover:bg-black/70 transition-colors z-30"
            >
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMediaIndex(prev => (prev + 1) % mediaItems.length);
              }}
              className="hidden md:flex absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full items-center justify-center hover:bg-black/70 transition-colors z-30"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Festival Info */}
      <div className="px-4 py-4">
        <h1 className="text-white text-2xl font-bold mb-3">{localizedName}</h1>
        
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-gray-400">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span className="text-sm">
              {safeFormatDate(festival.start_date, 'yy.M.d')} - {safeFormatDate(festival.end_date, 'M.d')}
            </span>
            {dateStatus === 'tentative' && (
              <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500 ml-1">
                {t.dateTentative}
              </Badge>
            )}
            {dateStatus === 'estimated' && (
              <Badge variant="outline" className="text-xs border-orange-500 text-orange-500 ml-1">
                {t.dateEstimated}
              </Badge>
            )}
          </div>
          
          <a
            href={getGoogleMapsUrl(festival.access_info, festival.city, festival.country)}
            onClick={(e) => handleExternalLinkClick(e, getGoogleMapsUrl(festival.access_info, festival.city, festival.country))}
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <MapPin className="w-4 h-4 text-pink-500" />
            <span className="text-sm underline">{localizedCity} {localizedCountry}</span>
          </a>
        </div>

        <div className="text-white text-xl font-bold mb-3">
          {isFreeEntry ? (
            <span className="text-green-400">{t.free}</span>
          ) : (
            <span>{formatCurrency(festival.price)}</span>
          )}
        </div>

        {(festival.category || (festival.tags_ko && festival.tags_ko.length > 0)) && (
          <div className="flex gap-2 mb-4 flex-wrap max-w-full">
            {/* 카테고리 - 아이콘 포함한 채워진 그라데이션 배지 (약간 둥근 사각형) */}
            {festival.category && (
              <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 font-bold rounded-lg px-4 py-1 flex items-center gap-1.5">
                {festival.category === "음악" && <Music className="w-3.5 h-3.5" />}
                {festival.category === "문화" && <Palette className="w-3.5 h-3.5" />}
                {festival.category === "예술" && <Brush className="w-3.5 h-3.5" />}
                {festival.category === "음식" && <Utensils className="w-3.5 h-3.5" />}
                {festival.category === "스포츠" && <Trophy className="w-3.5 h-3.5" />}
                {festival.category === "지역축제" && <MapPin className="w-3.5 h-3.5" />}
                {!["음악", "문화", "예술", "음식", "스포츠", "지역축제"].includes(festival.category) && <MapPin className="w-3.5 h-3.5" />}
                {getLocalizedContent(festival, 'category') || festival.category}
              </Badge>
            )}
            
            {/* 태그 - 설정 언어에 맞는 태그 필드 사용 */}
            {getLocalizedContent(festival, 'tags') && getLocalizedContent(festival, 'tags').map((tag, idx) => (
              <Badge 
                key={idx} 
                variant="outline" 
                className="border-gray-600 text-gray-300 hover:border-cyan-400 hover:text-cyan-400 rounded-full transition-colors"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 py-3 border-y border-gray-800">
          <button 
            onClick={handleLike}
            className="flex items-center gap-2"
          >
            <motion.div
              animate={likeAnimating ? { scale: [1, 1.45, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, type: "spring", stiffness: 400, damping: 15 }}
            >
              <Heart className={`w-6 h-6 transition-colors duration-200 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} />
            </motion.div>
            <motion.span
              key={festival.likes_count}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`font-medium ${isLiked ? 'text-pink-500' : 'text-white'}`}
            >
              {formatNumber(festival.likes_count || 0)}
            </motion.span>
          </button>
          <button
            onClick={() => commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2"
          >
            <MessageCircle className="w-6 h-6 text-gray-400 hover:text-cyan-400 transition-colors" />
            <span className="text-white font-medium">{comments.length}</span>
          </button>
          <a
            href={getGoogleMapsUrl(festival.access_info, festival.city, festival.country)}
            onClick={(e) => handleExternalLinkClick(e, getGoogleMapsUrl(festival.access_info, festival.city, festival.country))}
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <Map className="w-6 h-6 text-gray-400 hover:text-cyan-400 transition-colors" />
          </a>
          <Link to={createPageUrl(`Catch?festival=${festival.id}`)}>
            <button className="flex items-center gap-2">
              <Target className="w-6 h-6 text-gray-400 hover:text-pink-500 transition-colors" />
            </button>
          </Link>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 hover:border-cyan-400/50 transition-colors"
          >
            <Share2 className="w-5 h-5 text-gray-400" />
            <span className="text-white text-sm font-medium whitespace-nowrap">{t.share}</span>
          </button>
        </div>
      </div>

      {/* 소개 섹션 */}
      <div className="px-4 mt-4">
        <div className="text-white">
          <div className="space-y-6">
            {/* 축제 요약 */}
            {localizedSummary && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.summary}</h3>
                <p className="text-gray-300 leading-relaxed text-base">
                  {localizedSummary}
                </p>
              </div>
            )}

            {/* 하이라이트 */}
            {localizedHighlights && localizedHighlights.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.highlights}</h3>
                <ul className="space-y-3">
                  {localizedHighlights.map((highlight, idx) => (
                    <li key={idx} className="text-gray-300 flex items-start gap-3 leading-relaxed">
                      <span className="text-cyan-400 text-xl flex-shrink-0">•</span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 소개 (상세 설명) - 줄바꿈 완전 보존 */}
            <div>
              <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.intro}</h3>
              <pre className="text-gray-300 text-base font-sans leading-relaxed whitespace-pre-wrap">
                {localizedDescription}
              </pre>
            </div>

            {/* 주소 정보 */}
            {localizedAccessInfo && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xl font-bold text-cyan-400">{t.address}</h3>
                  <a
                    href={getGoogleMapsUrl(localizedAccessInfo, festival.city, festival.country)}
                    onClick={(e) => handleExternalLinkClick(e, getGoogleMapsUrl(localizedAccessInfo, festival.city, festival.country))}
                    rel="noopener noreferrer"
                    title="Google Maps에서 보기"
                  >
                    <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow hover:shadow-md transition-shadow">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#4285F4"/>
                      </svg>
                    </div>
                  </a>
                </div>
                <p className="text-gray-300 whitespace-pre-line">{localizedAccessInfo}</p>
              </div>
            )}

            {/* 운영 시간 */}
            {localizedOpeningHours && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.openingHours}</h3>
                <p className="text-gray-300">{localizedOpeningHours}</p>
              </div>
            )}

            {/* 주최 정보 */}
            {festival.organizer && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.organizer}</h3>
                <p className="text-gray-300">{festival.organizer}</p>
              </div>
            )}

            {/* 연락처 */}
            {festival.contact && (festival.contact.phone || festival.contact.email) && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.contact}</h3>
                <div className="space-y-2">
                  {festival.contact.phone && (
                    <p className="text-gray-300 flex items-center gap-2">
                      <span className="text-cyan-400">📞</span>
                      {formatPhoneNumbers(festival.contact.phone)}
                    </p>
                  )}
                  {festival.contact.email && (
                    <p className="text-gray-300 flex items-center gap-2">
                      <span className="text-cyan-400">📧</span>
                      {festival.contact.email}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SNS */}
            {festival.social_media && Object.values(festival.social_media).some(v => v) && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.sns}</h3>
                <div className="flex gap-3">
                  {festival.social_media.facebook && (
                    <a href={festival.social_media.facebook} onClick={(e) => handleExternalLinkClick(e, festival.social_media.facebook)} rel="noopener noreferrer"
                       className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors">
                      <span className="text-white font-bold">f</span>
                    </a>
                  )}
                  {festival.social_media.instagram && (
                    <a href={festival.social_media.instagram} onClick={(e) => handleExternalLinkClick(e, festival.social_media.instagram)} rel="noopener noreferrer"
                       className="w-10 h-10 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity">
                      <span className="text-white font-bold">📷</span>
                    </a>
                  )}
                  {festival.social_media.twitter && (
                    <a href={festival.social_media.twitter} onClick={(e) => handleExternalLinkClick(e, festival.social_media.twitter)} rel="noopener noreferrer"
                       className="w-10 h-10 bg-black rounded-full flex items-center justify-center hover:bg-gray-900 border border-gray-700 transition-colors">
                      <span className="text-white font-bold">𝕏</span>
                    </a>
                  )}
                  {festival.social_media.youtube && (
                    <a href={festival.social_media.youtube} onClick={(e) => handleExternalLinkClick(e, festival.social_media.youtube)} rel="noopener noreferrer"
                       className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <span className="text-white font-bold">▶</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 축제정보원본 (일본 축제 - japantravel 원본 링크) */}
            {festival.country === 'Japan' && japantravelRaw?.source_url && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.originalSource}</h3>
                <a
                  href={japantravelRaw.source_url}
                  onClick={(e) => handleExternalLinkClick(e, japantravelRaw.source_url)}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors border border-gray-800 max-w-full"
                >
                  <ExternalLink className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                  <span className="text-cyan-400 hover:underline truncate">{japantravelRaw.source_url}</span>
                </a>
              </div>
            )}

            {/* 웹사이트 */}
            {festival.website && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.website}</h3>
                <a 
                  href={festival.website.startsWith('http') ? festival.website : `https://${festival.website}`}
                  onClick={(e) => handleExternalLinkClick(e, festival.website)}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors border border-gray-800"
                >
                  <ExternalLink className="w-5 h-5 text-cyan-400" />
                  <span className="text-cyan-400 hover:underline">{festival.website}</span>
                </a>
              </div>
            )}

            {/* 축제정보 최신성/정확성 안내 */}
            <div className="flex items-start gap-2 pt-4 border-t border-gray-800">
              <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-gray-500 text-xs leading-relaxed">{t.infoAccuracyNotice}</p>
            </div>

            {/* Shorts 섹션 */}
            {festival.youtube_shorts_urls && festival.youtube_shorts_urls.length > 0 && (
              <ShortsSection
                    youtubeShortUrls={festival.youtube_shorts_urls}
                    getYoutubeVideoId={getYoutubeVideoId}
                    festivalName={localizedName}
                    festival={festival}
                    moreLabel={t.youtubeMore}
                    />
            )}
          {/* 라인업 */}
          {festival.lineup && festival.lineup.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.lineup}</h3>
              <div className="space-y-4">
                {festival.lineup.map((day, idx) => (
                  <div key={idx} className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-lg font-bold mb-2">{day.date}</h4>
                    <div className="space-y-1">
                      {day.artists.map((artist, artistIdx) => (
                        <div key={artistIdx} className="text-gray-300">• {artist}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 일정 */}
          {festival.schedule && festival.schedule.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-3 text-cyan-400">{t.schedule}</h3>
              <div className="space-y-3">
                {festival.schedule.map((item, idx) => (
                  <div key={idx} className="bg-gray-900 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-cyan-400 font-bold min-w-[60px]">{item.time}</div>
                      <div className="flex-1">
                        <h4 className="font-bold mb-1">{item.activity}</h4>
                        {item.location && (
                          <p className="text-gray-400 text-sm">📍 {item.location}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
          </div>
          </div>

      {/* Comments Section */}
      <div className="px-4 py-6" ref={commentSectionRef}>
        <h2 className="text-white text-xl font-bold mb-4">{t.comments} ({comments.length})</h2>
        
        <div className="mb-6">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={user ? t.commentPlaceholder : t.commentLoginPlaceholder}
            className="bg-gray-900 border-gray-800 text-white mb-2"
            rows={3}
            disabled={!user}
          />
          <Button
            onClick={handleCommentSubmit}
            disabled={!commentText.trim() || isSubmitting || !user}
            className="bg-cyan-500 hover:bg-cyan-600"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                등록 중...
              </span>
            ) : (
              user ? t.commentSubmit : t.commentLoginRequired
            )}
          </Button>
        </div>

        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={user}
              editingCommentId={editingCommentId}
              editText={editText}
              setEditText={setEditText}
              startEdit={startEdit}
              cancelEdit={cancelEdit}
              submitEdit={submitEdit}
              deleteComment={deleteComment}
              isEditing={isEditing}
              isDeleting={isDeleting}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
            />
          ))}
        </div>

        {comments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {t.commentEmpty}
          </div>
        )}
      </div>



      {/* Map Modal */}
      <AnimatePresence>
        {showMapModal && festival.latitude && festival.longitude && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMapModal(false)}
              className="fixed inset-0 bg-black/90 z-[100] backdrop-blur-sm"
            />

            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-4xl bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 pointer-events-auto"
                style={{ height: '80vh' }}
              >
                {/* 지도 컨테이너 */}
                <div className="absolute inset-0" style={{ zIndex: 1 }}>
                  <MapContainer
                    center={[festival.latitude, festival.longitude]}
                    zoom={15}
                    className="w-full h-full"
                    style={{ background: '#f0f0f0', zIndex: 1 }}
                    zoomControl={true}
                    scrollWheelZoom={true}
                    dragging={true}
                    touchZoom={true}
                    doubleClickZoom={true}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; OpenStreetMap contributors'
                    />
                    <Marker
                      position={[festival.latitude, festival.longitude]}
                      icon={festivalIcon}
                    >
                      <Popup className="custom-popup">
                        <div className="bg-gray-900 p-3 rounded">
                          <h3 className="text-white font-bold mb-1">{localizedName}</h3>
                                        <p className="text-gray-300 text-sm">{localizedCity}, {localizedCountry}</p>
                        </div>
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>

                {/* 닫기 버튼 - 지도 위에 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMapModal(false);
                  }}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black hover:bg-gray-800 flex items-center justify-center transition-colors border-2 border-white shadow-xl"
                  style={{ zIndex: 1000 }}
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* 축제 정보 - 지도 위에 (왼쪽 하단으로 이동) */}
                <div 
                  className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700 shadow-lg"
                  style={{ zIndex: 1000 }}
                >
                  <h3 className="text-white font-bold">{localizedName}</h3>
                    <p className="text-gray-300 text-sm">{localizedCity}, {localizedCountry}</p>
                </div>
              </motion.div>
            </div>

            <style jsx global>{`
              .custom-popup .leaflet-popup-content-wrapper {
                background: transparent;
                box-shadow: none;
                padding: 0;
              }
              .custom-popup .leaflet-popup-tip {
                background: #1f2937;
              }
              /* Leaflet controls should be below buttons */
              .leaflet-control-container {
                z-index: 100 !important;
              }
              .leaflet-pane {
                z-index: 1 !important;
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
          </>
        )}
      </AnimatePresence>

      {/* Chatbot */}
      <FestivalChatbot festival={festival} />

      {/* 갤러리 팝업 모달 - 새로운 버전 */}
      <AnimatePresence>
        {showGalleryPopup && allGalleryItems.length > 0 && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGalleryPopup(false)}
              className="fixed inset-0 bg-black/95 z-[100] backdrop-blur-sm"
            />

            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-4xl relative pointer-events-auto"
              >
                {/* 닫기 버튼 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGalleryPopup(false);
                  }}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/80 hover:bg-black flex items-center justify-center transition-colors border-2 border-white shadow-xl z-10"
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* 이전 버튼 */}
                {galleryPopupIndex > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryPopupIndex(prev => prev - 1);
                    }}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black flex items-center justify-center transition-colors border-2 border-white shadow-xl z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-white rotate-180" />
                  </button>
                )}

                {/* 다음 버튼 */}
                {galleryPopupIndex < allGalleryItems.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGalleryPopupIndex(prev => prev + 1);
                    }}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black flex items-center justify-center transition-colors border-2 border-white shadow-xl z-10"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                )}

                {/* 미디어 컨텐츠 */}
                <div className="bg-black rounded-lg overflow-hidden">
                  {allGalleryItems[galleryPopupIndex]?.type === 'youtube' ? (
                    (() => {
                      const embedUrl = getYoutubeEmbedUrl(allGalleryItems[galleryPopupIndex].url);
                      if (!embedUrl) {
                        return (
                          <div className="w-full aspect-video flex items-center justify-center bg-gray-900">
                            <div className="text-center">
                              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                              <p className="text-white">{t.videoError}</p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="w-full aspect-video">
                          <iframe
                            src={embedUrl}
                            className="w-full h-full"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={allGalleryItems[galleryPopupIndex].caption}
                          />
                        </div>
                      );
                    })()
                  ) : allGalleryItems[galleryPopupIndex]?.type === 'video' ? (
                    <video
                      src={allGalleryItems[galleryPopupIndex].url}
                      className="w-full max-h-[80vh] object-contain"
                      controls
                      autoPlay
                    />
                  ) : (
                    <img
                      src={allGalleryItems[galleryPopupIndex]?.url}
                      alt={allGalleryItems[galleryPopupIndex]?.caption || `미디어 ${galleryPopupIndex + 1}`}
                      className="w-full max-h-[80vh] object-contain"
                      onError={(e) => {
                        console.error('[FestivalDetail] ❌ Image load FAILED in Gallery Popup:', e.target.src);
                        console.error('[FestivalDetail] This image URL is broken or inaccessible');
                      }}
                    />
                  )}
                  
                  {/* 미디어 정보 */}
                  <div className="bg-black/80 backdrop-blur-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-bold">
                        {galleryPopupIndex + 1} / {allGalleryItems.length}
                      </p>
                      <Badge className="bg-gray-800 text-gray-300 border-gray-700">
                        {allGalleryItems[galleryPopupIndex]?.type === 'youtube' && t.mediaTypeVideo}
                        {allGalleryItems[galleryPopupIndex]?.type === 'video' && t.mediaTypeMovie}
                        {allGalleryItems[galleryPopupIndex]?.type === 'image' && t.mediaTypePhoto}
                      </Badge>
                    </div>
                    {allGalleryItems[galleryPopupIndex]?.caption && (
                      <p className="text-gray-300 text-sm">
                        {allGalleryItems[galleryPopupIndex].caption}
                      </p>
                    )}
                    {/* YouTube 하이라이트 영상의 출처 표시 */}
                    {allGalleryItems[galleryPopupIndex]?.type === 'youtube' && 
                     allGalleryItems[galleryPopupIndex]?.url === festival.video_url && 
                     festival.video_channel_name && (
                     <p className="text-gray-400 text-xs mt-2">
                      {t.source} {festival.video_channel_name}
                     </p>
                     )}
                  </div>
                </div>

                {/* 썸네일 네비게이션 */}
                <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {allGalleryItems.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGalleryPopupIndex(idx);
                      }}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all relative ${
                        idx === galleryPopupIndex
                          ? 'border-cyan-400 scale-110'
                          : 'border-gray-700 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {item.type === 'youtube' || item.type === 'video' ? (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <Play className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <img
                          src={item.url}
                          alt={`썸네일 ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error('[FestivalDetail] ❌ Thumbnail load FAILED:', e.target.src);
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* 외부 링크 이동 확인 모달 */}
      <AnimatePresence>
        {externalLinkModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4"
              onClick={() => setExternalLinkModal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4">
                    <ExternalLink className="w-7 h-7 text-cyan-400" />
                  </div>
                  <h3 className="text-white text-lg font-bold mb-2">{t.externalLinkNotice}</h3>
                  <p className="text-gray-400 text-sm mb-6 whitespace-pre-line">
                    {t.externalLinkConfirm}
                  </p>
                  <p className="text-gray-500 text-xs mb-6 truncate max-w-full">
                    {externalLinkModal}
                  </p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setExternalLinkModal(null)}
                      className="flex-1 py-3 rounded-xl bg-gray-800 text-white font-medium hover:bg-gray-700 transition-colors"
                    >
                      {t.externalLinkCancel}
                    </button>
                    <button
                      onClick={confirmExternalLink}
                      className="flex-1 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-colors"
                    >
                      {t.externalLinkOpen}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}