import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, Share2, MessageCircle, Star, MapPin, Calendar, ExternalLink, Map, Target, X, Images, ChevronRight, Music, Palette, Brush, Utensils, Trophy, Check, AlertCircle, Play, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import LoginPromptModal from "../components/LoginPromptModal";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFestivalLocalizedContent } from "../components/FestivalLocalizedContent";
import FestivalChatbot from "../components/FestivalChatbot";

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
function ShortsSection({ youtubeShortUrls, getYoutubeVideoId, festivalName }) {
  const [playingIndex, setPlayingIndex] = React.useState(null);
  const [thumbnailErrors, setThumbnailErrors] = React.useState({});

  const handleClick = (idx) => {
    setPlayingIndex(prev => prev === idx ? null : idx);
  };

  const handleMoreClick = () => {
    const searchQuery = encodeURIComponent(festivalName);
    window.open(`https://www.youtube.com/results?search_query=${searchQuery}`, '_blank');
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
          <span className="text-sm text-center">YouTube에서<br/>더보기</span>
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
  const { getLocalizedContent } = useFestivalLocalizedContent();
  const [commentText, setCommentText] = useState("");
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showFreeEntryAlert, setShowFreeEntryAlert] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMessage, setLoginModalMessage] = useState("");
  const [showMapModal, setShowMapModal] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  
  // New states for the unified gallery popup
  const [showGalleryPopup, setShowGalleryPopup] = useState(false);
  const [galleryPopupIndex, setGalleryPopupIndex] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
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

  const { data: comments } = useQuery({
    queryKey: ['comments', festivalId],
    queryFn: () => base44.entities.Comment.filter({ festival_id: festivalId }),
    enabled: !!festivalId,
    initialData: [],
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
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
        await base44.entities.Festival.update(festivalId, {
          likes_count: Math.max(0, currentCount - 1)
        });
      } else {
        await base44.entities.FestivalLike.create({
          festival_id: festivalId,
          user_email: user.email
        });
        await base44.entities.Festival.update(festivalId, {
          likes_count: currentCount + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival'] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
      queryClient.invalidateQueries({ queryKey: ['rawFestivals'] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      if (!user) {
        setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
        setShowLoginModal(true);
        return;
      }

      await base44.entities.Comment.create({
        festival_id: festivalId,
        user_email: user.email,
        user_name: user.full_name,
        content,
      });
      await base44.entities.Festival.update(festivalId, {
        comments_count: (festival?.comments_count || 0) + 1
      });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['festival'] });
    },
  });

  const handleLike = () => {
    if (!user) {
      setLoginModalMessage("축제에 좋아요를 누르려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    likeMutation.mutate();
  };

  const handleComment = () => {
    if (commentText.trim() && user) {
      commentMutation.mutate(commentText);
    }
  };

  const handleCommentSubmit = () => {
    if (!user) {
      setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    handleComment();
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
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&showinfo=0&rel=0&modestbranding=1&enablejsapi=1`;
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
    const shortId = generateShortId(festivalId);
    const shareUrl = `${window.location.origin}${createPageUrl(`FestivalDetail?id=${festivalId}`)}`;
    
    const dateInfo = festival.start_date && festival.end_date
      ? `📅 ${safeFormatDate(festival.start_date, 'yyyy년 M월 d일')} - ${safeFormatDate(festival.end_date, 'M월 d일')}`
      : '📅 날짜 추후 공지';
    
    const priceInfo = festival.price 
      ? `💰 ₩${festival.price.toLocaleString()}`
      : '💰 무료 입장';
    
    const shareTitle = `🎪 ${localizedName}`;
    const shareText = `${localizedName}

${dateInfo}
📍 ${festival.city}, ${festival.country}
${priceInfo}
${festival.category ? `🎭 ${festival.category}` : ''}

${localizedSummary ? localizedSummary.substring(0, 100) + (localizedSummary.length > 100 ? '...' : '') : ''}

FESTEE에서 더 자세히 확인하세요 👉`;

    const shareData = {
      title: shareTitle,
      text: shareText,
      url: shareUrl,
    };

    if (festival.thumbnail_url && navigator.canShare) {
      try {
        const imageResponse = await fetch(festival.thumbnail_url);
        const imageBlob = await imageResponse.blob();
        const imageFile = new File([imageBlob], `${localizedName}.jpg`, { type: imageBlob.type });
        
        const shareDataWithImage = {
          ...shareData,
          files: [imageFile],
        };
        
        if (navigator.canShare(shareDataWithImage)) {
          console.log('✅ 이미지 포함 공유 가능');
          await navigator.share(shareDataWithImage);
          console.log('Web Share API 성공 (이미지 포함)');
          return;
        } else {
          console.log('⚠️ 이미지 포함 공유 불가능 - 텍스트만 공유');
        }
      } catch (error) {
        console.log('이미지 fetch 실패:', error.message);
      }
    }

    if (navigator.share) {
      try {
        if (navigator.canShare && !navigator.canShare(shareData)) {
          console.log('Web Share API: 이 데이터는 공유할 수 없습니다. 클립보드로 전환합니다.');
          throw new Error('Cannot share this data');
        }

        await navigator.share(shareData);
        console.log('Web Share API 성공');
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('사용자가 공유를 취소했습니다.');
          return;
        }
        
        console.log('Web Share API 실패:', error.name, error.message);
        console.log('클립보드 복사로 전환합니다.');
      }
    } else {
      console.log('Web Share API가 지원되지 않는 환경입니다. 클립보드 복사를 시도합니다.');
    }
    
    const clipboardText = `${shareText}\n\n${shareUrl}`;
    
    try {
      await navigator.clipboard.writeText(clipboardText);
      setShowShareCopied(true);
      setTimeout(() => {
        setShowShareCopied(false);
      }, 2000);
      console.log('클립보드 복사 성공');
    } catch (error) {
      console.error('클립보드 복사 실패:', error);
      try {
        const textArea = document.createElement('textarea');
        textArea.value = clipboardText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          setShowShareCopied(true);
          setTimeout(() => {
            setShowShareCopied(false);
          }, 2000);
          console.log('대체 복사 방법 성공');
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (fallbackError) {
        console.error('대체 복사 방법도 실패:', fallbackError);
        alert('링크 복사에 실패했습니다. 주소창의 URL을 복사해주세요.');
      }
    }
  };

  // 수정된 미디어 배열 생성 로직 - media_urls 순서 정확히 반영
  const mediaItems = React.useMemo(() => {
    const items = [];
    const addedUrls = new Set();

    console.log('[FestivalDetail] 🎬 Building mediaItems for festival:', festival?.name);
    console.log('[FestivalDetail] 📹 video_url:', festival?.video_url);
    console.log('[FestivalDetail] 🎞️ media_urls:', festival?.media_urls);

    // 1. video_url이 있으면 가장 먼저 추가
    if (festival?.video_url && !addedUrls.has(festival.video_url)) {
      const isYoutube = festival.video_url.includes('youtube.com') || festival.video_url.includes('youtu.be');
      items.push({
        type: isYoutube ? 'youtube' : 'video',
        url: festival.video_url,
        caption: `${festival.name}`
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
            caption: imgObj?.imgname || `${festival.name} - 갤러리 이미지 ${index + 1}`
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
        let currentCaption = festival.name;

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
            <span className="text-white font-medium">링크가 복사되었습니다</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex gap-2">
            <button 
              onClick={handleShare}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
            >
              <Share2 className="w-5 h-5 text-white" />
            </button>
            <button 
              onClick={handleLike}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-white'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Hero Media Carousel */}
      <div className="relative w-full bg-black" style={{ paddingTop: '56.25%' }}>
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden bg-black">
          {currentMedia?.type === 'youtube' ? (
            (() => {
              const embedUrl = getYoutubeEmbedUrl(currentMedia.url);
              if (!embedUrl) {
                console.error('[FestivalDetail] Failed to generate embed URL for:', currentMedia.url);
                return (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                      <p className="text-white">영상을 불러올 수 없습니다</p>
                      <p className="text-gray-400 text-sm mt-1">유효하지 않은 YouTube URL</p>
                    </div>
                  </div>
                );
              }
              return (
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={currentMedia.caption || festival.name}
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
              alt={currentMedia?.caption || festival.name}
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
              <span className="text-white font-medium text-sm">갤러리</span>
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
                날짜 미확정
              </Badge>
            )}
            {dateStatus === 'estimated' && (
              <Badge variant="outline" className="text-xs border-orange-500 text-orange-500 ml-1">
                추정
              </Badge>
            )}
          </div>
          
          <button 
            onClick={() => setShowMapModal(true)}
            className="flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-pink-500" />
            <span className="text-sm underline">{festival.city} {festival.country}</span>
          </button>
        </div>

        <div className="text-white text-xl font-bold mb-3">
          {isFreeEntry ? (
            <span className="text-green-400">₩0 (무료)</span>
          ) : (
            <span>₩{festival.price.toLocaleString()}</span>
          )}
        </div>

        {(festival.category || (festival.tags && festival.tags.length > 0)) && (
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
                {festival.category}
              </Badge>
            )}
            
            {/* 태그 - 홈화면과 동일한 외곽선 pill 모양 */}
            {festival.tags && festival.tags.map((tag, idx) => (
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

        <div className="flex items-center gap-6 py-3 border-y border-gray-800">
          <button 
            onClick={handleLike}
            className="flex items-center gap-2"
          >
            <Heart className={`w-6 h-6 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} />
            <span className={`font-medium ${isLiked ? 'text-pink-500' : 'text-white'}`}>
              {formatNumber(festival.likes_count || 0)}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-gray-400" />
            <span className="text-white font-medium">{festival.comments_count || 0}</span>
          </div>
          {festival.latitude && festival.longitude && (
            <Link to={createPageUrl(`FestivalVenueMap?id=${festival.id}&name=${encodeURIComponent(festival.name)}`)}>
              <button className="flex items-center gap-2">
                <Map className="w-6 h-6 text-gray-400 hover:text-cyan-400 transition-colors" />
              </button>
            </Link>
          )}
          <Link to={createPageUrl(`Catch?festival=${festival.id}`)}>
            <button className="flex items-center gap-2">
              <Target className="w-6 h-6 text-gray-400 hover:text-pink-500 transition-colors" />
            </button>
          </Link>
        </div>
      </div>

      {/* Tabs - 탭 수정 */}
      <Tabs defaultValue="intro" className="px-4">
        <TabsList className="w-full bg-gray-900 grid grid-cols-4">
          <TabsTrigger value="intro" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">소개</TabsTrigger>
          <TabsTrigger value="visit" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">방문정보</TabsTrigger>
          <TabsTrigger value="lineup" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">라인업</TabsTrigger>
          <TabsTrigger value="schedule" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">일정</TabsTrigger>
        </TabsList>

        {/* 소개 탭 (기존 summary) */}
        <TabsContent value="intro" className="text-white mt-4">
          <div className="space-y-6">
            {/* 축제 요약 */}
            {localizedSummary && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">축제 요약</h3>
                <p className="text-gray-300 leading-relaxed text-base">
                  {localizedSummary}
                </p>
              </div>
            )}

            {/* 하이라이트 */}
            {localizedHighlights && localizedHighlights.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">하이라이트</h3>
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
              <h3 className="text-xl font-bold mb-3 text-cyan-400">소개</h3>
              <pre className="text-gray-300 text-base font-sans leading-relaxed whitespace-pre-wrap">
                {localizedDescription}
              </pre>
            </div>

            {/* 운영 시간 */}
            {localizedOpeningHours && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">운영 시간</h3>
                <p className="text-gray-300">{localizedOpeningHours}</p>
              </div>
            )}

            {/* 주소 정보 */}
            {localizedAccessInfo && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">주소</h3>
                <p className="text-gray-300 whitespace-pre-line">{localizedAccessInfo}</p>
              </div>
            )}

            {/* 주최 정보 */}
            {festival.organizer && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">주최/주관</h3>
                <p className="text-gray-300">{festival.organizer}</p>
              </div>
            )}

            {/* 연락처 */}
            {festival.contact && (festival.contact.phone || festival.contact.email) && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">연락처</h3>
                <div className="space-y-2">
                  {festival.contact.phone && (
                    <p className="text-gray-300 flex items-center gap-2">
                      <span className="text-cyan-400">📞</span>
                      {festival.contact.phone}
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
                <h3 className="text-xl font-bold mb-3 text-cyan-400">SNS</h3>
                <div className="flex gap-3">
                  {festival.social_media.facebook && (
                    <a href={festival.social_media.facebook} target="_blank" rel="noopener noreferrer"
                       className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors">
                      <span className="text-white font-bold">f</span>
                    </a>
                  )}
                  {festival.social_media.instagram && (
                    <a href={festival.social_media.instagram} target="_blank" rel="noopener noreferrer"
                       className="w-10 h-10 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity">
                      <span className="text-white font-bold">📷</span>
                    </a>
                  )}
                  {festival.social_media.twitter && (
                    <a href={festival.social_media.twitter} target="_blank" rel="noopener noreferrer"
                       className="w-10 h-10 bg-black rounded-full flex items-center justify-center hover:bg-gray-900 border border-gray-700 transition-colors">
                      <span className="text-white font-bold">𝕏</span>
                    </a>
                  )}
                  {festival.social_media.youtube && (
                    <a href={festival.social_media.youtube} target="_blank" rel="noopener noreferrer"
                       className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <span className="text-white font-bold">▶</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 웹사이트 */}
            {festival.website && (
              <div>
                <h3 className="text-xl font-bold mb-3 text-cyan-400">공식 웹사이트</h3>
                <a 
                  href={festival.website.startsWith('http') ? festival.website : `https://${festival.website}`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors border border-gray-800"
                >
                  <ExternalLink className="w-5 h-5 text-cyan-400" />
                  <span className="text-cyan-400 hover:underline">{festival.website}</span>
                </a>
              </div>
            )}

            {/* Shorts 섹션 */}
            {festival.youtube_shorts_urls && festival.youtube_shorts_urls.length > 0 && (
              <ShortsSection
                youtubeShortUrls={festival.youtube_shorts_urls}
                getYoutubeVideoId={getYoutubeVideoId}
                festivalName={localizedName}
              />
            )}
          </div>
        </TabsContent>

        {/* 방문 탭 - 위치 정보 통합 */}
        <TabsContent value="visit" className="text-white mt-4">
          <div className="space-y-4">
            {/* 위치 정보 섹션 추가 */}
            {festival.latitude && festival.longitude && (
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <h3 className="font-bold mb-3 flex items-center gap-2 text-white">
                  <MapPin className="w-5 h-5 text-pink-500" />
                  위치
                </h3>
                <p className="text-white font-bold mb-4">{festival.city}, {festival.country}</p>
                <div className="flex flex-col gap-2">
                  <Link to={createPageUrl("FestivalMap")}>
                    <Button className="w-full bg-cyan-500 hover:bg-cyan-600">
                      <Map className="w-5 h-5 mr-2" />
                      지도에서 보기
                    </Button>
                  </Link>
                  <Link to={createPageUrl(`FestivalVenueMap?id=${festival.id}&name=${encodeURIComponent(festival.name)}`)}>
                    <Button className="w-full bg-pink-500 hover:bg-pink-600">
                      <Map className="w-5 h-5 mr-2" />
                      행사장 내부 지도
                    </Button>
                  </Link>
                </div>
              </div>
            )}



            {/* 주차 정보 */}
            {localizedParkingInfo && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  🅿️ 주차 정보
                </h3>
                <p className="text-gray-300">{localizedParkingInfo}</p>
              </div>
            )}

            {/* 금지사항/주의사항 */}
            {localizedRestrictions && localizedRestrictions.length > 0 && (
              <div className="bg-red-900/20 border border-red-400/30 rounded-lg p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2 text-red-400">
                  ⚠️ 금지사항/주의사항
                </h3>
                <ul className="space-y-1">
                  {localizedRestrictions.map((restriction, idx) => (
                    <li key={idx} className="text-gray-300 text-sm">• {restriction}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 추천 복장/준비물 */}
            {localizedRecommendations && localizedRecommendations.length > 0 && (
              <div className="bg-cyan-900/20 border border-cyan-400/30 rounded-lg p-4">
                <h3 className="font-bold mb-2 flex items-center gap-2 text-cyan-400">
                  💡 추천 복장/준비물
                </h3>
                <ul className="space-y-1">
                  {localizedRecommendations.map((rec, idx) => (
                    <li key={idx} className="text-gray-300 text-sm">• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 라인업 탭 */}
        <TabsContent value="lineup" className="text-white mt-4">
          {festival.lineup && festival.lineup.length > 0 ? (
            <div className="space-y-4">
              {festival.lineup.map((day, idx) => (
                <div key={idx} className="bg-gray-900 rounded-lg p-4">
                  <h3 className="text-lg font-bold mb-2">{day.date}</h3>
                  <div className="space-y-1">
                    {day.artists.map((artist, artistIdx) => (
                      <div key={artistIdx} className="text-gray-300">• {artist}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">라인업 정보가 없습니다.</p>
          )}
        </TabsContent>

        {/* 일정 탭 */}
        <TabsContent value="schedule" className="text-white mt-4">
          {festival.schedule && festival.schedule.length > 0 ? (
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
          ) : (
            <p className="text-gray-400">상세 일정이 곧 공개됩니다.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Comments Section */}
      <div className="px-4 py-6">
        <h2 className="text-white text-xl font-bold mb-4">댓글 ({comments.length})</h2>
        
        <div className="mb-6">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={user ? "댓글을 작성하세요..." : "로그인 후 댓글을 작성할 수 있습니다"}
            className="bg-gray-900 border-gray-800 text-white mb-2"
            rows={3}
            disabled={!user}
          />
          <Button
            onClick={handleCommentSubmit}
            disabled={!commentText.trim() && user}
            className="bg-cyan-500 hover:bg-cyan-600"
          >
            {user ? '댓글 작성' : '로그인 필요'}
          </Button>
        </div>

        <div className="space-y-4">
          {comments.map((comment) => (
            <Card key={comment.id} className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="font-bold text-white">{comment.user_name}</div>
                <div className="text-xs text-gray-500">
                  {safeFormatDate(comment.created_date, 'yy.MM.dd HH:mm')}
                </div>
              </div>
              <p className="text-gray-300">{comment.content}</p>
            </Card>
          ))}
        </div>

        {comments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            첫 댓글을 작성해보세요!
          </div>
        )}
      </div>

      {/* Fixed Bottom Ticket Button */}
      <div className="fixed bottom-16 left-0 right-0 bg-black border-t border-gray-800 px-4 py-1.5 z-40">
        <Button
          onClick={handleTicketButtonClick}
          className={`w-full h-11 text-sm font-bold rounded-xl ${
            isFreeEntry 
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
              : 'bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600'
          }`}
        >
          {isFreeEntry ? '입장료 무료' : '티켓 예약하기'}
        </Button>
      </div>

      {/* Free Entry Alert */}
      <AnimatePresence>
        {showFreeEntryAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowFreeEntryAlert(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="bg-gray-900 rounded-2xl p-8 mx-4 max-w-sm border border-green-500/30"
            >
              <div className="text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-white text-xl font-bold mb-2">입장료 무료</h3>
                <p className="text-gray-300 text-sm mb-4">
                  별도의 예약 없이 입장 가능합니다
                </p>
                <p className="text-gray-400 text-xs">
                  축제 기간 중 자유롭게 방문하세요!
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticket Platforms Modal */}
      <AnimatePresence>
        {showTicketModal && !isFreeEntry && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTicketModal(false)}
              className="fixed inset-0 bg-black/80 z-[60]"
            />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-gray-950 rounded-t-3xl z-[70] max-h-[80vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white text-xl font-bold">티켓 예약하기</h2>
                <button
                  onClick={() => setShowTicketModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="p-4 space-y-2">
                {ticketPlatforms.map((platform, idx) => (
                  <div
                    key={idx}
                    onClick={() => window.open(platform.url, '_blank')}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:bg-gray-800 hover:border-cyan-400/50 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-bold text-sm">{platform.name}</h3>
                          {idx === 0 && (
                            <Badge className="text-xs bg-yellow-500 text-black px-1.5 py-0 h-4">
                              ⭐
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-cyan-400 font-bold text-base">
                            ₩{platform.price.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-gray-400 text-xs">✓ {platform.benefit}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0 ml-3" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-6">
                <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-400">
                  <p className="mb-2">💡 <span className="text-white font-bold">구매 전 확인하세요</span></p>
                  <ul className="space-y-1 text-xs">
                    <li>• 각 판매처별로 가격과 혜택이 다를 수 있습니다</li>
                    <li>• 환불 정책은 판매처마다 상이하니 확인 후 구매하세요</li>
                    <li>• FESTEE에서 축제 인증(Catch)하면 랭커 혜택을 받을 수 있어요!</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                          <p className="text-gray-300 text-sm">{festival.city}, {festival.country}</p>
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
                  <p className="text-gray-300 text-sm">{festival.city}, {festival.country}</p>
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
                              <p className="text-white">영상을 불러올 수 없습니다</p>
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
                        {allGalleryItems[galleryPopupIndex]?.type === 'youtube' && '영상'}
                        {allGalleryItems[galleryPopupIndex]?.type === 'video' && '동영상'}
                        {allGalleryItems[galleryPopupIndex]?.type === 'image' && '사진'}
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
                        출처: {festival.video_channel_name}
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
    </div>
  );
}