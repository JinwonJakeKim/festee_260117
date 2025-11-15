
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart, ArrowLeft, Calendar as CalendarIcon, Globe, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";
import { useFestivalLocalizedContent } from "../components/FestivalLocalizedContent";

const removeDuplicateFestivals = (festivals) => {
  const seen = new Set();
  return festivals.filter(festival => {
    const duplicate = seen.has(festival.id);
    seen.add(festival.id);
    return !duplicate;
  });
};

const safeFormatDate = (dateString, formatStr) => {
  if (!dateString) return '';
  try {
    return format(new Date(dateString), formatStr, { locale: ko });
  } catch (error) {
    return '';
  }
};

const formatNumber = (num) => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const getRankColor = (index) => {
  if (index === 0) return "bg-gradient-to-r from-yellow-400 to-orange-500";
  if (index === 1) return "bg-gradient-to-r from-gray-300 to-gray-400";
  if (index === 2) return "bg-gradient-to-r from-amber-600 to-amber-700";
  return "bg-gray-700";
};

export default function FestivalMore() {
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [tempDateRange, setTempDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [hidePastFestivals, setHidePastFestivals] = useState(false);
  const queryClient = useQueryClient();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { getLocalizedContent } = useFestivalLocalizedContent();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festivals, isLoading } = useQuery({
    queryKey: ['festivals'],
    queryFn: async () => {
      const allFestivals = await base44.entities.Festival.list('-likes_count', 200);
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

  const likeMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (!user) {
        setShowLoginModal(true);
        return;
      }

      const existing = myLikes.find(like => like.festival_id === festivalId);
      if (existing) {
        await base44.entities.FestivalLike.delete(existing.id);
        await base44.entities.Festival.update(festivalId, {
          likes_count: Math.max(0, (festivals.find(f => f.id === festivalId)?.likes_count || 0) - 1)
        });
      } else {
        await base44.entities.FestivalLike.create({
          festival_id: festivalId,
          user_email: user.email
        });
        await base44.entities.Festival.update(festivalId, {
          likes_count: (festivals.find(f => f.id === festivalId)?.likes_count || 0) + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
    },
  });

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname);
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

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastFestivalMatch = !hidePastFestivals ||
      (festival.end_date && new Date(festival.end_date) >= today);

    return categoryMatch && countryMatch && searchMatch && dateMatch && tagsMatch && pastFestivalMatch;
  });

  const countries = [...new Set(festivals.map(f => f.country))];
  const categories = ["음악", "문화", "예술", "음식", "스포츠", "지역축제", "기타"];
  const quickFilters = ["연인과", "Kpop", "반려동물", "가족과", "여름", "무료", "불꽃놀이"];

  return (
    <div className="min-h-screen bg-black pb-20">
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message="축제에 좋아요를 누르려면 로그인이 필요합니다"
      />

      {/* Header */}
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

      <div className="px-4 py-4">
        <h2 className="text-white text-2xl font-bold mb-4">Top Festival</h2>

        {/* Filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-auto min-w-[100px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-cyan-400" />
                <SelectValue>
                  {countryFilter === "all" ? "국가" : countryFilter}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800 text-white">
              <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">전체 국가</SelectItem>
              {countries.map(country => (
                <SelectItem key={country} value={country} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-auto min-w-[120px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-400" />
                <SelectValue>
                  {categoryFilter === "all" ? "카테고리" : categoryFilter}
                </SelectValue>
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

          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <button className="px-4 h-9 bg-gray-900 text-white rounded-full whitespace-nowrap flex items-center gap-2 text-sm hover:bg-gray-800 transition-colors">
                <CalendarIcon className="w-4 h-4 text-pink-500" />
                {dateRange.from && dateRange.to ? (
                  <span className="text-cyan-400">
                    {format(dateRange.from, 'M/d', { locale: ko })} - {format(dateRange.to, 'M/d', { locale: ko })}
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

        {/* Quick Filters */}
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

        {/* 지난 축제 숨김 토글 - 오른쪽 정렬, 배경/테두리 제거 */}
        <div className="flex items-center justify-end gap-3 mb-4 py-2">
          <span className="text-white text-sm font-medium">지난 축제 숨기기</span>
          <Switch
            checked={hidePastFestivals}
            onCheckedChange={setHidePastFestivals}
            className="data-[state=checked]:bg-cyan-500"
          />
        </div>

        {/* Active Filters */}
        {(categoryFilter !== "all" || countryFilter !== "all" || searchQuery || selectedTags.length > 0 || (dateRange.from && dateRange.to) || hidePastFestivals) && (
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
                {countryFilter} ✕
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
            {hidePastFestivals && (
              <Badge
                variant="outline"
                className="bg-cyan-900/30 text-cyan-400 border-cyan-400/50 cursor-pointer"
                onClick={() => setHidePastFestivals(false)}
              >
                지난 축제 숨김 ✕
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
                setHidePastFestivals(false);
              }}
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-white h-6"
            >
              모두 지우기
            </Button>
          </div>
        )}

        {/* Festival List - 홈화면 스타일 */}
        <div className="space-y-3">
          {filteredFestivals.map((festival, index) => {
            const isLiked = myLikes.some(like => like.festival_id === festival.id);
            const dateStatus = festival.date_status || 'confirmed';
            const localizedName = getLocalizedContent(festival, 'name');

            return (
              <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-900/50 hover:bg-gray-900 transition-all">
                  {/* Rank Badge */}
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-lg ${getRankColor(index)} flex items-center justify-center font-bold text-sm ${index < 3 ? 'text-black' : 'text-white'}`}>
                      {index + 1}
                    </div>
                  </div>

                  {/* Thumbnail */}
                  <div className="flex-shrink-0">
                    <img
                      src={festival.thumbnail_url || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
                      alt={localizedName}
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-sm truncate mb-1">
                      {localizedName}
                    </h3>
                    <div className="text-gray-400 text-xs">
                      {festival.country} {festival.city}
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

                  {/* Like Button */}
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

        {/* Empty State */}
        {filteredFestivals.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎪</div>
            <p className="text-gray-400 text-lg mb-2">검색 결과가 없습니다</p>
            <p className="text-gray-500 text-sm">다른 필터를 시도해보세요</p>
            <Button
              onClick={() => {
                setCategoryFilter("all");
                setCountryFilter("all");
                setDateRange({ from: null, to: null });
                setSearchQuery("");
                setSelectedTags([]);
                setHidePastFestivals(false);
              }}
              variant="outline"
              className="mt-4 bg-gray-900 text-white border-gray-800 hover:bg-gray-800"
            >
              필터 초기화
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
