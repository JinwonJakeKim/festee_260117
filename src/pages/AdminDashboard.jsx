import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Star, MessageSquare, Image as ImageIcon, Edit, Trash2, Link as LinkIcon, Globe, CheckSquare, Square, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";

// 안전한 날짜 포맷팅 함수
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("festivals");
  const [selectedFestivals, setSelectedFestivals] = useState(new Set());
  const [deletionProgress, setDeletionProgress] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  // 권한 체크
  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(-1);
    }
  }, [user, isLoading, navigate]);

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list('-created_date'),
    initialData: [],
  });

  const { data: feedbacks } = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () => base44.entities.Feedback.list('-created_date'),
    initialData: [],
  });

  const { data: advertisements } = useQuery({
    queryKey: ['advertisements'],
    queryFn: () => base44.entities.Advertisement.list('order'),
    initialData: [],
  });

  const { data: apiUsageLogs } = useQuery({
    queryKey: ['apiUsageLogs'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      return base44.entities.ApiUsageLog.filter({ date: today });
    },
    initialData: [],
  });

  const { data: geocodingMonthlyLogs } = useQuery({
    queryKey: ['geocodingMonthlyLogs'],
    queryFn: async () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const allLogs = await base44.entities.ApiUsageLog.filter({ api_name: 'google_geocoding_api' });
      return allLogs.filter(log => log.date && log.date.startsWith(currentMonth));
    },
    initialData: [],
  });

  const updateFestivalStarMutation = useMutation({
    mutationFn: async ({ festivalId, starRating }) => {
      await base44.entities.Festival.update(festivalId, { star_rating: starRating });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('FesteeStar가 업데이트되었습니다');
    },
  });

  const updateFeedbackStatusMutation = useMutation({
    mutationFn: async ({ feedbackId, status }) => {
      await base44.entities.Feedback.update(feedbackId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedbacks'] });
    },
  });

  const deleteFestivalMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (confirm('정말 이 축제를 삭제하시겠습니까?')) {
        await base44.entities.Festival.delete(festivalId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('축제가 삭제되었습니다');
    },
  });

  const deleteSelectedFestivalsMutation = useMutation({
    mutationFn: async (festivalIds) => {
      console.log('[Admin] Starting deletion of festivals:', festivalIds);
      
      const count = festivalIds.length;
      const confirmed = confirm(`선택한 ${count}개의 축제를 삭제하시겠습니까?\n\n삭제 진행 상황을 확인할 수 있습니다.`);
      
      if (!confirmed) {
        console.log('[Admin] Deletion cancelled by user');
        throw new Error('CANCELLED');
      }
      
      console.log('[Admin] User confirmed deletion');
      
      // 진행 상황 초기화
      setDeletionProgress({
        total: count,
        current: 0,
        success: 0,
        failed: 0,
        errors: [],
        items: []
      });
      
      // 각 축제 삭제
      for (let i = 0; i < festivalIds.length; i++) {
        const id = festivalIds[i];
        const festivalName = festivals.find(f => f.id === id)?.name || id;
        
        try {
          console.log(`[Admin] Deleting festival ${i + 1}/${count}: ${festivalName}...`);
          
          // 진행 상황 업데이트 - 시작
          setDeletionProgress(prev => ({
            ...prev,
            current: i + 1,
            items: [...prev.items, { name: festivalName, status: 'deleting' }]
          }));
          
          await base44.entities.Festival.delete(id);
          
          console.log(`[Admin] ✓ Festival ${festivalName} deleted successfully`);
          
          // 진행 상황 업데이트 - 성공
          setDeletionProgress(prev => ({
            ...prev,
            success: prev.success + 1,
            items: prev.items.map((item, idx) => 
              idx === prev.items.length - 1 
                ? { ...item, status: 'success' }
                : item
            )
          }));
          
        } catch (error) {
          console.error(`[Admin] ✗ Failed to delete festival ${festivalName}:`, error);
          
          // 진행 상황 업데이트 - 실패
          setDeletionProgress(prev => ({
            ...prev,
            failed: prev.failed + 1,
            errors: [...prev.errors, { id, name: festivalName, error: error.message }],
            items: prev.items.map((item, idx) => 
              idx === prev.items.length - 1 
                ? { ...item, status: 'failed', error: error.message }
                : item
            )
          }));
        }
        
        // 각 삭제 사이에 짧은 딜레이 (UI 업데이트를 위해)
        if (i < festivalIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const finalResult = {
        total: count,
        success: count - (deletionProgress?.errors?.length || 0), // Use the final count of errors, assuming deletionProgress is updated correctly
        failed: (deletionProgress?.errors?.length || 0)
      };
      
      console.log(`[Admin] Deletion complete:`, finalResult);
      
      return finalResult;
    },
    onSuccess: (result) => {
      console.log('[Admin] onSuccess called with result:', result);
      
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      setSelectedFestivals(new Set());
      
      // 진행 모달은 사용자가 닫을 때까지 유지
    },
    onError: (error) => {
      console.error('[Admin] Mutation error:', error);
      
      // 취소된 경우는 에러 메시지 표시하지 않음
      if (error.message !== 'CANCELLED') {
        alert('축제 삭제 중 오류가 발생했습니다.\n\n' + error.message);
      }
      
      setDeletionProgress(null); // Close the progress modal if an unexpected error occurs or it's cancelled
    },
  });

  const handleStarRatingChange = (festivalId, newRating) => {
    updateFestivalStarMutation.mutate({ festivalId, starRating: parseInt(newRating) });
  };

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedFestivals.size === festivals.length) {
      setSelectedFestivals(new Set());
    } else {
      setSelectedFestivals(new Set(festivals.map(f => f.id)));
    }
  };

  // 검색 결과만 선택/해제
  const handleSelectSearchResults = () => {
    const searchResultIds = new Set(filteredFestivals.map(f => f.id));
    const allSearchResultsSelected = filteredFestivals.every(f => selectedFestivals.has(f.id));
    
    if (allSearchResultsSelected) {
      // 검색 결과만 해제
      setSelectedFestivals(new Set(Array.from(selectedFestivals).filter(id => !searchResultIds.has(id))));
    } else {
      // 검색 결과만 선택
      setSelectedFestivals(new Set([...selectedFestivals, ...searchResultIds]));
    }
  };

  // 개별 선택/해제
  const handleSelectFestival = (festivalId) => {
    const newSelected = new Set(selectedFestivals);
    if (newSelected.has(festivalId)) {
      newSelected.delete(festivalId);
    } else {
      newSelected.add(festivalId);
    }
    setSelectedFestivals(newSelected);
  };

  // 선택된 축제 삭제
  const handleDeleteSelected = () => {
    if (selectedFestivals.size === 0) {
      alert('삭제할 축제를 선택해주세요');
      return;
    }
    
    console.log('[Admin] handleDeleteSelected called with:', Array.from(selectedFestivals));
    deleteSelectedFestivalsMutation.mutate(Array.from(selectedFestivals));
  };

  // 삭제 진행 모달 닫기
  const handleCloseProgress = () => {
    setDeletionProgress(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  const allSelected = festivals.length > 0 && selectedFestivals.size === festivals.length;
  const isDeleting = deleteSelectedFestivalsMutation.isLoading;
  const isDeletionComplete = deletionProgress && deletionProgress.current === deletionProgress.total;

  // 검색 필터링
  const filteredFestivals = festivals.filter(festival => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      festival.name?.toLowerCase().includes(query) ||
      festival.city?.toLowerCase().includes(query) ||
      festival.country?.toLowerCase().includes(query) ||
      festival.category?.toLowerCase().includes(query)
    );
  });

  // 검색 결과 모두 선택 여부
  const allSearchResultsSelected = filteredFestivals.length > 0 && 
    filteredFestivals.every(f => selectedFestivals.has(f.id));

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* 삭제 진행 상황 모달 */}
      <AnimatePresence>
        {deletionProgress && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />

            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-gray-900 rounded-2xl border border-gray-800 p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-white text-xl font-bold flex items-center gap-2">
                      {isDeletionComplete ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 text-green-400" />
                          삭제 완료
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                          삭제 진행 중
                        </>
                      )}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {deletionProgress.current} / {deletionProgress.total} 처리됨
                    </p>
                  </div>
                  {isDeletionComplete && (
                    <button
                      onClick={handleCloseProgress}
                      className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>

                {/* 진행률 바 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">진행률</span>
                    <span className="text-white font-bold">
                      {Math.round((deletionProgress.current / deletionProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${(deletionProgress.current / deletionProgress.total) * 100}%` 
                      }}
                      className="h-full bg-gradient-to-r from-cyan-500 to-pink-500"
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* 통계 */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <Card className="bg-gray-800 border-gray-700 p-3 text-center">
                    <div className="text-2xl font-bold text-white">{deletionProgress.total}</div>
                    <div className="text-xs text-gray-400">전체</div>
                  </Card>
                  <Card className="bg-green-900/20 border-green-400/30 p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{deletionProgress.success}</div>
                    <div className="text-xs text-green-400">성공</div>
                  </Card>
                  <Card className="bg-red-900/20 border-red-400/30 p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">{deletionProgress.failed}</div>
                    <div className="text-xs text-red-400">실패</div>
                  </Card>
                </div>

                {/* 항목 목록 */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {deletionProgress.items.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        item.status === 'success' 
                          ? 'bg-green-900/20 border border-green-400/30'
                          : item.status === 'failed'
                          ? 'bg-red-900/20 border border-red-400/30'
                          : 'bg-gray-800 border border-gray-700'
                      }`}
                    >
                      {item.status === 'deleting' && (
                        <Loader2 className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
                      )}
                      {item.status === 'success' && (
                        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                      )}
                      {item.status === 'failed' && (
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${
                          item.status === 'success' ? 'text-green-400'
                          : item.status === 'failed' ? 'text-red-400'
                          : 'text-white'
                        }`}>
                          {item.name}
                        </p>
                        {item.error && (
                          <p className="text-xs text-red-300 mt-1 truncate">
                            {item.error}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* 완료 버튼 */}
                {isDeletionComplete && (
                  <div className="mt-6">
                    <Button
                      onClick={handleCloseProgress}
                      className="w-full bg-cyan-500 hover:bg-cyan-600"
                    >
                      확인
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">관리자 대시보드</h1>
            <p className="text-gray-400 text-sm">Admin Dashboard</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-4">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="w-full bg-gray-900 grid grid-cols-5">
            <TabsTrigger value="festivals" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              축제 관리
            </TabsTrigger>
            <TabsTrigger value="stars" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              FesteeStar
            </TabsTrigger>
            <TabsTrigger value="feedback" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              피드백
            </TabsTrigger>
            <TabsTrigger value="ads" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              광고
            </TabsTrigger>
            <TabsTrigger value="api" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              API
            </TabsTrigger>
          </TabsList>

          {/* 축제 관리 탭 */}
          <TabsContent value="festivals" className="mt-4">
            <div className="mb-4 space-y-2">
              {/* 검색 바 */}
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="축제 이름, 도시, 국가, 카테고리로 검색..."
                className="bg-gray-900 border-gray-800 text-white"
              />

              <Button
                onClick={() => navigate(createPageUrl("AdminFestivalForm"))}
                className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                새 축제 추가
              </Button>
              
              {/* Removed AdminFestivalResearch button */}

              <Button
                onClick={() => navigate(createPageUrl("AdminTourAPI"))}
                className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
              >
                <Globe className="w-5 h-5 mr-2" />
                Korea - TourAPI
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("AdminUrlExtraction"))}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
              >
                <LinkIcon className="w-5 h-5 mr-2" />
                Japan - japantravel.com
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("AdminEventbrite"))}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              >
                <Globe className="w-5 h-5 mr-2" />
                EventbriteAPI 해외 축제 연동
              </Button>
            </div>

            {/* 선택 컨트롤 */}
            {filteredFestivals.length > 0 && (
              <div className="mb-4 space-y-2">
                <Card className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center gap-2 text-white hover:text-cyan-400 transition-colors"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-5 h-5 text-cyan-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                      <span className="font-medium">
                        {allSelected ? '전체 해제' : '전체 선택'}
                      </span>
                    </button>

                    {selectedFestivals.size > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-cyan-400 text-sm">
                          {selectedFestivals.size}개 선택됨
                        </span>
                        <Button
                          onClick={handleDeleteSelected}
                          disabled={isDeleting}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {isDeleting ? '삭제 중...' : '선택 삭제'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* 검색 결과 선택 버튼 - 검색 중일 때만 표시 */}
                  {searchQuery && (
                    <button
                      onClick={handleSelectSearchResults}
                      className="flex items-center gap-2 text-white hover:text-purple-400 transition-colors w-full py-2 px-3 bg-gray-800 rounded-lg"
                    >
                      {allSearchResultsSelected ? (
                        <CheckSquare className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                      <span className="font-medium text-sm">
                        {allSearchResultsSelected ? '검색 결과 해제' : '검색 결과만 선택'} ({filteredFestivals.length}개)
                      </span>
                    </button>
                  )}
                </Card>
              </div>
            )}

            {/* 검색 결과 표시 */}
            {searchQuery && (
              <div className="mb-3 text-gray-400 text-sm">
                검색 결과: {filteredFestivals.length}개
              </div>
            )}

            <div className="space-y-3">
              {filteredFestivals.map((festival) => {
                const isSelected = selectedFestivals.has(festival.id);
                
                return (
                  <Card 
                    key={festival.id} 
                    className={`border p-4 transition-all ${
                      isSelected 
                        ? 'bg-cyan-900/20 border-cyan-400' 
                        : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 체크박스 */}
                      <button
                        onClick={() => handleSelectFestival(festival.id)}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-6 h-6 text-cyan-400" />
                        ) : (
                          <Square className="w-6 h-6 text-gray-600 hover:text-gray-400" />
                        )}
                      </button>

                      <img
                        src={festival.thumbnail_url}
                        alt={festival.name}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="text-white font-bold mb-1">{festival.name}</h3>
                        <p className="text-gray-400 text-sm mb-1">
                          {festival.city}, {festival.country}
                        </p>
                        <div className="flex items-center gap-2">
                          {festival.star_rating && (
                            <Badge className="bg-yellow-500 text-black">
                              <Star className="w-3 h-3 mr-1" fill="currentColor" />
                              {festival.star_rating}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-gray-400 border-gray-700">
                            ❤️ {festival.likes_count || 0}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(createPageUrl(`AdminFestivalForm?id=${festival.id}`))}
                          className="border-gray-700 text-cyan-400"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteFestivalMutation.mutate(festival.id)}
                          className="border-gray-700 text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
                })}

                {filteredFestivals.length === 0 && searchQuery && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <p className="text-gray-500">"{searchQuery}"에 대한 검색 결과가 없습니다</p>
                </Card>
                )}
                </div>
                </TabsContent>

          {/* FesteeStar 관리 탭 */}
          <TabsContent value="stars" className="mt-4">
            <Card className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border-yellow-400/30 p-4 mb-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" fill="currentColor" />
                FesteeStar란?
              </h3>
              <p className="text-gray-300 text-sm">
                미슐랭 스타와 유사한 축제 평가 시스템입니다. 관리자와 유저의 평가를 종합하여 1~5개의 별을 부여합니다.
              </p>
            </Card>

            <div className="space-y-3">
              {festivals.map((festival) => (
                <Card key={festival.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={festival.thumbnail_url}
                      alt={festival.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="text-white font-bold mb-1">{festival.name}</h3>
                      <p className="text-gray-400 text-xs">
                        {festival.city}, {festival.country}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">FesteeStar 설정</label>
                    <Select
                      value={festival.star_rating?.toString() || "0"}
                      onValueChange={(value) => handleStarRatingChange(festival.id, value)}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-800">
                        <SelectItem value="0" className="text-white">별점 없음</SelectItem>
                        <SelectItem value="1" className="text-white">⭐ (1개)</SelectItem>
                        <SelectItem value="2" className="text-white">⭐⭐ (2개)</SelectItem>
                        <SelectItem value="3" className="text-white">⭐⭐⭐ (3개)</SelectItem>
                        <SelectItem value="4" className="text-white">⭐⭐⭐⭐ (4개)</SelectItem>
                        <SelectItem value="5" className="text-white">⭐⭐⭐⭐⭐ (5개)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* 피드백 관리 탭 */}
          <TabsContent value="feedback" className="mt-4">
            <div className="space-y-3">
              {feedbacks.map((feedback) => (
                <Card key={feedback.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          className={
                            feedback.status === '완료'
                              ? 'bg-green-500 text-white'
                              : feedback.status === '처리 중'
                              ? 'bg-blue-500 text-white'
                              : feedback.status === '거절'
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-700 text-white'
                          }
                        >
                          {feedback.status}
                        </Badge>
                        <Badge variant="outline" className="text-gray-400 border-gray-700">
                          {feedback.category}
                        </Badge>
                      </div>
                      <h3 className="text-white font-bold mb-1">{feedback.subject}</h3>
                      <p className="text-gray-400 text-sm mb-2">{feedback.content}</p>
                      <p className="text-gray-500 text-xs">
                        {feedback.user_name} · {safeFormatDate(feedback.created_date, 'yy.MM.dd HH:mm')}
                      </p>
                    </div>
                  </div>

                  <Select
                    value={feedback.status}
                    onValueChange={(value) =>
                      updateFeedbackStatusMutation.mutate({ feedbackId: feedback.id, status: value })
                    }
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800">
                      <SelectItem value="접수" className="text-white">접수</SelectItem>
                      <SelectItem value="처리 중" className="text-white">처리 중</SelectItem>
                      <SelectItem value="완료" className="text-white">완료</SelectItem>
                      <SelectItem value="거절" className="text-white">거절</SelectItem>
                    </SelectContent>
                  </Select>
                </Card>
              ))}

              {feedbacks.length === 0 && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <MessageSquare className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">피드백이 없습니다</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* 광고 관리 탭 */}
          <TabsContent value="ads" className="mt-4">
            <div className="mb-4">
              <Button
                onClick={() => navigate(createPageUrl('AdminAdForm'))}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                새 광고 추가
              </Button>
            </div>

            <div className="space-y-3">
              {advertisements.map((ad) => (
                <Card key={ad.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={ad.image_url}
                      alt={ad.name}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="text-white font-bold mb-1">{ad.name}</h3>
                      <p className="text-gray-400 text-sm mb-1">{ad.type}</p>
                      <Badge variant="outline" className={ad.is_active ? 'text-green-400 border-green-400' : 'text-gray-400 border-gray-700'}>
                        {ad.is_active ? '활성' : '비활성'}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(createPageUrl(`AdminAdForm?id=${ad.id}`))}
                        className="border-gray-700 text-cyan-400"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              {advertisements.length === 0 && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">광고가 없습니다</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* API 관리 탭 */}
          <TabsContent value="api" className="mt-4">
            <Card className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-400/30 p-4 mb-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                연동된 API
              </h3>
              <p className="text-gray-300 text-sm mb-3">
                외부 API 연동 현황과 일일 사용량을 확인할 수 있습니다.
              </p>
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">🇰🇷 한국 시각:</span>
                  <span className="text-white font-mono font-bold">
                    {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">🌐 UTC 시각:</span>
                  <span className="text-white font-mono font-bold">
                    {new Date().toLocaleString('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
              </div>
              <p className="text-gray-400 text-xs mt-2">
                ※ Google, YouTube API 사용량은 UTC 자정 기준 리셋
              </p>
            </Card>

            <div className="space-y-3">
              {/* Google Custom Search API */}
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">G</span>
                      </div>
                      Google Custom Search API
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      축제 이미지 검색에 사용
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">오늘 사용량</span>
                        <span className="text-white font-bold">
                          {apiUsageLogs.find(log => log.api_name === 'google_custom_search')?.count || 0} / 100 쿼리
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                          style={{ 
                            width: `${((apiUsageLogs.find(log => log.api_name === 'google_custom_search')?.count || 0) / 100) * 100}%` 
                          }}
                        />
                      </div>
                      <p className="text-gray-500 text-xs">
                        일일 무료 한도: 100 쿼리
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                    ✓ 연동됨
                  </Badge>
                  <a 
                    href="https://console.cloud.google.com/apis/dashboard?project=festee-shorts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    관리 콘솔
                  </a>
                </div>
              </Card>

              {/* YouTube Data API */}
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">▶</span>
                      </div>
                      YouTube Data API
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      축제 영상 및 Shorts 검색에 사용
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">오늘 사용량</span>
                        <span className="text-white font-bold">
                          {apiUsageLogs.find(log => log.api_name === 'youtube_data_api')?.count || 0} / 100 쿼리
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-600"
                          style={{ 
                            width: `${((apiUsageLogs.find(log => log.api_name === 'youtube_data_api')?.count || 0) / 100) * 100}%` 
                          }}
                        />
                      </div>
                      <p className="text-gray-500 text-xs">
                        일일 무료 한도: 100 쿼리
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                    ✓ 연동됨
                  </Badge>
                  <a 
                    href="https://console.cloud.google.com/apis/dashboard?project=festee-shorts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    관리 콘솔
                  </a>
                </div>
              </Card>

              {/* TourAPI */}
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">🇰🇷</span>
                      </div>
                      한국관광공사 TourAPI
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      국내 축제 데이터 수집
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">일일 한도</span>
                        <span className="text-white font-bold">무제한</span>
                      </div>
                      <p className="text-gray-500 text-xs">
                        무료 사용 가능 (일일 호출 제한 없음)
                      </p>
                    </div>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                  ✓ 연동됨
                </Badge>
              </Card>

              {/* Eventbrite API */}
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">E</span>
                      </div>
                      Eventbrite API
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      해외 이벤트 및 축제 데이터
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">일일 한도</span>
                        <span className="text-white font-bold">1,000 호출</span>
                      </div>
                      <p className="text-gray-500 text-xs">
                        무료 플랜 (월 50,000 호출 제한)
                      </p>
                    </div>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                  ✓ 연동됨
                </Badge>
              </Card>

              {/* Base44 InvokeLLM (참고) */}
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AI</span>
                      </div>
                      Base44 InvokeLLM
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      축제 정보 번역 및 요약 생성
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">오늘 사용량</span>
                        <span className="text-white font-bold">
                          {apiUsageLogs.find(log => log.api_name === 'invoke_llm')?.count || 0} 호출
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs">
                        Base44 플랫폼 내장 기능 (별도 비용 없음)
                      </p>
                    </div>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                  ✓ 사용 중
                </Badge>
              </Card>
            </div>

            {/* 안내 카드 */}
            <Card className="bg-blue-900/20 border-blue-400/30 p-4 mt-4">
              <h4 className="text-blue-400 font-bold mb-2 text-sm">💡 API 사용량 안내</h4>
              <ul className="text-gray-300 text-xs space-y-1">
                <li>• Google Custom Search와 YouTube Data API는 하루 100회 무료 제한이 있습니다</li>
                <li>• 제한을 초과하면 다음날 00:00(UTC)에 자동 리셋됩니다</li>
                <li>• 변환/재변환 작업 시 자동으로 API 사용량이 추적됩니다</li>
                <li>• TourAPI와 Eventbrite는 충분한 무료 한도를 제공합니다</li>
              </ul>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}