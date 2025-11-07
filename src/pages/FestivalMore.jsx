import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Heart, Search, ArrowLeft, Star, Calendar as CalendarIcon, Globe, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";

const removeDuplicateFestivals = (festivals) => {
  const seen = new Set();
  return festivals.filter(festival => {
    const duplicate = seen.has(festival.id);
    seen.add(festival.id);
    return !duplicate;
  });
};

const calculateInfoScore = (festival) => {
  let score = 0;
  const fields = ['name', 'description', 'start_date', 'end_date', 'location', 'venue', 'price_info', 'website', 'contact', 'image_url'];
  fields.forEach(field => {
    if (festival[field]) score++;
  });
  return (score / fields.length) * 5;
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
  if (index === 0) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
  if (index === 1) return 'bg-gradient-to-r from-gray-300 to-gray-400';
  if (index === 2) return 'bg-gradient-to-r from-orange-400 to-orange-600';
  return 'bg-gray-700';
};

const getStarRating = (festival) => {
  const infoScore = calculateInfoScore(festival);
  const popularityScore = Math.min((festival.likes_count || 0) / 100, 5);
  return Math.min(Math.round((infoScore * 0.6 + popularityScore * 0.4) * 2) / 2, 5);
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
  const queryClient = useQueryClient();
  const [showLoginModal, setShowLoginModal] = useState(false);

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
      festival.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

    return categoryMatch && countryMatch && searchMatch && dateMatch && tagsMatch;
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

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {quickFilters.map(tag => (
            <Badge
              key={tag}
              variant={selectedTags.includes(tag) ? "default" : "outline"}
              className={`cursor-pointer whitespace-nowrap ${
                selectedTags.includes(tag)
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white border-0'
                  : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-cyan-500'
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>

        {(categoryFilter !== "all" || countryFilter !== "all" || searchQuery || selectedTags.length > 0 || (dateRange.from && dateRange.to)) && (
          <div className="mb-4 p-3 bg-gray-900 rounded-lg flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <span className="text-gray-400 text-sm">활성 필터:</span>
              {countryFilter !== "all" && (
                <Badge variant="outline" className="bg-cyan-900 text-cyan-300 border-cyan-600">
                  {countryFilter}
                </Badge>
              )}
              {categoryFilter !== "all" && (
                <Badge variant="outline" className="bg-purple-900 text-purple-300 border-purple-600">
                  {categoryFilter}
                </Badge>
              )}
              {dateRange.from && dateRange.to && (
                <Badge variant="outline" className="bg-pink-900 text-pink-300 border-pink-600">
                  {format(dateRange.from, 'M/d', { locale: ko })} - {format(dateRange.to, 'M/d', { locale: ko })}
                </Badge>
              )}
              {selectedTags.map(tag => (
                <Badge key={tag} variant="outline" className="bg-orange-900 text-orange-300 border-orange-600">
                  {tag}
                </Badge>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryFilter("all");
                setCountryFilter("all");
                setSearchQuery("");
                setSelectedTags([]);
                setDateRange({ from: null, to: null });
                setTempDateRange({ from: null, to: null });
              }}
              className="text-gray-400 hover:text-white text-xs"
            >
              초기화
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {filteredFestivals.map((festival, index) => {
            const isLiked = myLikes.some(like => like.festival_id === festival.id);
            const rating = getStarRating(festival);

            return (
              <div
                key={festival.id}
                className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden border border-gray-700 hover:border-cyan-500 transition-all duration-300 shadow-lg hover:shadow-cyan-500/20"
              >
                <Link to={createPageUrl("FestivalDetail") + `?id=${festival.id}`}>
                  <div className="relative">
                    <img
                      src={festival.image_url || "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800"}
                      alt={festival.name}
                      className="w-full h-48 object-cover"
                    />
                    {index < 3 && (
                      <div className={`absolute top-3 left-3 ${getRankColor(index)} text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-1`}>
                        <span className="text-lg">#{index + 1}</span>
                      </div>
                    )}
                  </div>
                </Link>

                <div className="p-4">
                  <Link to={createPageUrl("FestivalDetail") + `?id=${festival.id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-white font-bold text-lg mb-1 line-clamp-1">
                          {festival.name}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                          <span className="flex items-center gap-1">
                            <Globe className="w-4 h-4" />
                            {festival.country}, {festival.city}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
                            />
                          ))}
                          <span className="text-gray-400 text-sm ml-1">{rating.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                      <span>{safeFormatDate(festival.start_date, 'yyyy.MM.dd')} - {safeFormatDate(festival.end_date, 'yyyy.MM.dd')}</span>
                    </div>

                    {festival.tags && festival.tags.length > 0 && (
                      <div className="flex gap-2 flex-wrap mb-3">
                        {festival.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="bg-gray-800 text-cyan-400 border-cyan-500/30">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Link>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        likeMutation.mutate(festival.id);
                      }}
                      className="flex items-center gap-2 text-gray-400 hover:text-pink-500 transition-colors"
                    >
                      <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : ''}`} />
                      <span className="text-sm font-medium">{formatNumber(festival.likes_count || 0)}</span>
                    </button>

                    <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0">
                      {festival.category || '기타'}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredFestivals.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎪</div>
            <p className="text-gray-400 text-lg">검색 결과가 없습니다</p>
            <p className="text-gray-500 text-sm mt-2">다른 필터를 시도해보세요</p>
          </div>
        )}
      </div>
    </div>
  );
}