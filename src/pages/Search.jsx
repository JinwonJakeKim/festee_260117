import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Search as SearchIcon, X, TrendingUp, TrendingDown, Calendar as CalendarIcon, Filter, Star, Heart, MapPin, ChevronRight } from "lucide-react";
import LocationBottomModal from "@/components/LocationBottomModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 중복 축제 제거 함수
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

const calculateInfoScore = (festival) => {
  let score = 0;
  if (festival.description) score += 1;
  if (festival.thumbnail_url) score += 1;
  if (festival.video_url) score += 1;
  if (festival.website) score += 1;
  if (festival.highlights?.length > 0) score += 2;
  if (festival.lineup?.length > 0) score += 2;
  if (festival.tags?.length > 0) score += festival.tags.length * 0.5;
  if (festival.price > 0) score += 1;
  if (festival.latitude && festival.longitude) score += 1;
  return score;
};

// 1~5 사이의 일관된 별점 생성
const getStarRating = (festival) => {
  if (festival.star_rating) {
    return Math.min(5, Math.max(1, festival.star_rating));
  }

  let hash = 0;
  const id = festival.id || festival.name || '0';
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash % 5) + 1;
};

// 안전한 문자열 비교 함수 추가
const safeStringIncludes = (str, search) => {
  if (typeof str !== 'string' || typeof search !== 'string') return false;
  try {
    return str.toLowerCase().includes(search.toLowerCase());
  } catch (e) {
    // Fallback for edge cases, though string.toLowerCase() should be safe
    console.warn("Error in safeStringIncludes, falling back:", e);
    return false;
  }
};

// 안전한 날짜 포맷팅 함수
const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return '날짜 미정';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '날짜 미정';
    return format(date, formatString, { locale: ko });
  } catch (e) {
    console.error("Error in safeFormatDate:", e);
    return '날짜 미정';
  }
};

export default function Search() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // URL에서 쿼리 파라미터 읽기 (URL이 변경될 때마다 재계산)
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // URL에서 파라미터를 직접 가져와 상태로 사용 (const로 선언)
  const searchQuery = urlParams.get('q') || '';
  const selectedCountry = urlParams.get('country') || '';
  const selectedCity = urlParams.get('city') || '';
  const selectedCategories = urlParams.get('categories') ? urlParams.get('categories').split(',') : [];
  const selectedTags = urlParams.get('tags') ? urlParams.get('tags').split(',') : [];

  // 검색 입력 필드의 값을 제어하기 위한 로컬 상태
  const [localSearchInput, setLocalSearchInput] = useState(searchQuery);

  // URL의 searchQuery가 변경될 때마다 로컬 검색 입력 필드 동기화
  useEffect(() => {
    setLocalSearchInput(searchQuery);
  }, [searchQuery]);

  const [activeTab, setActiveTab] = useState("축제");
  const [showFilters, setShowFilters] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");

  // 이 필터들은 현재 URL에 저장되지 않고 컴포넌트 내부 상태로 관리됨
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [tempDateRange, setTempDateRange] = useState({ from: null, to: null }); // Temporary state for date picker
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false); // State to control date picker popover
  const [likesRange, setLikesRange] = useState([0, 1000000]);
  const [starRange, setStarRange] = useState([1, 5]);
  const [priceRange, setPriceRange] = useState([0, 500000]);
  const [hidePastFestivals, setHidePastFestivals] = useState(false);

  // 페이지 진입 시 스크롤 초기화 제거 - 검색 결과 위치 유지

  // 중앙 집중식 URL 쿼리 파라미터 업데이트 함수
  const updateUrlParams = ({
    q = searchQuery, // 현재 URL에서 파생된 값을 기본값으로 사용
    country = selectedCountry,
    city = selectedCity,
    categories = selectedCategories,
    tags = selectedTags,
    // dateRange, likesRange, starRange, priceRange는 현재 URL에 저장되지 않으므로 포함하지 않음.
    // 만약 URL에 저장해야 한다면 여기에 추가하고, 해당 필터의 setState 대신 이 함수를 호출하도록 변경.
  }) => {
    const newParams = new URLSearchParams();

    if (q) newParams.set('q', q);
    if (country) newParams.set('country', country);
    if (city) newParams.set('city', city);
    if (categories && categories.length > 0) {
      newParams.set('categories', categories.join(','));
    }
    if (tags && tags.length > 0) {
      newParams.set('tags', tags.join(','));
    }

    const newUrl = `${location.pathname}?${newParams.toString()}`;
    // URL이 실제로 변경되었을 때만 navigate 호출하여 불필요한 렌더링 방지
    if (newUrl !== `${location.pathname}${location.search}`) {
      navigate(newUrl, { replace: true });
    }
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festivals, isLoading } = useQuery({
    queryKey: ['festivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list('-likes_count');
      return removeDuplicateFestivals(allFestivals);
    },
    initialData: [],
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const { data: searchHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['searchHistory'],
    queryFn: () => {
      const history = localStorage.getItem('searchHistory');
      return history ? JSON.parse(history) : [];
    },
    initialData: [],
  });

  // 현재 날짜
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // 개최 중이거나 예정인 축제만 필터링
  const upcomingFestivals = useMemo(() => {
    return festivals.filter(festival => {
      if (!festival.end_date) return false;
      try {
        const endDate = new Date(festival.end_date);
        return endDate >= currentDate;
      } catch (e) {
        console.error("Error parsing festival end_date:", festival.end_date, e);
        return false;
      }
    });
  }, [festivals, currentDate]);

  // 검색어만 적용된 결과 (위치 필터 제외) - 위치 모달의 도시별 카운터에 사용
  const searchOnlyFestivals = useMemo(() => {
    if (!searchQuery) return [];
    return festivals.filter(festival => {
      try {
        return safeStringIncludes(festival.name, searchQuery) ||
          safeStringIncludes(festival.name_ko, searchQuery) ||
          safeStringIncludes(festival.name_en, searchQuery) ||
          safeStringIncludes(festival.name_jp, searchQuery) ||
          safeStringIncludes(festival.name_zh, searchQuery) ||
          safeStringIncludes(festival.city, searchQuery) ||
          safeStringIncludes(festival.city_ko, searchQuery) ||
          safeStringIncludes(festival.country, searchQuery) ||
          (festival.tags && festival.tags.some(tag => safeStringIncludes(tag, searchQuery)));
      } catch (e) {
        return false;
      }
    });
  }, [festivals, searchQuery]);

  // 안전한 필터링 로직
  const filteredFestivals = useMemo(() => {
    // searchQuery는 이제 URL에서 파생된 값
    if (!searchQuery) return [];

    return festivals.filter(festival => {
      try {
        // 검색어 매칭 - 안전한 문자열 비교 (다국어 필드 포함)
        const matchesQuery =
          safeStringIncludes(festival.name, searchQuery) ||
          safeStringIncludes(festival.name_ko, searchQuery) ||
          safeStringIncludes(festival.name_en, searchQuery) ||
          safeStringIncludes(festival.name_jp, searchQuery) ||
          safeStringIncludes(festival.name_zh, searchQuery) ||
          safeStringIncludes(festival.city, searchQuery) ||
          safeStringIncludes(festival.city_ko, searchQuery) ||
          safeStringIncludes(festival.country, searchQuery) ||
          (festival.tags && festival.tags.some(tag => safeStringIncludes(tag, searchQuery)));

        if (!matchesQuery) return false;

        // 국가 필터 (다중 선택 OR 조건)
        const selectedCountries = selectedCountry ? selectedCountry.split(',') : [];
        const matchesCountry = selectedCountries.length === 0 || selectedCountries.includes(festival.country);
        if (!matchesCountry) return false;

        // 도시 필터 (다중 선택 OR 조건)
        const selectedCities = selectedCity ? selectedCity.split(',') : [];
        const matchesCity = selectedCities.length === 0 || selectedCities.includes(festival.city);
        if (!matchesCity) return false;

        // 카테고리 필터
        const matchesCategory = selectedCategories.length === 0 ||
          (festival.category && selectedCategories.includes(festival.category));
        if (!matchesCategory) return false;

        // 좋아요 필터
        const festivalLikes = festival.likes_count || 0;
        const matchesLikes = festivalLikes >= likesRange[0] && festivalLikes <= likesRange[1];
        if (!matchesLikes) return false;

        // 날짜 필터 - 안전하게 처리
        if (dateRange && dateRange.from && dateRange.to) {
          if (!festival.start_date || !festival.end_date) return false;

          try {
            const festivalStartDate = new Date(festival.start_date);
            const festivalEndDate = new Date(festival.end_date);

            if (isNaN(festivalStartDate.getTime()) || isNaN(festivalEndDate.getTime())) {
              return false;
            }

            const matchesDate =
              (festivalStartDate <= dateRange.to && festivalEndDate >= dateRange.from) ||
              (festivalStartDate >= dateRange.from && festivalStartDate <= dateRange.to) ||
              (festivalEndDate >= dateRange.from && festivalEndDate <= dateRange.to);

            if (!matchesDate) return false;
          } catch (e) {
            console.error('Error parsing festival date for filtering:', festival.start_date, festival.end_date, e);
            return false;
          }
        }

        // 태그 필터
        const matchesTags = selectedTags.length === 0 ||
          (festival.tags && Array.isArray(festival.tags) &&
           selectedTags.every(tag => festival.tags.includes(tag)));
        if (!matchesTags) return false;

        // 가격 필터
        const festivalPrice = festival.price || 0;
        const matchesPrice = priceRange[1] === 500000 ? festivalPrice >= priceRange[0] :
          (festivalPrice >= priceRange[0] && festivalPrice <= priceRange[1]);
        if (!matchesPrice) return false;

        // 별점 필터
        const festivalStarRating = getStarRating(festival);
        const matchesStarRating = festivalStarRating >= starRange[0] && festivalStarRating <= starRange[1];
        if (!matchesStarRating) return false;

        // 지난 축제 숨기기 필터
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pastFestivalMatch = !hidePastFestivals ||
          (festival.end_date && new Date(festival.end_date) >= today);
        if (!pastFestivalMatch) return false;

        return true;
      } catch (e) {
        console.error('Error during festival filtering:', e, festival);
        return false;
      }
    });
  }, [festivals, searchQuery, selectedCountry, selectedCity, selectedCategories, likesRange, dateRange, selectedTags, priceRange, starRange, hidePastFestivals]);

  // 사용자 언어에 맞는 현지화 이름 가져오기
  const getLocalizedCountry = (festival) => {
    const lang = user?.language || 'ko';
    if (lang === 'en') return festival.country_en || festival.country || '';
    if (lang === 'jp') return festival.country_jp || festival.country || '';
    if (lang === 'zh') return festival.country_zh || festival.country || '';
    return festival.country_ko || festival.country || '';
  };

  const getLocalizedCity = (festival) => {
    const lang = user?.language || 'ko';
    if (lang === 'en') return festival.city_en || festival.city || '';
    if (lang === 'jp') return festival.city_jp || festival.city || '';
    if (lang === 'zh') return festival.city_zh || festival.city || '';
    return festival.city_ko || festival.city || '';
  };

  // 국가별, 도시별 축제 수 계산 - 검색어가 있으면 filteredFestivals 기반, 없으면 전체 festivals 기반
  const locationStats = useMemo(() => {
    const stats = {};
    const lang = user?.language || 'ko';

    // 항상 전체 festivals 기반으로 locationStats 계산 (위치 필터 선택 시에도 모든 국가/도시 표시)
    const sourceFestivals = festivals;

    sourceFestivals.forEach(festival => {
      const countryKey = festival.country || '기타'; // 필터링용 원본 키
      const countryDisplay = (() => {
        if (lang === 'en') return festival.country_en || festival.country || '기타';
        if (lang === 'jp') return festival.country_jp || festival.country || '기타';
        if (lang === 'zh') return festival.country_zh || festival.country || '기타';
        return festival.country_ko || festival.country || '기타';
      })();
      const cityKey = festival.city || '미정'; // 필터링용 원본 키
      const cityDisplay = (() => {
        if (lang === 'en') return festival.city_en || festival.city || '미정';
        if (lang === 'jp') return festival.city_jp || festival.city_en || festival.city || '미정';
        if (lang === 'zh') return festival.city_zh || festival.city_en || festival.city || '미정';
        // ko: city_ko 우선, 없으면 city_en, 그것도 없으면 원본 city
        return festival.city_ko || festival.city_en || festival.city || '미정';
      })();

      if (!stats[countryKey]) {
        stats[countryKey] = {
          count: 0,
          display: countryDisplay,
          cities: {}
        };
      }
      stats[countryKey].count++;

      if (!stats[countryKey].cities[cityKey]) {
        stats[countryKey].cities[cityKey] = { count: 0, display: cityDisplay };
      }
      // 한국어 display가 이미 있는 경우 유지, 아직 영어/원본이라면 더 나은 현지화 이름으로 교체
      const existing = stats[countryKey].cities[cityKey];
      const hasBetterDisplay = (() => {
        if (lang === 'ko') return festival.city_ko && existing.display !== festival.city_ko;
        if (lang === 'en') return festival.city_en && existing.display !== festival.city_en;
        if (lang === 'jp') return festival.city_jp && existing.display !== festival.city_jp;
        if (lang === 'zh') return festival.city_zh && existing.display !== festival.city_zh;
        return false;
      })();
      if (hasBetterDisplay) {
        existing.display = cityDisplay;
      }
      stats[countryKey].cities[cityKey].count++;
    });

    const sortedCountries = Object.keys(stats).sort((a, b) => stats[b].count - stats[a].count);
    const sortedStats = {};
    sortedCountries.forEach(countryKey => {
      sortedStats[countryKey] = {
        count: stats[countryKey].count,
        display: stats[countryKey].display,
        cities: Object.fromEntries(
          Object.entries(stats[countryKey].cities).sort(([,a], [,b]) => b.count - a.count)
        )
      };
    });

    return sortedStats;
  }, [festivals, filteredFestivals, searchQuery, user?.language]);

  // 위치 검색 필터링
  const filteredLocations = useMemo(() => {
    const query = locationSearchQuery.toLowerCase().trim();
    const results = [];

    if (!query) {
      Object.entries(locationStats).forEach(([countryKey, data]) => {
        results.push({
          type: 'country',
          key: countryKey,         // 필터링용 원본 값
          name: data.display,      // 표시용 현지화 이름
          count: data.count
        });
        Object.entries(data.cities).forEach(([cityKey, cityData]) => {
          results.push({
            type: 'city',
            key: cityKey,
            name: cityData.display,
            countryKey: countryKey,
            country: data.display,
            count: cityData.count
          });
        });
      });
    } else {
      Object.entries(locationStats).forEach(([countryKey, data]) => {
        const countryMatch = safeStringIncludes(data.display, query) || safeStringIncludes(countryKey, query);

        if (countryMatch) {
          results.push({
            type: 'country',
            key: countryKey,
            name: data.display,
            count: data.count
          });

          Object.entries(data.cities).forEach(([cityKey, cityData]) => {
            results.push({
              type: 'city',
              key: cityKey,
              name: cityData.display,
              countryKey: countryKey,
              country: data.display,
              count: cityData.count
            });
          });
        } else {
          Object.entries(data.cities).forEach(([cityKey, cityData]) => {
            if (safeStringIncludes(cityData.display, query) || safeStringIncludes(cityKey, query)) {
              results.push({
                type: 'city',
                key: cityKey,
                name: cityData.display,
                countryKey: countryKey,
                country: data.display,
                count: cityData.count
              });
            }
          });
        }
      });
    }

    return results;
  }, [locationStats, locationSearchQuery]);

  const trendingKeywords = [
    { keyword: "토모로우랜드", change: "up", count: 1234 },
    { keyword: "Seoul", change: "up", count: 987 },
    { keyword: "서울 재즈 페스티벌", change: "down", count: 756 },
    { keyword: "가족과 가기 좋은", change: "up", count: 654 },
    { keyword: "Coachella Valley Music", change: "same", count: 543 },
  ];

  const categories = ["음악", "문화", "예술", "음식", "스포츠", "지역축제"];
  const tags = ["연인과", "Kpop", "반려동물", "가족과", "여름", "무료", "FESTEE추천", "불꽃놀이"];

  const handleSearch = (query) => {
    if (query.trim()) {
      const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
      const newHistory = [query, ...history.filter(h => h !== query)].slice(0, 10);
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
      refetchHistory();
      // searchQuery를 직접 업데이트하는 대신, URL을 업데이트
      updateUrlParams({ q: query });
    }
  };

  const removeFromHistory = (keyword) => {
    const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    const newHistory = history.filter(h => h !== keyword);
    localStorage.setItem('searchHistory', JSON.stringify(newHistory));
    refetchHistory();
  };

  const handleLocationSelect = (location) => {
    // URL에는 원본 key(영어)를 저장하고, 필터링에도 원본 key 사용
    const newCountry = location.type === 'country' ? location.key : location.countryKey;
    const newCity = location.type === 'city' ? location.key : "";

    updateUrlParams({
      country: newCountry,
      city: newCity,
    });
    setShowLocationModal(false);
    setLocationSearchQuery("");
  };

  const toggleCategory = (category) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];

    // selectedCategories를 직접 업데이트하는 대신, URL을 업데이트
    updateUrlParams({ categories: newCategories });
  };

  const toggleTag = (tag) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];

    // selectedTags를 직접 업데이트하는 대신, URL을 업데이트
    updateUrlParams({ tags: newTags });
  };

  const getLocationDisplayText = () => {
    if (selectedCity && selectedCountry) {
      // URL에는 원본 key가 저장되어 있으므로, 현지화된 표시명으로 변환
      const countryDisplay = locationStats[selectedCountry]?.display || selectedCountry;
      const cityDisplay = locationStats[selectedCountry]?.cities[selectedCity]?.display || selectedCity;
      return `${cityDisplay}, ${countryDisplay}`;
    } else if (selectedCountry) {
      const countryDisplay = locationStats[selectedCountry]?.display || selectedCountry;
      return countryDisplay;
    }
    return "위치";
  };

  const isFilterActive = () => {
    return selectedCountry || selectedCity || (dateRange.from && dateRange.to) || selectedCategories.length > 0 || selectedTags.length > 0 || likesRange[0] !== 0 || likesRange[1] !== 1000000 || starRange[0] !== 1 || starRange[1] !== 5 || priceRange[0] !== 0 || priceRange[1] !== 500000;
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

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Login Prompt Modal */}

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>

          {/* 검색창 - X 버튼 제거 */}
          <div className="flex-1 relative flex items-center bg-gray-900 rounded-xl border border-gray-800 h-12">
            <input
              type="text"
              value={localSearchInput} // 로컬 상태 사용
              onChange={(e) => setLocalSearchInput(e.target.value)} // 로컬 상태 업데이트
              onKeyPress={(e) => e.key === 'Enter' && handleSearch(localSearchInput)} // Enter 시 로컬 상태로 검색
              placeholder="국가, 도시, 축제명, 아티스트 검색"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500 px-4 h-full rounded-xl"
              autoFocus
            />
          </div>

          {/* 검색 버튼 */}
          <button
            onClick={() => handleSearch(localSearchInput)} // 로컬 상태로 검색
            className="w-12 h-12 rounded-xl bg-cyan-500 hover:bg-cyan-600 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <SearchIcon className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Filter Buttons */}
        {searchQuery && (
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLocationModal(true)}
              className={`rounded-full ${selectedCountry || selectedCity ? 'bg-cyan-400 border-cyan-400 text-white' : 'bg-gray-900 border-gray-800 text-white'}`}
            >
              <MapPin className="w-4 h-4 mr-1" />
              위치 <ChevronRight className="w-4 h-4 ml-1 -rotate-90" />
            </Button>

            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-full ${dateRange.from && dateRange.to ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-gray-900 border-gray-800 text-white'}`}
                >
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  날짜 <ChevronRight className="w-4 h-4 ml-1 -rotate-90" />
                </Button>
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-full ${showFilters || isFilterActive() ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-gray-900 border-gray-800 text-white'}`}
            >
              <Filter className="w-4 h-4 mr-1" />
              필터 <ChevronRight className="w-4 h-4 ml-1 -rotate-90" />
            </Button>
          </div>
        )}
      </div>

      {/* Filter Panel */}
      {searchQuery && showFilters && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 space-y-4">
          <div>
            <h3 className="text-white font-bold mb-2">정렬</h3>
            <div className="flex gap-2">
              <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black">
                좋아요순
              </Badge>
              <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black">
                날짜순
              </Badge>
              <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black">
                FESTEE Star
              </Badge>
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold mb-2">카테고리</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map(category => (
                <Badge
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`cursor-pointer ${
                    selectedCategories.includes(category)
                      ? 'bg-cyan-400 text-black'
                      : 'bg-gray-800 text-white'
                  }`}
                >
                  {category}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold mb-2">TAG</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`cursor-pointer ${
                    selectedTags.includes(tag)
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-800 text-white'
                  }`}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold mb-2">Likes</h3>
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">{likesRange[0]}</span>
              <Slider
                value={likesRange}
                onValueChange={setLikesRange}
                max={1000000}
                step={1000}
                className="flex-1"
              />
              <span className="text-gray-400 text-sm">{likesRange[1].toLocaleString()}</span>
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold mb-2">FESTEE Star</h3>
            <div className="flex items-center gap-4">
              <div className="flex">
                {Array.from({ length: starRange[0] }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <Slider
                value={starRange}
                onValueChange={setStarRange}
                max={5}
                min={1}
                step={1}
                className="flex-1"
              />
              <div className="flex">
                {Array.from({ length: starRange[1] }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold mb-2">금액 (원)</h3>
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">₩{priceRange[0].toLocaleString()}</span>
              <Slider
                value={priceRange}
                onValueChange={setPriceRange}
                max={500000}
                step={10000}
                className="flex-1"
              />
              <span className="text-gray-400 text-sm">₩{priceRange[1].toLocaleString()}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                // 내부 상태 초기화
                setLikesRange([0, 1000000]);
                setStarRange([1, 5]);
                setPriceRange([0, 500000]);
                setDateRange({ from: null, to: null });
                setTempDateRange({ from: null, to: null }); // Also reset temp date range
                setHidePastFestivals(false);
                // URL 파라미터 초기화
                updateUrlParams({ q: '', country: '', city: '', categories: [], tags: [] });
              }}
              variant="outline"
              className="w-full bg-gray-800 text-white"
            >
              초기화
            </Button>
            <Button
              onClick={() => setShowFilters(false)}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              적용
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 py-4">
        {!searchQuery ? ( // searchQuery는 URL에서 파생된 값
          <>
            {/* Search History */}
            {searchHistory.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold">검색 기록</h3>
                  <Badge className="bg-gray-800 text-white">삭제 가능</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map((keyword, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-gray-900 rounded-full px-3 py-2"
                    >
                      <span
                        className="text-white text-sm cursor-pointer"
                        onClick={() => {
                          setLocalSearchInput(keyword); // 로컬 상태 업데이트
                          handleSearch(keyword); // 즉시 검색 실행
                        }}
                      >
                        {keyword}
                      </span>
                      <button onClick={() => removeFromHistory(keyword)}>
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Keywords */}
            <div>
              <h3 className="text-white font-bold mb-3">실시간 인기 검색어</h3>
              <div className="space-y-2">
                {trendingKeywords.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setLocalSearchInput(item.keyword);
                      handleSearch(item.keyword);
                    }}
                    className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-cyan-400 font-bold w-6">{idx + 1}</span>
                    <span className="flex-1 text-white">{item.keyword}</span>
                    {item.change === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
                    {item.change === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
                    <span className="text-gray-500 text-sm">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended Search */}
            <div className="mt-6">
              <h3 className="text-white font-bold mb-3">추천 검색어</h3>
              <div className="flex flex-wrap gap-2">
                <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black"
                  onClick={() => {
                    setLocalSearchInput("가족과 가기 좋은");
                    handleSearch("가족과 가기 좋은");
                  }}
                >
                  가족과 가기 좋은
                </Badge>
                <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black"
                  onClick={() => {
                    setLocalSearchInput("도시락박스도");
                    handleSearch("도시락박스도");
                  }}
                >
                  도시락박스도
                </Badge>
                <Badge className="cursor-pointer bg-gray-800 text-white hover:bg-cyan-400 hover:text-black"
                  onClick={() => {
                    setLocalSearchInput("Sziget");
                    handleSearch("Sziget");
                  }}
                >
                  Sziget
                </Badge>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                onClick={() => setActiveTab("축제")}
                variant={activeTab === "축제" ? "default" : "outline"}
                className={activeTab === "축제"
                  ? "bg-cyan-400 text-black hover:bg-cyan-500"
                  : "bg-gray-900 text-white border-gray-700 hover:bg-gray-800"
                }
              >
                축제
              </Button>
              <Button
                onClick={() => setActiveTab("아티스트")}
                variant={activeTab === "아티스트" ? "default" : "outline"}
                className={activeTab === "아티스트"
                  ? "bg-cyan-400 text-black hover:bg-cyan-500"
                  : "bg-gray-900 text-white border-gray-700 hover:bg-gray-800"
                }
              >
                아티스트
              </Button>
            </div>

            {/* 지난 축제 숨김 토글 - 축제 탭에서만 표시, 리스트뷰 바로 위 */}
            {activeTab === "축제" && (
              <div className="flex items-center justify-end gap-3 mb-4 py-2">
                <span className="text-white text-sm font-medium">지난 축제 숨기기</span>
                <Switch
                  checked={hidePastFestivals}
                  onCheckedChange={setHidePastFestivals}
                  className="data-[state=checked]:bg-cyan-500"
                />
              </div>
            )}

            {/* Results */}
            {activeTab === "축제" && (
              <div className="space-y-3">
                {filteredFestivals.map((festival) => {
                  const starRating = getStarRating(festival);
                  const dateStatus = festival.date_status || 'confirmed';
                  
                  return (
                    <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 transition-colors">
                        <img
                          src={festival.thumbnail_url}
                          alt={festival.name_ko || festival.name_original || festival.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="text-white font-bold text-sm mb-1">{festival.name_ko || festival.name_original || festival.name}</h3>
                          <p className="text-gray-400 text-xs">
                            {getLocalizedCity(festival)}, {getLocalizedCountry(festival)}{festival.category ? ` / ${festival.category}` : ''}
                          </p>
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
                        <div className="flex flex-col items-center gap-1">
                          <Heart className="w-5 h-5 text-pink-500" />
                          <span className="text-xs text-gray-400">{festival.likes_count || 0}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {filteredFestivals.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-500">검색 결과가 없습니다</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "아티스트" && (
              <div className="text-center py-12">
                <p className="text-gray-500">아티스트 검색 기능은 준비중입니다</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Location Bottom Modal */}
      {showLocationModal && (
        <LocationBottomModal
          show={showLocationModal}
          onClose={() => { setShowLocationModal(false); setLocationSearchQuery(""); }}
          locationStats={locationStats}
          selectedCountry={selectedCountry}
          selectedCity={selectedCity}
          onApply={(countries, cities) => {
            // countries = string[], cities = "country__city"[] 형태
            const country = countries.length > 0 ? countries.join(',') : (cities.length > 0 ? cities.map(k => k.split('__')[0]).join(',') : '');
            const city = cities.length > 0 ? cities.map(k => k.split('__')[1]).join(',') : '';
            updateUrlParams({ country, city });
            setShowLocationModal(false);
            setLocationSearchQuery("");
          }}
          onReset={() => {
            updateUrlParams({ country: "", city: "" });
            setShowLocationModal(false);
            setLocationSearchQuery("");
          }}
          filteredFestivals={searchOnlyFestivals}
          festivals={festivals}
          searchQuery={searchQuery}
        />
      )}

      {/* Filter Bottom Modal */}
      {searchQuery && showFilters && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFilters(false)} />
          <div className="relative bg-gray-950 rounded-t-3xl flex flex-col max-h-[85vh]">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">필터</h2>
              <button
                onClick={() => setShowFilters(false)}
                className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              <div>
                <h3 className="text-white font-bold mb-2">카테고리</h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => (
                    <Badge
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`cursor-pointer ${selectedCategories.includes(category) ? 'bg-cyan-400 text-black' : 'bg-gray-800 text-white'}`}
                    >
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold mb-2">TAG</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <Badge
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`cursor-pointer ${selectedTags.includes(tag) ? 'bg-pink-500 text-white' : 'bg-gray-800 text-white'}`}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold mb-2">Likes</h3>
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 text-sm">{likesRange[0]}</span>
                  <Slider value={likesRange} onValueChange={setLikesRange} max={1000000} step={1000} className="flex-1" />
                  <span className="text-gray-400 text-sm">{likesRange[1].toLocaleString()}</span>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold mb-2">FESTEE Star</h3>
                <div className="flex items-center gap-4">
                  <div className="flex">
                    {Array.from({ length: starRange[0] }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <Slider value={starRange} onValueChange={setStarRange} max={5} min={1} step={1} className="flex-1" />
                  <div className="flex">
                    {Array.from({ length: starRange[1] }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold mb-2">금액 (원)</h3>
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 text-sm">₩{priceRange[0].toLocaleString()}</span>
                  <Slider value={priceRange} onValueChange={setPriceRange} max={500000} step={10000} className="flex-1" />
                  <span className="text-gray-400 text-sm">₩{priceRange[1].toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="px-4 py-4 border-t border-gray-800 flex gap-2">
              <Button
                onClick={() => {
                  setLikesRange([0, 1000000]);
                  setStarRange([1, 5]);
                  setPriceRange([0, 500000]);
                  setDateRange({ from: null, to: null });
                  setTempDateRange({ from: null, to: null });
                  setHidePastFestivals(false);
                  updateUrlParams({ q: searchQuery, country: '', city: '', categories: [], tags: [] });
                }}
                variant="outline"
                className="flex-1 bg-gray-800 text-white border-gray-700"
              >
                초기화
              </Button>
              <Button onClick={() => setShowFilters(false)} className="flex-1 bg-cyan-500 hover:bg-cyan-600">
                적용
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}