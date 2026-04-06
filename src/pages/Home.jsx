import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart, MessageCircle, Bell, Star, Plane, Globe, Tag, Send, Play, Calendar, X, AlertCircle, ArrowUpDown, Info, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import LoginPromptModal from "../components/LoginPromptModal";
import { useFestivalLocalizedContent } from "../components/FestivalLocalizedContent";
import HomeChatbot from "../components/HomeChatbot";
import FestivalListItem from "../components/FestivalListItem";
import DateRangeBottomSheet from "../components/DateRangeBottomSheet";

// 앱 초기 로드 시 홈 페이지로 리다이렉트 처리
if (typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '')) {
  window.history.replaceState(null, '', createPageUrl("Home"));
}

const extractMonthFromQuery = (query) => {
  if (!query) return null;
  const match = query.match(/(\d{1,2})월/);
  if (match) {
    const month = parseInt(match[1]);
    if (month >= 1 && month <= 12) return month;
  }
  return null;
};

const festivalIncludesMonth = (festival, month) => {
  if (!festival.start_date || !festival.end_date) return false;
  const start = new Date(festival.start_date);
  const end = new Date(festival.end_date);
  const startMonth = start.getMonth() + 1;
  const endMonth = end.getMonth() + 1;
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear === endYear) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
};

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
  if (festival.tags_ko && festival.tags_ko.length > 0) score += festival.tags_ko.length * 0.5;
  if (festival.price > 0) score += 1;
  if (festival.latitude && festival.longitude) score += 1;
  return score;
};

const removeDuplicateFestivals = (festivals) => {
  const festivalMap = new Map();
  
  festivals.forEach(festival => {
    const key = festival.name_original || festival.name_ko || festival.name;
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

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const getCountryNameInKorean = (country) => {
  const countryMap = {
    'Japan': '일본',
    'Korea': '대한민국',
    'South Korea': '대한민국',
    '대한민국': '대한민국',
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
  if (index === 0) return "bg-cyan-400 text-black";
  if (index === 1) return "bg-gray-600 text-white";
  if (index === 2) return "bg-gray-700 text-white";
  return "bg-gray-800 text-gray-400";
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showFeedbackCard, setShowFeedbackCard] = useState(true);
  const [sortOrder, setSortOrder] = useState("popularity"); // popularity | likes | date
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [searchPlaceholder, setSearchPlaceholder] = useState("");
  const [showBetaBanner, setShowBetaBanner] = useState(true);
  const [hidePastFestivals, setHidePastFestivals] = useState(urlParams.get('hidePast') !== 'false');
  const [showPopularityTooltip, setShowPopularityTooltip] = useState(false);
  const [showRankerTooltip, setShowRankerTooltip] = useState(false);
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
      const allFestivals = await base44.entities.Festival.list('-shorts_views_5_total', 500);
      return allFestivals;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const festivals = useMemo(() => {
    if (!rawFestivals) return [];
    return removeDuplicateFestivals(rawFestivals);
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
    
    const monthFilter = extractMonthFromQuery(searchQuery);
    const searchMatch = !searchQuery || 
      (monthFilter !== null
        ? festivalIncludesMonth(festival, monthFilter)
        : (getLocalizedContent(festival, 'name').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (festival.city || '').toLowerCase().includes(searchQuery.toLowerCase())));
    
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
      (festival.tags_ko && selectedTags.every(tag => festival.tags_ko.includes(tag)));
    
    // 지난 축제 필터링
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day for comparison
    const pastFestivalMatch = !hidePastFestivals || 
      (festival.end_date && new Date(festival.end_date) >= today);
    
    return categoryMatch && countryMatch && searchMatch && dateMatch && tagsMatch && pastFestivalMatch;
  }).sort((a, b) => {
    if (sortOrder === "popularity") return (b.shorts_views_5_total || 0) - (a.shorts_views_5_total || 0);
    if (sortOrder === "likes") return (b.likes_count || 0) - (a.likes_count || 0);
    if (sortOrder === "date") return new Date(a.start_date || 0) - new Date(b.start_date || 0);
    return 0;
  });

  const banners = useMemo(() => {
    const makeFestivalBanner = (festival) => ({
      type: 'festival',
      id: festival.id,
      name: getLocalizedContent(festival, 'name'),
      image: festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
      date: festival.start_date && festival.end_date
        ? `${safeFormatDate(festival.start_date, 'M월 d일')}-${safeFormatDate(festival.end_date, 'M월 d일')}`
        : '날짜 미정',
    });

    const result = [];

    advertisements.filter(ad => ad.is_active !== false).forEach(ad => {
      // 광고 배너 추가
      result.push({
        type: 'ad',
        name: ad.name || 'Advertisement',
        image: ad.image_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800',
        videoUrl: ad.video_url,
        link: ad.link_url,
      });

      // 이 광고에 지정된 축제들 추가
      if (ad.featured_festival_ids && ad.featured_festival_ids.length > 0) {
        ad.featured_festival_ids.forEach(fid => {
          const festival = festivals.find(f => f.id === fid);
          if (festival) result.push(makeFestivalBanner(festival));
        });
      }
    });

    // 광고가 없거나 지정 축제가 없으면 인기 축제 자동 배치
    if (result.length === 0) {
      filteredFestivals.slice(0, 3).forEach(f => result.push(makeFestivalBanner(f)));
    } else if (!advertisements.some(ad => ad.featured_festival_ids?.length > 0)) {
      // 광고는 있지만 지정 축제가 하나도 없으면 인기 축제 추가
      filteredFestivals.slice(0, 3).forEach(f => result.push(makeFestivalBanner(f)));
    }

    return result;
  }, [filteredFestivals, festivals, advertisements, getLocalizedContent]);

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

  const koreaPopularFestivals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const koreaVariations = ['대한민국', '한국', 'Korea', 'South Korea'];
    return festivals
      .filter(f => koreaVariations.includes(f.country) && f.end_date && new Date(f.end_date) >= today)
      .sort((a, b) => (b.shorts_views_5_total || 0) - (a.shorts_views_5_total || 0))
      .slice(0, 10);
  }, [festivals]);

  const foodFestivals = useMemo(() => {
    return festivals
      .filter(f => f.category === '음식')
      .sort((a, b) => (b.shorts_views_5_total || 0) - (a.shorts_views_5_total || 0))
      .slice(0, 10);
  }, [festivals]);

  const cherryBlossomFestivals = useMemo(() => {
    return festivals
      .filter(f => (f.name_ko || f.name_original || '').includes('벚꽃'))
      .sort((a, b) => (b.shorts_views_5_total || 0) - (a.shorts_views_5_total || 0))
      .slice(0, 10);
  }, [festivals]);

  const japanPopularFestivals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return festivals
      .filter(f => f.country === 'Japan' && f.end_date && new Date(f.end_date) >= today)
      .sort((a, b) => (b.shorts_views_5_total || 0) - (a.shorts_views_5_total || 0))
      .slice(0, 10);
  }, [festivals]);

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(e.targetTouches[0].clientX);
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e) => {
    const currentX = e.targetTouches[0].clientX;
    setTouchEnd(currentX);
    setDragOffset(currentX - touchStart);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      setBannerIndex((prev) => prev + 1);
    } else if (distance < -minSwipeDistance) {
      setBannerIndex((prev) => prev - 1);
    }

    setTouchStart(0);
    setTouchEnd(0);
    setDragOffset(0);
    setIsDragging(false);
  };

  // 무한 루프를 위해 앞뒤에 복제 배너 포함한 확장 배열
  const loopedBanners = banners.length > 0
    ? [banners[banners.length - 1], ...banners, banners[0]]
    : [];

  // 경계에서 무한 루프 처리: transition 없이 반대쪽으로 점프
  const [isJumping, setIsJumping] = useState(false);

  useEffect(() => {
    if (isJumping) return;
    if (banners.length === 0) return;

    // bannerIndex가 -1이면 마지막으로, length이면 첫번째로 점프
    if (bannerIndex === -1) {
      const timer = setTimeout(() => {
        setIsJumping(true);
        setBannerIndex(banners.length - 1);
        setTimeout(() => setIsJumping(false), 50);
      }, 300);
      return () => clearTimeout(timer);
    }
    if (bannerIndex === banners.length) {
      const timer = setTimeout(() => {
        setIsJumping(true);
        setBannerIndex(0);
        setTimeout(() => setIsJumping(false), 50);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [bannerIndex, banners.length, isJumping]);

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
    if (banners.length === 0 || isDragging) return;
    const timer = setInterval(() => {
      setBannerIndex((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length, isDragging]);

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
        <div className="py-4" style={{ backgroundColor: '#000' }}>
          {/* 캐러셀 트랙 */}
          <div
            className="relative overflow-hidden"
            style={{ height: '208px', backgroundColor: '#000' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={`flex ${isDragging || isJumping ? '' : 'transition-transform duration-300 ease-out'}`}
              style={{
                height: '208px',
                backgroundColor: '#000',
                transform: `translateX(calc(-${bannerIndex + 1} * 84vw + 8vw + ${dragOffset}px))`,
              }}
            >
              {loopedBanners.map((banner, idx) => {
                const isCenter = idx === bannerIndex + 1;
                return (
                  <div
                    key={idx}
                    className="flex-shrink-0"
                    style={{ width: '84vw', height: '208px', padding: '0 8px', backgroundColor: '#000' }}
                    onClick={() => {
                      if (isCenter) {
                        handleBannerClick();
                      } else if (idx < bannerIndex + 1) {
                        setBannerIndex((prev) => prev - 1);
                      } else {
                        setBannerIndex((prev) => prev + 1);
                      }
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#000',
                        transform: isCenter ? 'scale(1)' : 'scale(0.95)',
                        transition: 'transform 300ms',
                      }}
                      className="relative w-full h-full rounded-2xl overflow-hidden cursor-pointer"
                    >
                      <img
                        src={banner.image}
                        alt={banner.name}
                        className="w-full h-full object-cover"
                        style={{ backgroundColor: '#000', display: 'block' }}
                      />
                      {/* 반투명 오버레이 레이어 */}
                      {!isCenter && (
                        <div 
                          className="absolute inset-0 bg-black/50 z-10 pointer-events-none transition-opacity duration-300" 
                        />
                      )}

                      {isCenter && banner.type === 'ad' && banner.videoUrl && (
                        <div className="absolute bottom-4 right-4">
                          <div className="w-12 h-12 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-all shadow-lg">
                            <Play className="w-6 h-6 text-red-600 ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                        {banner.type === 'festival' ? (
                          <>
                            <p className="text-white text-base font-bold mb-1 drop-shadow-lg">
                              {banner.name}
                            </p>
                            <p className="text-gray-200 text-xs drop-shadow">
                              {banner.date}
                            </p>
                          </>
                        ) : (
                          <>
                            <Badge className="bg-yellow-500 text-black font-bold mb-2">AD</Badge>
                            <p className="text-white text-xl font-bold mb-1 drop-shadow-lg">
                              {banner.name}
                            </p>
                            <p className="text-gray-200 text-sm drop-shadow">
                              {banner.videoUrl ? '클릭하여 영상 시청하기' : 'Click to learn more'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 인디케이터 */}
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
            <div className="flex items-center gap-2 relative">
              <h2 className="text-white text-2xl font-bold">축제 차트</h2>
              <button
                onClick={() => setShowPopularityTooltip(!showPopularityTooltip)}
                className="w-5 h-5 rounded-full border border-gray-500 flex items-center justify-center hover:border-cyan-400 hover:text-cyan-400 text-gray-400 transition-colors flex-shrink-0"
              >
                <Info className="w-3 h-3" />
              </button>
              {showPopularityTooltip && (
                <div className="absolute top-full left-0 mt-2 bg-gray-800 text-white text-xs rounded-lg p-3 border border-gray-700 shadow-lg w-56 z-10">
                  <button
                    onClick={() => setShowPopularityTooltip(false)}
                    className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="font-bold text-cyan-400 mb-1 pr-4">인기도 순위의 기준은 무엇인가요?</p>
                  <p className="text-gray-300">축제마다 관련성 기준으로 선정된<br/>TOP5 영상의 각 조회수를 합산합니다</p>
                </div>
              )}
            </div>
            <Link to={createPageUrl("FestivalMore")}>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                더보기 →
              </Button>
            </Link>
          </div>



          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${countryFilter !== "all" ? "bg-cyan-500/20 border-cyan-400 text-cyan-400" : "bg-gray-900 border-gray-800 text-white"}`}>
                <div className="flex items-center gap-1.5 text-xs">
                  <Globe className={`w-4 h-4 ${countryFilter !== "all" ? "text-cyan-400" : "text-cyan-400"}`} />
                  <span>국가</span>
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
              <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${categoryFilter !== "all" ? "bg-purple-500/20 border-purple-400 text-purple-400" : "bg-gray-900 border-gray-800 text-white"}`}>
                <div className="flex items-center gap-1.5 text-xs">
                  <Tag className="w-4 h-4 text-purple-400" />
                  <span>분류</span>
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
              <span>날짜</span>
            </button>

            <DateRangeBottomSheet
              isOpen={isDatePickerOpen}
              onClose={() => setIsDatePickerOpen(false)}
              dateRange={dateRange}
              onApply={(range) => setDateRange(range)}
            />

            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${sortOrder !== "popularity" ? "bg-yellow-500/20 border-yellow-400 text-yellow-400" : "bg-gray-900 border-gray-800 text-white"}`}>
                <div className="flex items-center gap-1.5 text-xs">
                  <ArrowUpDown className="w-4 h-4 text-yellow-400" />
                  <span>{sortOrder === "popularity" ? "인기도순" : sortOrder === "likes" ? "좋아요순" : "날짜순"}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 text-white">
                <SelectItem value="popularity" className="text-white hover:bg-gray-800 focus:bg-gray-800">인기도순</SelectItem>
                <SelectItem value="likes" className="text-white hover:bg-gray-800 focus:bg-gray-800">좋아요순</SelectItem>
                <SelectItem value="date" className="text-white hover:bg-gray-800 focus:bg-gray-800">날짜순</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selectedTags.length > 0 || categoryFilter !== "all" || countryFilter !== "all" || dateRange.from || !hidePastFestivals) && (
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

          {/* Festival List - 5개씩 4페이지 가로 스크롤, 20위까지 */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 pl-4">
            <div className="flex" style={{ width: 'max-content' }}>
              {[0, 1, 2, 3].map((pageIdx) => (
                <div key={pageIdx} className="flex pr-4" style={{ width: 'calc(100vw - 40px)', flexShrink: 0 }}>
                  {/* 현재 페이지 아이템 */}
                  <div className="space-y-3 flex-1 min-w-0">
                    {filteredFestivals.slice(pageIdx * 5, pageIdx * 5 + 5).map((festival, i) => (
                      <FestivalListItem
                        key={festival.id}
                        festival={festival}
                        index={pageIdx * 5 + i}
                        isLiked={myLikes.some(like => like.festival_id === festival.id)}
                        onLike={(id) => likeMutation.mutate(id)}
                        getLocalizedContent={getLocalizedContent}
                      />
                    ))}
                  </div>

                </div>
              ))}
            </div>
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
            <div className="flex items-center gap-2 relative mb-4">
              <h2 className="text-white text-2xl font-bold">페스티 랭커</h2>
              <button
                onClick={() => setShowRankerTooltip(!showRankerTooltip)}
                className="w-5 h-5 rounded-full border border-gray-500 flex items-center justify-center hover:border-cyan-400 hover:text-cyan-400 text-gray-400 transition-colors flex-shrink-0"
              >
                <Info className="w-3 h-3" />
              </button>
              {showRankerTooltip && (
                <div className="absolute top-full left-0 mt-2 bg-gray-800 text-white text-xs rounded-lg p-3 border border-gray-700 shadow-lg z-10" style={{width: '230px'}}>
                  <button
                    onClick={() => setShowRankerTooltip(false)}
                    className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="font-bold text-cyan-400 mb-1 pr-4">페스티 랭커는 무엇인가요?</p>
                  <p className="text-gray-300">축제 현장에 가서 캐치(축제 위치인증)을<br/>가장 많이한 유저입니다.</p>
                </div>
              )}
            </div>
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
                              {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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
                              {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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

        {koreaPopularFestivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-2xl font-bold mb-4">
              대한민국에서 인기 있는 축제
            </h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {koreaPopularFestivals.map((festival) => {
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
                              {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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

        {japanPopularFestivals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white text-2xl font-bold mb-4">
              일본에서 인기 있는 축제
            </h2>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-4">
                {japanPopularFestivals.map((festival) => {
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
                              {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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

      {cherryBlossomFestivals.length > 0 && (
        <div className="px-4 mb-8">
          <h2 className="text-white text-2xl font-bold mb-4">
            벚꽃의 계절이 다가오고있어요 🌸
          </h2>
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-4 pb-4">
              {cherryBlossomFestivals.map((festival) => {
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
                            {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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

      {foodFestivals.length > 0 && (
        <div className="px-4 mb-8">
          <h2 className="text-white text-2xl font-bold mb-4">
            이런 음식축제는 어때요? 🍜
          </h2>
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-4 pb-4">
              {foodFestivals.map((festival) => {
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
                            {getLocalizedContent(festival, 'city')}, {getLocalizedContent(festival, 'country')}
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

      <HomeChatbot festivals={festivals} />
    </div>
  );
}