import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Star, MessageSquare, Image as ImageIcon, Edit, Trash2, Search, Link as LinkIcon, Globe, CheckSquare, Square } from "lucide-react";
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
      const confirmed = confirm(`선택한 ${count}개의 축제를 삭제하시겠습니까?`);
      
      if (!confirmed) {
        console.log('[Admin] Deletion cancelled by user');
        throw new Error('CANCELLED'); // 취소를 에러로 처리하여 onSuccess가 실행되지 않도록
      }
      
      console.log('[Admin] User confirmed deletion');
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // 각 축제 삭제
      for (const id of festivalIds) {
        try {
          console.log(`[Admin] Deleting festival ${id}...`);
          await base44.entities.Festival.delete(id);
          successCount++;
          console.log(`[Admin] ✓ Festival ${id} deleted successfully`);
        } catch (error) {
          errorCount++;
          console.error(`[Admin] ✗ Failed to delete festival ${id}:`, error);
          errors.push({ id, error: error.message });
        }
      }
      
      console.log(`[Admin] Deletion complete: ${successCount} success, ${errorCount} errors`);
      
      if (errorCount > 0) {
        console.error('[Admin] Errors during deletion:', errors);
      }
      
      return { successCount, errorCount, errors };
    },
    onSuccess: (result) => {
      console.log('[Admin] onSuccess called with result:', result);
      
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      setSelectedFestivals(new Set());
      
      if (result.errorCount === 0) {
        alert(`${result.successCount}개의 축제가 삭제되었습니다`);
      } else {
        alert(`${result.successCount}개 삭제 성공, ${result.errorCount}개 실패\n\n실패한 항목은 콘솔을 확인해주세요.`);
      }
    },
    onError: (error) => {
      console.error('[Admin] Mutation error:', error);
      
      // 취소된 경우는 에러 메시지 표시하지 않음
      if (error.message !== 'CANCELLED') {
        alert('축제 삭제 중 오류가 발생했습니다.\n\n' + error.message);
      }
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

  return (
    <div className="min-h-screen bg-black pb-20">
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
          <TabsList className="w-full bg-gray-900 grid grid-cols-4">
            <TabsTrigger value="festivals" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              축제 관리
            </TabsTrigger>
            <TabsTrigger value="stars" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              FesteeStar
            </TabsTrigger>
            <TabsTrigger value="feedback" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              피드백
            </TabsTrigger>
            <TabsTrigger value="ads" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              광고
            </TabsTrigger>
          </TabsList>

          {/* 축제 관리 탭 */}
          <TabsContent value="festivals" className="mt-4">
            <div className="mb-4 space-y-2">
              <Button
                onClick={() => navigate(createPageUrl("AdminFestivalForm"))}
                className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                새 축제 추가
              </Button>
              
              <Button
                onClick={() => navigate(createPageUrl("AdminFestivalResearch"))}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              >
                <Search className="w-5 h-5 mr-2" />
                AI로 축제 자동 조사
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("AdminFestivalExtract"))}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
              >
                <LinkIcon className="w-5 h-5 mr-2" />
                URL에서 축제 정보 추출
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("AdminTourAPI"))}
                className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
              >
                <Globe className="w-5 h-5 mr-2" />
                TourAPI 국내 축제 연동
              </Button>
            </div>

            {/* 선택 컨트롤 */}
            {festivals.length > 0 && (
              <div className="mb-4 space-y-2">
                <Card className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center justify-between">
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
                          disabled={deleteSelectedFestivalsMutation.isLoading}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {deleteSelectedFestivalsMutation.isLoading ? '삭제 중...' : '선택 삭제'}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            <div className="space-y-3">
              {festivals.map((festival) => {
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
        </Tabs>
      </div>
    </div>
  );
}