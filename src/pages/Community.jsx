import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Heart, MessageCircle, TrendingUp, Eye, Globe, Tag, Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { ko, enUS, ja, zhCN } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";
import { useLanguage } from "@/lib/useLanguage";
import { communityTranslations } from "@/lib/communityTranslations";

const dateFnsLocales = { ko, en: enUS, ja, zh: zhCN };

// Sample GoTogether Posts
const sampleGoTogetherPosts = [
  {
    id: 'sample-gotogether-1',
    type: '같이가기',
    title: '울트라 뮤직 페스티벌 코리아 같이 가실 분 구해요!',
    content: 'UMF Korea 2024 같이 갈 친구 찾아요! EDM 좋아하고 신나게 놀 준비 되신 분 환영합니다!',
    author_email: 'sample1@example.com',
    author_name: '페스티벌러버1',
    author_profile_image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=FestLover1',
    festival_name: 'Ultra Music Festival Korea 2024',
    festival_location: '서울',
    festival_category: '음악',
    festival_date: '2024-06-08T00:00:00Z',
    temperature: 85,
    view_count: 123,
    comments_count: 15,
    likes_count: 50,
    created_date: '2024-05-20T10:00:00Z',
    image_urls: []
  },
  {
    id: 'sample-gotogether-2',
    type: '같이가기',
    title: '글래스톤베리 캠핑 같이 할 한국인 찾아요!',
    content: '영국 글래스톤베리 페스티벌 2024 캠핑 존에서 같이 숙박하실 분 구합니다. 티켓은 각자 구매했어요!',
    author_email: 'sample2@example.com',
    author_name: '캠핑조아',
    author_profile_image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=CampingJoha',
    festival_name: 'Glastonbury Festival 2024',
    festival_location: '영국',
    festival_category: '음악',
    festival_date: '2024-06-26T00:00:00Z',
    temperature: 72,
    view_count: 88,
    comments_count: 8,
    likes_count: 30,
    created_date: '2024-05-18T14:30:00Z',
    image_urls: []
  },
  {
    id: 'sample-gotogether-3',
    type: '같이가기',
    title: '부산 국제 록 페스티벌 같이 즐겨요!',
    content: '부산 록 페스티벌에 갈 예정인데 혼자 가기 아쉬워서 동행 찾아요! 락 음악 좋아하면 누구나 환영!',
    author_email: 'sample3@example.com',
    author_name: '락앤롤',
    author_profile_image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=RockNRoll',
    festival_name: '부산 국제 록 페스티벌 2024',
    festival_location: '부산',
    festival_category: '음악',
    festival_date: '2024-08-10T00:00:00Z',
    temperature: 60,
    view_count: 55,
    comments_count: 5,
    likes_count: 20,
    created_date: '2024-05-15T09:15:00Z',
    image_urls: []
  },
  {
    id: 'sample-gotogether-4',
    type: '같이가기',
    title: 'DMZ 평화콘서트 같이 갈 파티원 구함!',
    content: 'DMZ 평화콘서트 가려고 하는데 같이 갈 친구 없나요? K-pop 팬이면 더 좋아요!',
    author_email: 'sample4@example.com',
    author_name: '평화메신저',
    author_profile_image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=PeaceMsg',
    festival_name: 'DMZ 평화콘서트 2024',
    festival_location: '파주',
    festival_category: '음악',
    festival_date: '2024-09-21T00:00:00Z',
    temperature: 68,
    view_count: 40,
    comments_count: 3,
    likes_count: 15,
    created_date: '2024-05-12T11:00:00Z',
    image_urls: []
  },
  {
    id: 'sample-gotogether-5',
    type: '같이가기',
    title: '서울 재즈 페스티벌 같이 분위기 즐겨요!',
    content: '서울 재즈 페스티벌 티켓 끊었는데 같이 재즈 들으면서 힐링하실 분 구해요~',
    author_email: 'sample5@example.com',
    author_name: '재즈홀릭',
    author_profile_image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=JazzHolic',
    festival_name: '서울 재즈 페스티벌 2024',
    festival_location: '서울',
    festival_category: '음악',
    festival_date: '2024-05-31T00:00:00Z',
    temperature: 78,
    view_count: 90,
    comments_count: 10,
    likes_count: 40,
    created_date: '2024-05-22T16:00:00Z',
    image_urls: []
  }
];

// 안전한 날짜 포맷팅 함수 (언어별 locale 지원)
const safeFormatDate = (dateString, formatString, locale, fallbackText = '날짜 미정') => {
  if (!dateString) return fallbackText;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallbackText;
    return format(date, formatString, { locale });
  } catch (e) {
    return fallbackText;
  }
};

export default function Community() {
  const [activeTab, setActiveTab] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [tempDateRange, setTempDateRange] = useState({ from: null, to: null });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchPlaceholder, setSearchPlaceholder] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);

  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = communityTranslations[language] || communityTranslations.ko;
  const locale = dateFnsLocales[language] || dateFnsLocales.ko;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const randomPlaceholder = t.searchPlaceholders[Math.floor(Math.random() * t.searchPlaceholders.length)];
    setSearchPlaceholder(randomPlaceholder);
  }, [language]);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: () => base44.entities.Post.list('-created_date'),
    initialData: [],
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const postsWithLatestAuthorInfo = posts.map(post => {
    const author = users.find(u => u.email === post.author_email);
    return {
      ...post,
      author_profile_image: author?.profile_image || post.author_profile_image,
      author_name: author?.full_name || post.author_name,
    };
  });

  const handleDateFilterApply = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };

  const handleDateFilterReset = () => {
    setTempDateRange({ from: null, to: null });
    setDateRange({ from: null, to: null });
    setIsDatePickerOpen(false);
  };

  const typeColors = {
    '같이가기': 'bg-gradient-to-r from-purple-500 to-pink-500',
    '후기': 'bg-gradient-to-r from-blue-500 to-cyan-500',
    '질문': 'bg-gradient-to-r from-orange-500 to-yellow-500',
    '정보공유': 'bg-gradient-to-r from-green-500 to-emerald-500'
  };

  const getTemperatureColor = (temp) => {
    if (temp >= 90) return 'text-red-500';
    if (temp >= 70) return 'text-orange-500';
    if (temp >= 50) return 'text-yellow-500';
    return 'text-cyan-400';
  };

  const applyGlobalFilters = (post) => {
    const searchMatch = !searchQuery ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.festival_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const locationMatch = locationFilter === "all" || post.festival_location?.includes(locationFilter);
    const categoryMatch = categoryFilter === "all" || post.festival_category === categoryFilter;

    let dateMatch = true;
    if (dateRange && dateRange.from && dateRange.to && post.festival_date) {
      const postDate = new Date(post.festival_date);
      // Ensure date comparison is consistent (e.g., end of day for 'to' date)
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0); // Start of 'from' day

      const to = new Date(dateRange.to);
      to.setHours(23, 59, 59, 999); // End of 'to' day

      dateMatch = postDate >= from && postDate <= to;
    }
    return searchMatch && locationMatch && categoryMatch && dateMatch;
  };

  const allTabFilteredPosts = postsWithLatestAuthorInfo.filter(applyGlobalFilters);

  const sortedByYesterdayViews = [...allTabFilteredPosts]
    .sort((a, b) => (b.yesterday_views || 0) - (a.yesterday_views || 0));

  const trendingPosts = sortedByYesterdayViews.slice(0, 3);
  const remainingPosts = sortedByYesterdayViews.slice(3);

  let goTogetherTabPosts = postsWithLatestAuthorInfo
    .filter(post => post.type === "같이가기")
    .filter(applyGlobalFilters);

  if (goTogetherTabPosts.length === 0 && posts.length === 0) {
    goTogetherTabPosts = sampleGoTogetherPosts.filter(applyGlobalFilters);
  }
  goTogetherTabPosts.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());

  const allPossiblePostsForFilters = posts.length === 0
    ? [...postsWithLatestAuthorInfo, ...sampleGoTogetherPosts]
    : postsWithLatestAuthorInfo;

  const locations = [...new Set(allPossiblePostsForFilters.map(p => p.festival_location).filter(Boolean))];
  const categories = t.categories;

  let showNoPostsMessage = false;
  if (activeTab === "전체" && allTabFilteredPosts.length === 0 && !isLoading) {
    showNoPostsMessage = true;
  } else if (activeTab === "축제 같이가기" && goTogetherTabPosts.length === 0 && !isLoading) {
    showNoPostsMessage = true;
  }

  // 글쓰기 버튼 클릭 시 로그인 체크
  const handleCreatePost = () => {
    if (!user) {
      setShowLoginModal(true); // Show login modal instead of alert
      return;
    }
    navigate(createPageUrl("CreatePost"));
  };

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname); // Redirect to login, then back to current page
  };

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message={t.loginRequired}
      />

      {/* Header */}
      <div className="bg-black border-b border-gray-800 py-4 px-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">{t.pageTitle}</h1>
          <Button
            onClick={handleCreatePost}
            className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 border-none rounded-full text-white"
          >
            <Plus className="w-5 h-5 mr-1" />
            {t.writeButton}
          </Button>
        </div>

        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-gray-900 border-gray-800 text-white placeholder:text-gray-500 rounded-xl pl-4"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
        <TabsList className="w-full bg-gray-900 grid grid-cols-3 mt-4">
          <TabsTrigger value="전체" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-white">
            {t.tabAll}
          </TabsTrigger>
          <TabsTrigger value="축제 같이가기" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-white">
            {t.tabGoTogether}
          </TabsTrigger>
          <TabsTrigger value="팔로우" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-white">
            {t.tabFollow}
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-auto min-w-[100px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-cyan-400" />
                <SelectValue>
                  {locationFilter === "all" ? t.countryLabel : locationFilter}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800">
              <SelectItem value="all" className="text-white">{t.allCountries}</SelectItem>
              {locations.map(location => (
                <SelectItem key={location} value={location} className="text-white">
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-auto min-w-[120px] bg-gray-900 border-gray-800 text-white rounded-full h-9">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-400" />
                <SelectValue>
                  {categoryFilter === "all" ? t.categoryLabel : categoryFilter}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-800">
              <SelectItem value="all" className="text-white">{t.allCategories}</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category} className="text-white">
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
                    {safeFormatDate(dateRange.from, 'M/d')} - {safeFormatDate(dateRange.to, 'M/d')}
                  </span>
                ) : (
                  <span>{t.dateLabel}</span>
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

        {/* 전체 탭 */}
        <TabsContent value="전체" className="mt-4">
          {/* 인기 게시물 */}
          <div className="mb-6">
            <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              {t.trendingTitle}
            </h3>
            <p className="text-gray-500 text-xs mb-3">{t.trendingDesc}</p>
            <div className="space-y-3">
              {trendingPosts.map((post) => (
                <Link key={post.id} to={createPageUrl(`PostDetail?id=${post.id}`)}>
                  <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all duration-300 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${typeColors[post.type]}`}>
                          {t.postTypes[post.type] || post.type}
                        </span>
                        {post.festival_name && (
                          <div className="flex items-center gap-1 text-sm text-gray-400">
                            {post.festival_name}
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">
                        {post.title}
                      </h3>

                      <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                        {post.content}
                      </p>

                      {post.image_urls && post.image_urls.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {post.image_urls.slice(0, 4).map((url, index) => (
                            <img
                              key={index}
                              src={url}
                              alt=""
                              className="w-full h-20 object-cover rounded-lg"
                            />
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Heart className="w-4 h-4" />
                            {post.likes_count || 0}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" />
                            {post.comments_count || 0}
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            {post.view_count?.toLocaleString() || 0}
                          </div>
                          <span>{safeFormatDate(post.created_date, t.dateFormat, locale, t.dateUndecided)}</span>
                        </div>
                        <div className="text-sm text-gray-400">
                          {post.author_name}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* 전체 게시물 */}
          <h3 className="text-white font-bold text-lg mb-3">{t.allPostsTitle}</h3>
          <div className="space-y-3">
            {remainingPosts.map((post) => (
              <Link key={post.id} to={createPageUrl(`PostDetail?id=${post.id}`)}>
                <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4">
                  <div className="flex items-start gap-3">
                    <Link to={createPageUrl(`UserProfile?email=${post.author_email}`)} onClick={(e) => e.stopPropagation()}>
                      {post.author_profile_image ? (
                        <img
                          src={post.author_profile_image}
                          alt={post.author_name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                          {post.author_name?.[0] || 'U'}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold truncate">{post.author_name}</span>
                        <Badge className={`${typeColors[post.type]} text-xs font-bold text-white`} variant="secondary">
                          {t.postTypes[post.type] || post.type}
                        </Badge>
                      </div>
                      <h4 className="text-white font-medium mb-1">{post.title}</h4>
                      <p className="text-gray-400 text-sm line-clamp-2 mb-2">{post.content}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {post.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {post.comments_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.view_count?.toLocaleString() || 0}
                        </span>
                        <span>{safeFormatDate(post.created_date, t.dateFormat, locale, t.dateUndecided)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        {/* 축제 같이가기 탭 */}
        <TabsContent value="축제 같이가기" className="mt-4">
          <div className="mb-4 bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-400/30 rounded-lg p-4">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              {t.goTogetherTitle}
            </h3>
            <p className="text-gray-300 text-sm">
              {t.goTogetherDesc}
            </p>
          </div>

          <div className="space-y-3">
            {goTogetherTabPosts.map((post) => (
              <Link key={post.id} to={createPageUrl(`GoTogetherDetail?id=${post.id}`)}>
                <Card className="bg-gray-900 border-gray-800 hover:border-purple-400/50 transition-all p-4">
                  <div className="flex items-start gap-3">
                    {post.author_profile_image ? (
                      <img
                        src={post.author_profile_image}
                        alt={post.author_name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {post.author_name?.[0] || 'U'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold truncate">{post.author_name}</span>
                        <Badge className={`${getTemperatureColor(post.temperature)} border-current text-xs`} variant="outline">
                          {post.temperature}°C
                        </Badge>
                      </div>
                      <h4 className="text-white font-medium mb-1 line-clamp-1">{post.title}</h4>
                      {post.festival_name && (
                        <div className="flex items-center gap-1 text-sm text-purple-400 mb-2">
                          <span className="truncate">{post.festival_name}</span>
                        </div>
                      )}
                      <p className="text-gray-400 text-sm mb-1">{post.festival_location}</p>
                      <p className="text-gray-500 text-xs">
                        {post.festival_category} / {safeFormatDate(post.festival_date, t.dateFormat, locale, t.dateUndecided)}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.view_count?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {post.comments_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        {/* 팔로우 탭 */}
        <TabsContent value="팔로우" className="mt-4">
          <div className="text-center py-12">
            <p className="text-gray-500 mb-3">{t.followEmptyMsg}</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* No posts message (applies to "전체" and "축제 같이가기" tabs if no posts after filters) */}
      {showNoPostsMessage && (
        <Card className="bg-gray-900 border-gray-800 p-12 text-center mx-4 mt-4">
          <p className="text-gray-400 mb-4">{t.noPostsMsg}</p>
          <Link to={createPageUrl("CreatePost")}>
            <Button className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 rounded-full">
              {t.firstPostButton}
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}