import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart, MessageCircle, Bell, Star, Plane, Globe, Tag, Send, Play, Calendar, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import LoginPromptModal from "../components/LoginPromptModal";
import { useFestivalLocalizedContent } from "../components/FestivalLocalizedContent";

// 앱 초기 로드 시 홈 페이지로 리다이렉트 처리
if (typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '')) {
  window.history.replaceState(null, '', createPageUrl("Home"));
}

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

const calculateInfoScore = (festival) => {
  let score = 0;
  if (festival.description) score += 1;
  if (festival.thumbnail_url) score += 1;
  if (festival.video_url) score += 1;
  if (festival.website) score += 1;
  if (festival.highlights && festival.highlights.length > 0) score += 2;
  if (festival.lineup && festival.lineup.length > 0) score += 2;
  if (festival.tags && festival.tags.length > 0) score += festival.tags.length * 0.5;
  if (festival.price > 0) score += 1;
  if (festival.latitude && festival.longitude) score += 1;
  return score;
};

const removeDuplicateFestivals = (festivals) => {
  const festivalMap = new Map();
  
  festivals.forEach(festival => {
    const existing = festivalMap.get(festival.name);
    
    if (!existing) {
      festivalMap.set(festival.name, festival);
    } else {
      const existingScore = calculateInfoScore(existing);
      const currentScore = calculateInfoScore(festival);
      
      if (currentScore > existingScore) {
        festivalMap.set(festival.name, festival);
      }
    }
  });
  
  return Array.from(festivalMap.values());
};

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const getCountryNameInKorean = (country) => {
  const countryMap = {
    'Japan': '일본',
    'Korea': '한국',
    'South Korea': '한국',
    '대한민국': '한국',
    'China': '중국',
    'USA': '미국',
    'United States': '미국',
    'UK': '영국',
    'United Kingdom': '영국',
    'France': '프랑스',
    'Germany': '독일',
    'Italy': '이탈리아',
    'Spain': '스페인',
    'Thailand': '태국',
    'Vietnam': '베트남',
    'Philippines': '필리핀',
    'Indonesia': '인도네시아',
    'Malaysia': '말레이시아',
    'Singapore': '싱가포르',
    'Australia': '호주',
    'Canada': '캐나다',
    'Mexico': '멕시코',
    'Brazil': '브라질',
    'Argentina': '아르헨티나',
    'Netherlands': '네덜란드',
    'Belgium': '벨기에',
    'Switzerland': '스위스',
    'Austria': '오스트리아',
    'Sweden': '스웨덴',
    'Norway': '노르웨이',
    'Denmark': '덴마크',
    'Poland': '폴란드',
    'Czech Republic': '체코',
    'Hungary': '헝가리',
    'Russia': '러시아',
    'Turkey': '터키',
    'India': '인도',
    'Pakistan': '파키스탄',
    'Bangladesh': '방글라데시',
    'Taiwan': '대만',
    'Hong Kong': '홍콩',
    'New Zealand': '뉴질랜드',
  };
  
  return countryMap[country] || country;
};

const getRankColor = (index) => {
  if (index === 0) return "bg-gradient-to-r from-yellow-400 to-orange-500";
  if (index === 1) return "bg-gradient-to-r from-gray-300 to-gray-400";
  if (index === 2) return "bg-gradient-to-r from-amber-600 to-amber-700";
  return "bg-gray-700";
};

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  
  // URL에서 필터 초기값 읽기
  const [categoryFilter, setCategoryFilter] = useState(urlParams.get('category') || "all");
  const [countryFilter, setCountryFilter] = useState(urlParams.get('country') || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bannerIndex, setBannerIndex] = useState(0);
  const [dateRange, setDateRange] = useState(() => {
    const fromParam = urlParams.get('dateFrom');
    const toParam = urlParams.get('dateTo');
    return {
      from: fromParam ? new Date(fromParam) : null,
      to: toParam ? new Date(toParam) : null
    };
  });
  const [tempDateRange, setTempDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState(() => {
    const tagsParam = urlParams.get('tags');
    return tagsParam ? tagsParam.split(',') : [];
  });
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [showFeedbackCard, setShowFeedbackCard] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [searchPlaceholder, setSearchPlaceholder] = useState("");
  const [showBetaBanner, setShowBetaBanner] = useState(true);
  const [hidePastFestivals, setHidePastFestivals] = useState(urlParams.get('hidePast') !== 'false');
  const { getLocalizedContent } = useFestivalLocalizedContent();

  // URL 업데이트 함수
  const updateUrl = (filters) => {
    const params = new URLSearchParams();
    
    if (filters.category && filters.category !== 'all') params.set('category', filters.category);
    if (filters.country && filters.country !== 'all') params.set('country', filters.country);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
    if (filters.hidePast) params.set('hidePast', 'true');
    
    const newUrl = params.toString() ? `${createPageUrl('Home')}?${params.toString()}` : createPageUrl('Home');
    window.history.replaceState({}, '', newUrl);
  };

  // 필터 변경 시 URL 업데이트
  useEffect(() => {
    updateUrl({
      category: categoryFilter,
      country: countryFilter,
      dateFrom: dateRange.from?.toISOString(),
      dateTo: dateRange.to?.toISOString(),
      tags: selectedTags,
      hidePast: hidePastFestivals
    });
  }, [categoryFilter, countryFilter, dateRange, selectedTags, hidePastFestivals]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  useEffect(() => {
    const placeholders = [
      "어디로 떠나볼까요?",
      "무슨 축제 찾으세요?",
      "다음 여행지는?",
      "어떤 축제가 궁금해요?",
      "축제 검색하기"
    ];
    const randomPlaceholder = placeholders[Math.floor(Math.random() * placeholders.length)];
    setSearchPlaceholder(randomPlaceholder);
  }, []);

  // 베타 배너 sessionStorage 체크 (세션 단위로만 저장)
  useEffect(() => {
    const betaBannerDismissed = sessionStorage.getItem('betaBannerDismissed');
    if (betaBannerDismissed === 'true') {
      setShowBetaBanner(false);
    }
  }, []);

  const handleCloseBetaBanner = () => {
    setShowBetaBanner(false);
    // sessionStorage 사용: 브라우저 탭을 닫으면 다시 초기화됨
    sessionStorage.setItem('betaBannerDismissed', 'true');
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: rawFestivals, isLoading } = useQuery({
    queryKey: ['rawFestivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list('-likes_count', 200);
      return allFestivals;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const festivals = useMemo(() => {
    if (!rawFestivals) return [];
    
    const deduplicated = removeDuplicateFestivals(rawFestivals);
    
    return deduplicated.sort((a, b) => {
      const aLikes = a.likes_count || 0;
      const bLikes = b.likes_count || 0;
      return bLikes - aLikes;
    });
  }, [rawFestivals]);

  const { data: flightTimes = [] } = useQuery({
    queryKey: ['flightTimes'],
    queryFn: () => base44.entities.FlightTime.list(),
    staleTime: 1000 * 60 * 10,
  });

  const { data: advertisements = [] } = useQuery({
    queryKey: ['advertisements'],
    queryFn: () => base44.entities.Advertisement.filter({ is_active: true }, 'order'),
    staleTime: 1000 * 60 * 5,
  });

  const { data: myLikes = [] } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  // 실제 유저 데이터 기반 상위 5명
  const { data: topUsers = [] } = useQuery({
    queryKey: ['topUsers'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users
        .filter(u => (u.catches_count || 0) > 0)
        .sort((a, b) => (b.catches_count || 0) - (a.catches_count || 0))
        .slice(0, 5);
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ['unreadMessagesCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      const messages = await base44.entities.Message.filter({ 
        receiver_email: user.email,
        is_read: false 
      });
      return messages.length;
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  const { data: unreadNotificationsCount = 0, refetch: refetchNotificationCount } = useQuery({
    queryKey: ['unreadNotificationsCount', user?.email],
    queryFn: async () => {
      if (!user) return 0;
      const allNotifications = await base44.entities.Notification.filter({ 
        user_email: user.email
      }, '-created_date');
      const unreadNotifs = allNotifications.filter(n => !n.is_read);
      return unreadNotifs.length;
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (user) {
      refetchNotificationCount();
    }
  }, [user, refetchNotificationCount]);

  const likeMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (!user) {
        setShowLoginModal(true);
        return;
      }
      
      const existing = myLikes.find(like => like.festival_id === festivalId);
      const festival = rawFestivals?.find(f => f.id === festivalId);
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
      queryClient.invalidateQueries({ queryKey: ['rawFestivals'] }); 
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
      queryClient.invalidateQueries({ queryKey: ['festival'] });
    },
  });

  const dismissFeedbackCard = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({ 
        feedback_card_dismissed: true 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setShowFeedbackCard(false);
    },
  });

  useEffect(() => {
    if (user?.feedback_card_dismissed) {
      setShowFeedbackCard(false);
    }
  }, [user]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleDateFilterApply = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };

  const handleDateFilterReset = () => {
    setTempDateRange({ from: null, to: null });
    setDateRange({ from: null, to: null });
    setIsDatePickerOpen(false);
  };

  const filteredFestivals = festivals.filter(festival => {
    const categoryMatch = categoryFilter === "all" || festival.category === categoryFilter;
    const countryMatch = countryFilter === "all" || festival.country === countryFilter;
    const searchMatch = !searchQuery || 
      getLocalizedContent(festival, 'name').toLowerCase().includes(searchQuery.toLowerCase()) ||
      festival.city.toLowerCase().includes(searchQuery.toLowerCase());
    
    let dateMatch = true;
    if (dateRange && dateRange.from && dateRange.to) {
      const festivalStart = festival.start_date ? new Date(festival.start_date) : null;
      const festivalEnd = festival.end_date ? new Date(festival.end_date) : null;
      
      if (festivalStart && festivalEnd) {
        const normalizedDateRangeTo = new Date(dateRange.to);
        normalizedDateRangeTo.setHours(23, 59, 59, 999);
        dateMatch = (festivalStart <= normalizedDateRangeTo && festivalEnd >= dateRange.from);
      }
    }
    
    const tagsMatch = selectedTags.length === 0 || 
      (festival.tags && selectedTags.every(tag => festival.tags.includes(tag)));
    
    // 지난 축제 필터링
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day for comparison
    const pastFestivalMatch = !hidePastFestivals || 
      (festival.end_date && new Date(festival.end_date) >= today);
    
    return categoryMatch && countryMatch && searchMatch && dateMatch && tagsMatch && pastFestivalMatch;
  });

  const banners = useMemo(() => {
    const festivalBanners = filteredFestivals.slice(0, 3).map(festival => ({
      type: 'festival',
      id: festival.id,
      name: getLocalizedContent(festival, 'name'),
      image: festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
      date: festival.start_date && festival.end_date 
        ? `${safeFormatDate(festival.start_date, 'M월 d일')}-${safeFormatDate(festival.end_date, 'M월 d일')}`
        : '날짜 미정',
    }));

    const adBanners = advertisements.map(ad => ({
      type: 'ad',
      name: ad.name || 'Advertisement',
      image: ad.image_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
      videoUrl: ad.video_url,
      link: ad.link_url,
    }));
    
    if (adBanners.length > 0) {
      return [adBanners[0], ...festivalBanners, ...adBanners.slice(1)];
    }
    
    return festivalBanners;
  }, [filteredFestivals, advertisements, getLocalizedContent]);

  const countries = [...new Set(festivals.map(f => f.country))];
  const categories = ["음악", "문화", "예술", "음식", "스포츠", "지역축제", "기타"];
  const quickFilters = ["연인과", "Kpop", "불꽃놀이", "반려동물", "가족과", "여름", "무료"];

  const nearbyFestivals = useMemo(() => {
    if (!user?.home_city || !festivals.length || !flightTimes.length) return [];
    
    const userCountry = user?.home_country || '대한민국';
    const koreaVariations = ['대한민국', '한국', 'Korea', 'South Korea', '韩国', '대한민국(한국)'];
    
    return festivals
      .filter(f => {
        if (koreaVariations.includes(userCountry)) {
          if (koreaVariations.some(variation => f.country === variation)) {
            return false;
          }
        } else {
          if (f.country === userCountry) {
            return false;
          }
        }
        
        const flightTime = flightTimes.find(ft => 
          ft.origin_city === user.home_city && ft.destination_city === f.city
        );
        
        return flightTime && flightTime.duration_hours <= 3;
      })
      .slice(0, 10);
  }, [festivals, flightTimes, user?.home_city, user?.home_country]);

  const europeFestivals = useMemo(() => {
    const europeanCountries = ['독일', '프랑스', '영국', '스페인', '이탈리아', '네덜란드', '벨기에', '스위스', '오스트리아'];
    return festivals
      .filter(f => europeanCountries.includes(f.country))
      .slice(0, 10);
  }, [festivals]);

  const koreaWinterFestivals = useMemo(() => {
    return festivals
      .filter(f => {
        if (f.country !== '대한민국') return false;
        if (!f.start_date) return false;
        const month = new Date(f.start_date).getMonth() + 1;
        return month === 12 || month === 1 || month === 2;
      })
      .slice(0, 10);
  }, [festivals]);

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

    if (distance > minSwipeDistance) {
      setBannerIndex((prev) => (prev + 1) % banners.length);
    } else if (distance < -minSwipeDistance) {
      setBannerIndex((prev) => (prev - 1 + banners.length) % banners.length);
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleBannerClick = () => {
    const currentBanner = banners[bannerIndex];
    if (!currentBanner) return;

    if (currentBanner.type === 'festival') {
      navigate(createPageUrl(`FestivalDetail?id=${currentBanner.id}`));
    } else if (currentBanner.type === 'ad') {
      if (currentBanner.videoUrl) {
        const youtubeEmbedUrl = currentBanner.videoUrl
          .replace('youtu.be/', 'youtube.com/embed/')
          .replace('watch?v=', 'embed/')
          .split('&')[0];
        setVideoUrl(youtubeEmbedUrl + '?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1');
        setShowVideoModal(true);
      } else if (currentBanner.link) {
        window.open(currentBanner.link, '_blank');
      }
    }
  };

  useEffect(() => {
    if (banners.length === 0) return;
    const timer = setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black pb-20">
        <div className="sticky top-0 z-50 bg-black px-4 pt-4 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-12 bg-gray-900 rounded-xl animate-pulse"></div>
            <div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse"></div>
            <div className="w-12 h-12 rounded-full bg-gray-900 animate-pulse"></div>
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="h-48 bg-gray-900 rounded-2xl animate-pulse mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-900 animate-pulse h-24"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message="축제에 좋아요를 누르려면 로그인이 필요합니다"
      />

      <AnimatePresence>
        {showVideoModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVideoModal(false)}
              className="fixed inset-0 bg-black/95 z-[100] backdrop-blur-sm"
            />
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl"
              >
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/70 hover:bg-black flex items-center justify-center transition-colors border border-gray-700"
                >
                  <span className="text-white text-2xl">&times;</span>
                </button>
                <iframe
                  src={videoUrl}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <div className="sticky top-0 z-50 bg-black px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl("Search")} className="flex-1">
            <div className="flex items-center bg-gray-900 rounded-xl border border-gray-800 h-12">
              <input
                type="text"
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500 px-4 h-full rounded-xl"
                readOnly
              />
            </div>
          </Link>
          <Link to={createPageUrl("Messages")}>
            <button className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center relative flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-gray-400" />
              {unreadMessagesCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-pink-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </button>
          </Link>
          <Link to={createPageUrl("Notifications")}>
            <button className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center relative flex-shrink-0">
              <Bell className="w-5 h-5 text-gray-400" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-cyan-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {showBetaBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sticky top-[73px] z-40 bg-gradient-to-r from-cyan-900/80 to-purple-900/80 backdrop-blur-sm border-b border-cyan-400/30"
          >
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    현재 베타 서비스 중입니다 🚀
                  </p>
                  <p className="text-cyan-300 text-xs truncate">
                    피드백을 남겨 더 나은 서비스를 만들어주세요!
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseBetaBanner}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0 ml-2"
                aria-label="배너 닫기"
              >
                <X className="w-4 h-4 text-gray-300" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {banners.length > 0 && (
        <div className="px-4 py-4">
          <div 
            className="relative h-48 rounded-2xl overflow-hidden cursor-pointer group"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleBannerClick}
          >
            {banners[bannerIndex] && (
              <>
                <img
                  src={banners[bannerIndex].image}
                  alt={banners[bannerIndex].name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                
                {banners[bannerIndex].type === 'ad' && banners[bannerIndex].videoUrl && (
                  <div className="absolute bottom-4 right-4">
                    <div className="w-12 h-12 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-all group-hover:scale-110 shadow-lg">
                      <Play className="w-6 h-6 text-red-600 ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 right-20">
                  {banners[bannerIndex].type === 'festival' ? (
                    <>
                      <p className="text-white text-base font-medium mb-1">
                        Don't miss a moment of
                      </p>
                      <p className="text-white text-xl font-bold mb-2">
                        {banners[bannerIndex].name}
                      </p>
                      <p className="text-gray-300 text-sm">
                        {banners[bannerIndex].date}
                      </p>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-yellow-500 text-black font-bold mb-2">AD</Badge>
                      <p className="text-white text-xl font-bold mb-1">
                        {banners[bannerIndex].name}
                      </p>
                      <p className="text-gray-300 text-sm">
                        {banners[bannerIndex].videoUrl ? '클릭하여 영상 시청하기' : 'Click to learn more'}
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-center gap-2 mt-3">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setBannerIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === bannerIndex ? 'bg-cyan-400 w-4' : 'bg-gray-600 w-2'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pt-4">
        {/* Top Festival Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-2xl font-bold">Top Festival</h2>
            <Link to={createPageUrl("FestivalMore")}>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                더보기 →
              </Button>
            </Link>
          </div>

          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-auto min-w-[80px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <SelectValue>
                    {countryFilter === "all" ? "국가" : getCountryNameInKorean(countryFilter)}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 text-white">
                <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">전체 국가</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                    {getCountryNameInKorean(country)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-auto min-w-[80px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-purple-400" />
                  <SelectValue>
                    {categoryFilter === "all" ? "분류" : categoryFilter}
                  </SelectValue>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 text-white">
                <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">전체 분류</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <button className="px-4 h-9 bg-gray-900 text-white rounded-full whitespace-nowrap flex items-center gap-2 text-sm hover:bg-gray-800 transition-colors">
                  <Calendar className="w-4 h-4 text-pink-500" />
                  {dateRange.from && dateRange.to ? (
                    <span className="text-cyan-400">
                      {safeFormatDate(dateRange.from, 'M/d')} - {safeFormatDate(dateRange.to, 'M/d')}
                    </span>
                  ) : (
                    <span>날짜</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-transparent border-0">
                <DateRangePicker
                  selected={tempDateRange}
                  onSelect={setTempDateRange}
                  onApply={handleDateFilterApply}
                  onReset={handleDateFilterReset}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
            {quickFilters.map(filter => (
              <Button
                key={filter}
                onClick={() => toggleTag(filter)}
                variant="outline"
                size="sm"
                className={`rounded-full whitespace-nowrap h-8 text-xs transition-all ${
                  selectedTags.includes(filter)
                    ? 'bg-cyan-400 text-black border-cyan-400 hover:bg-cyan-500 hover:text-black'
                    : 'border-gray-700 bg-gray-900 text-white hover:bg-gray-800 hover:border-gray-600 hover:text-white'
                }`}
              >
                {filter}
              </Button>
            ))}
          </div>

          {/* 지난 축제 보기 토글 */}
          <div className="flex items-center justify-end gap-3 mb-4 py-2">
            <span className="text-white text-sm font-medium">지난 축제 보기</span>
            <Switch
              checked={!hidePastFestivals}
              onCheckedChange={(checked) => setHidePastFestivals(!checked)}
              className="data-[state=checked]:bg-cyan-500"
            />
          </div>

          {(selectedTags.length > 0 || categoryFilter !== "all" || countryFilter !== "all" || dateRange.from || hidePastFestivals) && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-gray-400 text-xs">활성 필터:</span>
              {categoryFilter !== "all" && (
                <Badge 
                  variant="outline" 
                  className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer"
                  onClick={() => setCategoryFilter("all")}
                >
                  {categoryFilter} ✕
                </Badge>
              )}
              {countryFilter !== "all" && (
                <Badge 
                  variant="outline" 
                  className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer"
                  onClick={() => setCountryFilter("all")}
                >
                  {getCountryNameInKorean(countryFilter)} ✕
                </Badge>
              )}
              {dateRange.from && dateRange.to && (
                <Badge 
                  variant="outline" 
                  className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer"
                  onClick={() => setDateRange({ from: null, to: null })}
                >
                  {safeFormatDate(dateRange.from, 'M/d')} - {safeFormatDate(dateRange.to, 'M/d')} ✕
                </Badge>
              )}
              {!hidePastFestivals && (
                <Badge 
                  variant="outline" 
                  className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer"
                  onClick={() => setHidePastFestivals(true)}
                >
                  지난 축제 포함 ✕
                </Badge>
              )}
              {selectedTags.map(tag => (
                <Badge 
                  key={tag}
                  variant="outline" 
                  className="bg-pink-900/30 text-pink-400 border-pink-400/50 cursor-pointer"
                  onClick={() => toggleTag(tag)}
                >
                  {tag} ✕
                </Badge>
              ))}
              <Button
                onClick={() => {
                  setCategoryFilter("all");
                  setCountryFilter("all");
                  setDateRange({ from: null, to: null });
                  setSearchQuery("");
                  setSelectedTags([]);
                  setHidePastFestivals(true);
                }}
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-white h-6"
              >
                모두 지우기
              </Button>
            </div>
          )}

          {/* Festival List */}
          <div className="space-y-3">
            {filteredFestivals.slice(0, 5).map((festival, index) => {
              const isLiked = myLikes.some(like => like.festival_id === festival.id);
              const dateStatus = festival.date_status || 'confirmed';
              const localizedName = getLocalizedContent(festival, 'name');
              
              return (
                <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-900/50 hover:bg-gray-900 transition-all">
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-lg ${getRankColor(index)} flex items-center justify-center font-bold text-sm ${index < 3 ? 'text-black' : 'text-white'}`}>
                        {index + 1}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <img
                        src={festival.thumbnail_url}
                        alt={localizedName}
                        className="w-16 h-16 rounded-xl object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-sm truncate mb-1">
                        {localizedName}
                      </h3>
                      <div className="text-gray-400 text-xs">
                        {festival.city}, {festival.country}{festival.category ? ` / ${festival.category}` : ''}
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
                        likeMutation.mutate(festival.id);
                      }}
                      className="flex-shrink-0 flex flex-col items-center gap-1"
                    >
                      <Heart
                        className={`w-6 h-6 transition-all ${
                          isLiked
                            ? 'fill-pink-500 text-pink-500'
                            : 'text-gray-500'
                        }`}
                      />
                      <span className={`text-xs font-medium ${isLiked ? 'text-pink-500' : 'text-gray-500'}`}>
                        {formatNumber(festival.likes_count || 0)}
                      </span>
                    </button>
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredFestivals.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-2">선택한 조건에 맞는 축제가 없습니다</p>
              <Button
                onClick={() => {
                  setCategoryFilter("all");
                  setCountryFilter("all");
                  setDateRange({ from: null, to: null });
                  setSearchQuery("");
                  setSelectedTags([]);
                  setHidePastFestivals(true);
                }}
                variant="outline"
                className="bg-gray-900 text-white border-gray-800 hover:bg-gray-800"
              >
                필터 초기화
              </Button>
            </div>
          )}
        </div>

        {showFeedbackCard && user && (
          <Card className="bg-gradient-to-r from-cyan-900/20 via-purple-900/20 to-pink-900/20 border-2 border-cyan-400/30 p-6 relative overflow-hidden mb-8">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-400/10 to-pink-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/10 to-cyan-500/10 rounded-full blur-2xl"></div>
            
            <button
              onClick={() => dismissFeedbackCard.mutate()}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-800/50 hover:bg-gray-700/50 flex items-center justify-center transition-colors"
            >
              <span className="text-gray-400 text-lg">×</span>
            </button>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center">
                  <span className="text-2xl">💡</span>
                </div>
                <div>
                  <h3 className="text-white text-lg font-bold">Festee를 개선해주세요!</h3>
                  <p className="text-cyan-400 text-xs">여러분의 의견이 중요합니다</p>
                </div>
              </div>

              <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                여러분의 소중한 의견이 Festee를 만듭니다. 
                <br />
                버그 제보, 기능 제안, 칭찬 등 자유롭게 남겨주세요!
              </p>

              <div className="flex gap-3">
                <Link to={createPageUrl("FeedbackForm")} className="flex-1">
                  <Button className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold rounded-xl h-11">
                    <Send className="w-4 h-4 mr-2" />
                    피드백 보내기
                  </Button>
                </Link>
                <Button
                  onClick={() => setShowFeedbackCard(false)}
                  variant="outline"
                  className="border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl px-4"
                >
                  다음에
                </Button>
              </div>

              <p className="text-gray-500 text-xs mt-3 text-center">
                ⭐ 피드백을 주시면 더 나은 서비스로 보답하겠습니다
              </p>
            </div>
          </Card>
        )}

        {topUsers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-xl font-bold mb-4">Festival Ranker</h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {topUsers.map((user) => (
                  <Link 
                    key={user.id}
                    to={createPageUrl(`UserProfile?email=${user.email}`)}
                    className="flex-shrink-0"
                  >
                    <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4 w-32">
                      <div className="text-center">
                        <div className="relative w-20 h-20 mx-auto mb-3">
                          <img
                            src={user.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
                            alt={user.full_name}
                            className="w-full h-full rounded-full object-cover border-2 border-cyan-400"
                          />
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center border-2 border-black">
                            <span className="text-black font-bold text-xs">
                              {user.catches_count || 0}
                            </span>
                          </div>
                        </div>
                        <h3 className="text-white font-bold text-sm mb-1 truncate">
                          {user.full_name}
                        </h3>
                        <p className="text-gray-500 text-xs truncate">
                          {user.catches_count || 0} catches
                        </p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {nearbyFestivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
              <Plane className="w-6 h-6 text-cyan-400" />
              {user?.home_city || '서울'}에서 비행 3시간 이내 해외축제
            </h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {nearbyFestivals.map((festival) => {
                  const localizedName = getLocalizedContent(festival, 'name');
                  const flightTime = flightTimes.find(ft => 
                    ft.origin_city === user?.home_city && ft.destination_city === festival.city
                  );
                  
                  return (
                    <Link 
                      key={festival.id} 
                      to={createPageUrl(`FestivalDetail?id=${festival.id}`)}
                      className="flex-shrink-0 w-36"
                    >
                      <div className="relative rounded-xl overflow-hidden group">
                        <div className="relative aspect-[3/4]">
                          <img 
                            src={festival.thumbnail_url} 
                            alt={localizedName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          
                          {flightTime && (
                            <div className="absolute top-2 right-2">
                              <Badge className="bg-cyan-500 text-white font-bold px-2 py-0.5 flex items-center gap-1 text-xs">
                                <Plane className="w-3 h-3" />
                                {flightTime.duration_hours}h
                              </Badge>
                            </div>
                          )}
                          
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <h3 className="text-white text-base font-bold mb-1 line-clamp-2">
                              {localizedName}
                            </h3>
                            <p className="text-gray-300 text-xs">
                              {festival.city}, {festival.country}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {europeFestivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-xl font-bold mb-4">
              랭커들이 공통으로 추천하는 축제
            </h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {europeFestivals.map((festival) => {
                  const localizedName = getLocalizedContent(festival, 'name');
                  
                  return (
                    <Link 
                      key={festival.id} 
                      to={createPageUrl(`FestivalDetail?id=${festival.id}`)}
                      className="flex-shrink-0 w-36"
                    >
                      <div className="relative rounded-xl overflow-hidden group">
                        <div className="relative aspect-[3/4]">
                          <img 
                            src={festival.thumbnail_url} 
                            alt={localizedName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <h3 className="text-white text-base font-bold mb-1 line-clamp-2">
                              {localizedName}
                            </h3>
                            <p className="text-gray-300 text-xs">
                              {festival.city}, {festival.country}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {koreaWinterFestivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-xl font-bold mb-4">
              대한민국에서 인기 있는 축제
            </h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {koreaWinterFestivals.map((festival) => {
                  const localizedName = getLocalizedContent(festival, 'name');

                  return (
                    <Link 
                      key={festival.id} 
                      to={createPageUrl(`FestivalDetail?id=${festival.id}`)}
                      className="flex-shrink-0 w-36"
                    >
                      <div className="relative rounded-xl overflow-hidden group">
                        <div className="relative aspect-[3/4]">
                          <img 
                            src={festival.thumbnail_url} 
                            alt={localizedName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <h3 className="text-white text-base font-bold mb-1 line-clamp-2">
                              {localizedName}
                            </h3>
                            <p className="text-gray-300 text-xs">
                              {festival.city}, {festival.country}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}