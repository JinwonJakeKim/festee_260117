import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Calendar as CalendarIcon, Globe, Tag, X, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";
import { useFestivalLocalizedContent } from "../components/FestivalLocalizedContent";
import FestivalListItem from "../components/FestivalListItem";
import DateRangeBottomSheet from "../components/DateRangeBottomSheet";

const removeDuplicateFestivals = (festivals) => {
  const nameMap = new Map();
  festivals.forEach(festival => {
    const name = festival.name_original || festival.name_ko || festival.name;
    if (!nameMap.has(name)) {
      nameMap.set(name, festival);
    } else {
      const existing = nameMap.get(name);
      const existingScore = (existing.youtube_shorts_urls?.length || 0) + (existing.image_gallery_urls?.length || 0) + (existing.description?.length || 0);
      const currentScore = (festival.youtube_shorts_urls?.length || 0) + (festival.image_gallery_urls?.length || 0) + (festival.description?.length || 0);
      if (currentScore > existingScore || (currentScore === existingScore && new Date(festival.updated_date) > new Date(existing.updated_date))) {
        nameMap.set(name, festival);
      }
    }
  });
  return Array.from(nameMap.values());
};

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

const safeFormatDate = (dateString, formatStr) => {
  if (!dateString) return '';
  try { return format(new Date(dateString), formatStr, { locale: ko }); } catch (e) { return ''; }
};

const getCountryNameInKorean = (country) => {
  const countryMap = {
    'Japan': '일본', 'Korea': '대한민국', 'South Korea': '대한민국', '대한민국': '대한민국',
    'China': '중국', 'USA': '미국', 'United States': '미국', 'UK': '영국',
    'United Kingdom': '영국', 'France': '프랑스', 'Germany': '독일', 'Italy': '이탈리아',
    'Spain': '스페인', 'Thailand': '태국', 'Vietnam': '베트남', 'Philippines': '필리핀',
    'Indonesia': '인도네시아', 'Malaysia': '말레이시아', 'Singapore': '싱가포르',
    'Australia': '호주', 'Canada': '캐나다', 'Mexico': '멕시코', 'Brazil': '브라질',
    'Argentina': '아르헨티나', 'Netherlands': '네덜란드', 'Belgium': '벨기에',
    'Switzerland': '스위스', 'Austria': '오스트리아', 'Sweden': '스웨덴',
    'Norway': '노르웨이', 'Denmark': '덴마크', 'Poland': '폴란드', 'Czech Republic': '체코',
    'Hungary': '헝가리', 'Russia': '러시아', 'Turkey': '터키', 'India': '인도',
    'Taiwan': '대만', 'Hong Kong': '홍콩', 'New Zealand': '뉴질랜드',
  };
  return countryMap[country] || country;
};

export default function FestivalMore() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getLocalizedContent } = useFestivalLocalizedContent();
  const urlParams = new URLSearchParams(window.location.search);

  const [categoryFilter, setCategoryFilter] = useState(urlParams.get('category') || "all");
  const [countryFilter, setCountryFilter] = useState(urlParams.get('country') || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState(() => {
    const fromParam = urlParams.get('dateFrom');
    const toParam = urlParams.get('dateTo');
    return { from: fromParam ? new Date(fromParam) : null, to: toParam ? new Date(toParam) : null };
  });
  const [tempDateRange, setTempDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState(() => {
    const tagsParam = urlParams.get('tags');
    return tagsParam ? tagsParam.split(',') : [];
  });
  const [hidePastFestivals, setHidePastFestivals] = useState(urlParams.get('hidePast') !== 'false');
  const [sortOrder, setSortOrder] = useState("popularity"); // popularity | likes | date
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { setTempDateRange(dateRange); }, [dateRange]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set('category', categoryFilter);
    if (countryFilter !== "all") params.set('country', countryFilter);
    if (dateRange.from) params.set('dateFrom', dateRange.from.toISOString().split('T')[0]);
    if (dateRange.to) params.set('dateTo', dateRange.to.toISOString().split('T')[0]);
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    if (hidePastFestivals) params.set('hidePast', 'true');
    const newUrl = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', createPageUrl('FestivalMore') + newUrl);
  }, [categoryFilter, countryFilter, dateRange, selectedTags, hidePastFestivals]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ['festivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list('-popularity', 500);
      return removeDuplicateFestivals(allFestivals);
    },
    initialData: [],
  });

  const { data: myLikes = [] } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const likeMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (!user) { setShowLoginModal(true); return; }
      const existing = myLikes.find(like => like.festival_id === festivalId);
      if (existing) {
        await base44.entities.FestivalLike.delete(existing.id);
        await base44.entities.Festival.update(festivalId, { likes_count: Math.max(0, (festivals.find(f => f.id === festivalId)?.likes_count || 0) - 1) });
      } else {
        await base44.entities.FestivalLike.create({ festival_id: festivalId, user_email: user.email });
        await base44.entities.Festival.update(festivalId, { likes_count: (festivals.find(f => f.id === festivalId)?.likes_count || 0) + 1 });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
    },
  });

  const handleLoginRedirect = () => { base44.auth.redirectToLogin(window.location.pathname); };
  const handleDateFilterApply = () => { setDateRange(tempDateRange); setIsDatePickerOpen(false); };
  const handleDateFilterReset = () => { setTempDateRange({ from: null, to: null }); setDateRange({ from: null, to: null }); setIsDatePickerOpen(false); };
  const toggleTag = (tag) => { setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); };

  const filteredFestivals = festivals.filter(festival => {
    const categoryMatch = categoryFilter === "all" || festival.category === categoryFilter;
    const countryMatch = countryFilter === "all" || festival.country === countryFilter;
    const monthFilter = extractMonthFromQuery(searchQuery);
    const searchMatch = !searchQuery || (monthFilter !== null
      ? festivalIncludesMonth(festival, monthFilter)
      : (getLocalizedContent(festival, 'name').toLowerCase().includes(searchQuery.toLowerCase()) || (festival.city || '').toLowerCase().includes(searchQuery.toLowerCase())));
    let dateMatch = true;
    if (dateRange?.from && dateRange?.to) {
      const festivalStart = festival.start_date ? new Date(festival.start_date) : null;
      const festivalEnd = festival.end_date ? new Date(festival.end_date) : null;
      if (festivalStart && festivalEnd) {
        const normalizedTo = new Date(dateRange.to);
        normalizedTo.setHours(23, 59, 59, 999);
        dateMatch = (festivalStart <= normalizedTo && festivalEnd >= dateRange.from);
      }
    }
    const tagsMatch = selectedTags.length === 0 || (festival.tags_ko && selectedTags.every(tag => festival.tags_ko.includes(tag)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastFestivalMatch = !hidePastFestivals || (festival.end_date && new Date(festival.end_date) >= today);
    return categoryMatch && countryMatch && searchMatch && dateMatch && tagsMatch && pastFestivalMatch;
  }).sort((a, b) => {
    if (sortOrder === "popularity") return (b.popularity || 0) - (a.popularity || 0);
    if (sortOrder === "likes") return (b.likes_count || 0) - (a.likes_count || 0);
    if (sortOrder === "date") return new Date(a.start_date || 0) - new Date(b.start_date || 0);
    return 0;
  });

  const countries = [...new Set(festivals.map(f => f.country))];
  const categories = ["음악", "문화", "예술", "음식", "스포츠", "지역축제", "기타"];

  const resetFilters = () => {
    setCategoryFilter("all");
    setCountryFilter("all");
    setDateRange({ from: null, to: null });
    setSearchQuery("");
    setSelectedTags([]);
    setHidePastFestivals(true);
  };

  return (
    <div className="min-h-screen bg-black pb-20">
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message="축제에 좋아요를 누르려면 로그인이 필요합니다"
      />

      <div className="sticky top-0 z-50 bg-black border-b border-gray-800">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <Link to={createPageUrl("Search")} className="flex-1">
            <div className="flex items-center bg-gray-900 rounded-xl border border-gray-800 h-12">
              <input
                type="text"
                placeholder="축제 검색..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500 px-4 h-full rounded-xl"
                readOnly
              />
            </div>
          </Link>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-2xl font-bold">축제 차트</h2>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${countryFilter !== "all" ? "bg-cyan-500/20 border-cyan-400 text-cyan-400" : "bg-gray-900 border-gray-800 text-white"}`}>
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-cyan-400" />
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
              <div className="flex items-center gap-1.5">
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
            className="px-4 h-9 bg-gray-900 text-white rounded-full whitespace-nowrap flex items-center gap-2 text-sm hover:bg-gray-800 transition-colors"
          >
            <CalendarIcon className="w-4 h-4 text-pink-500" />
            {dateRange.from && dateRange.to ? (
              <span className="text-cyan-400">
                {safeFormatDate(dateRange.from, 'M/d')} - {safeFormatDate(dateRange.to, 'M/d')}
              </span>
            ) : (
              <span>날짜</span>
            )}
          </button>

          <DateRangeBottomSheet
            isOpen={isDatePickerOpen}
            onClose={() => setIsDatePickerOpen(false)}
            dateRange={dateRange}
            onApply={(range) => setDateRange(range)}
          />

          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className={`w-auto min-w-[80px] rounded-full h-9 border ${sortOrder !== "popularity" ? "bg-yellow-500/20 border-yellow-400 text-yellow-400" : "bg-gray-900 border-gray-800 text-white"}`}>
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-4 h-4 text-yellow-400" />
                <span>{sortOrder === "popularity" ? "인기도순" : sortOrder === "likes" ? "좋아요순" : "날짜순"}</span>
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
              <Badge variant="outline" className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer" onClick={() => setCategoryFilter("all")}>
                {categoryFilter} ✕
              </Badge>
            )}
            {countryFilter !== "all" && (
              <Badge variant="outline" className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer" onClick={() => setCountryFilter("all")}>
                {getCountryNameInKorean(countryFilter)} ✕
              </Badge>
            )}
            {dateRange.from && dateRange.to && (
              <Badge variant="outline" className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer" onClick={() => setDateRange({ from: null, to: null })}>
                {safeFormatDate(dateRange.from, 'M/d')} - {safeFormatDate(dateRange.to, 'M/d')} ✕
              </Badge>
            )}
            {!hidePastFestivals && (
              <Badge variant="outline" className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer" onClick={() => setHidePastFestivals(true)}>
                지난 축제 포함 ✕
              </Badge>
            )}
            {selectedTags.map(tag => (
              <Badge key={tag} variant="outline" className="bg-pink-900/30 text-pink-400 border-pink-400/50 cursor-pointer" onClick={() => toggleTag(tag)}>
                {tag} ✕
              </Badge>
            ))}
            <Button onClick={resetFilters} variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-white h-6">
              모두 지우기
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {filteredFestivals.map((festival, index) => (
            <FestivalListItem
              key={festival.id}
              festival={festival}
              index={index}
              isLiked={myLikes.some(like => like.festival_id === festival.id)}
              onLike={(id) => likeMutation.mutate(id)}
              getLocalizedContent={getLocalizedContent}
            />
          ))}
        </div>

        {filteredFestivals.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-2">선택한 조건에 맞는 축제가 없습니다</p>
            <Button onClick={resetFilters} variant="outline" className="bg-gray-900 text-white border-gray-800 hover:bg-gray-800">
              필터 초기화
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}