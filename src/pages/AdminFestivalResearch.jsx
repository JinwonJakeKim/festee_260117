
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Search, CheckCircle, AlertCircle, Loader, MapPin, Calendar, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminFestivalResearch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("일본");
  const [isResearching, setIsResearching] = useState(false);
  const [researchResults, setResearchResults] = useState(null);
  const [selectedFestivals, setSelectedFestivals] = useState([]);
  const [researchProgress, setResearchProgress] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(createPageUrl("AdminDashboard"));
    }
  }, [user, isLoading, navigate]);

  const bulkCreateMutation = useMutation({
    mutationFn: async (festivals) => {
      const festivalsToCreate = festivals.map(f => {
        const { _metadata, ...festivalData } = f;
        return festivalData;
      });
      await base44.entities.Festival.bulkCreate(festivalsToCreate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('선택한 축제가 추가되었습니다!');
      setResearchResults(null);
      setSelectedFestivals([]);
      setRegion("");
    },
  });

  const handleResearch = async () => {
    if (!region.trim()) {
      alert('지역명을 입력해주세요');
      return;
    }

    setIsResearching(true);
    setResearchProgress("AI가 인터넷에서 축제 정보를 검색하고 있습니다...");
    
    try {
      const response = await base44.functions.invoke('researchFestivals', {
        region: region.trim(),
        country: country
      });

      console.log('Research response:', response);

      if (response.data.success) {
        setResearchResults(response.data);
        setSelectedFestivals(response.data.festivals.map((_, idx) => idx));
        setResearchProgress("");
        
        if (response.data.festivals.length === 0) {
          alert('조사된 축제가 없습니다. 다른 지역명을 입력해주세요.');
        }
      } else {
        console.error('Research failed:', response.data);
        alert(`조사 중 오류가 발생했습니다:\n${response.data.error || '알 수 없는 오류'}\n\n${response.data.details || ''}`);
      }
    } catch (error) {
      console.error('Research error:', error);
      alert(`조사 중 오류가 발생했습니다:\n${error.message}\n\n다시 시도해주세요.`);
    } finally {
      setIsResearching(false);
      setResearchProgress("");
    }
  };

  const toggleFestival = (index) => {
    setSelectedFestivals(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleSave = () => {
    const festivalsToSave = researchResults.festivals.filter((_, idx) =>
      selectedFestivals.includes(idx)
    );
    
    if (festivalsToSave.length === 0) {
      alert('저장할 축제를 선택해주세요');
      return;
    }

    bulkCreateMutation.mutate(festivalsToSave);
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

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(createPageUrl("AdminDashboard"))}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">AI 축제 자동 조사</h1>
            <p className="text-gray-400 text-sm">인터넷 검색으로 정확한 축제 정보 수집</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* 설명 카드 */}
        <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30 p-4">
          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-400" />
            AI 기반 축제 정보 자동 수집 시스템
          </h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>✓ 실시간 인터넷 검색으로 최신 정보 수집</li>
            <li>✓ 여러 소스 교차 확인으로 정확도 향상</li>
            <li>✓ 날짜, 장소, GPS 좌표 자동 검증</li>
            <li>✓ 약 2-3분 소요 (축제 개수에 따라 다름)</li>
          </ul>
        </Card>

        {/* 검색 폼 */}
        {!researchResults && (
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">국가</label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="일본" className="text-white">일본</SelectItem>
                    <SelectItem value="한국" className="text-white">한국</SelectItem>
                    <SelectItem value="미국" className="text-white">미국</SelectItem>
                    <SelectItem value="영국" className="text-white">영국</SelectItem>
                    <SelectItem value="프랑스" className="text-white">프랑스</SelectItem>
                    <SelectItem value="독일" className="text-white">독일</SelectItem>
                    <SelectItem value="스페인" className="text-white">스페인</SelectItem>
                    <SelectItem value="태국" className="text-white">태국</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">지역 / 도시</label>
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="예: 오사카, 교토, 도쿄 등"
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled={isResearching}
                />
              </div>

              <Button
                onClick={handleResearch}
                disabled={isResearching || !region.trim()}
                className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12"
              >
                {isResearching ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    조사 중...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    축제 조사 시작
                  </>
                )}
              </Button>

              {researchProgress && (
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <Loader className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                  <p className="text-white font-medium mb-1">{researchProgress}</p>
                  <p className="text-gray-400 text-xs">
                    약 30초-1분 정도 소요됩니다
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 조사 결과 */}
        {researchResults && (
          <>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg">
                    {researchResults.region} 축제 조사 완료
                  </h3>
                  <p className="text-gray-400 text-sm">
                    총 {researchResults.festivals_found}개 발견 · {selectedFestivals.length}개 선택됨
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setResearchResults(null)}
                    variant="outline"
                    className="border-gray-700"
                  >
                    다시 조사
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={selectedFestivals.length === 0 || bulkCreateMutation.isPending}
                    className="bg-cyan-500 hover:bg-cyan-600"
                  >
                    {bulkCreateMutation.isPending ? '저장 중...' : `${selectedFestivals.length}개 저장`}
                  </Button>
                </div>
              </div>
            </Card>

            {/* 축제 목록 */}
            <div className="space-y-3">
              {researchResults.festivals.map((festival, index) => (
                <Card
                  key={index}
                  className={`border transition-all cursor-pointer ${
                    selectedFestivals.includes(index)
                      ? 'bg-cyan-900/20 border-cyan-400'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                  onClick={() => toggleFestival(index)}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <img
                          src={festival.thumbnail_url}
                          alt={festival.name}
                          className="w-24 h-24 rounded-lg object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="text-white font-bold mb-1">{festival.name}</h3>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <Badge className="bg-purple-500 text-white">{festival.category}</Badge>
                              {festival._metadata?.estimated && (
                                <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                                  날짜 추정
                                </Badge>
                              )}
                              {festival._metadata?.verification_confidence && (
                                <Badge variant="outline" className="text-gray-400 border-gray-700">
                                  신뢰도: {(festival._metadata.verification_confidence * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedFestivals.includes(index)
                              ? 'bg-cyan-400 border-cyan-400'
                              : 'border-gray-600'
                          }`}>
                            {selectedFestivals.includes(index) && (
                              <CheckCircle className="w-4 h-4 text-black" />
                            )}
                          </div>
                        </div>

                        <p className="text-gray-300 text-sm mb-2 line-clamp-2">{festival.description}</p>

                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2 text-gray-400">
                            <Calendar className="w-3 h-3 text-pink-500" />
                            {festival.start_date} ~ {festival.end_date}
                          </div>
                          <div className="flex items-center gap-2 text-gray-400">
                            <MapPin className="w-3 h-3 text-cyan-400" />
                            {festival.city}, {festival.country}
                          </div>
                          {festival.website && (
                            <div className="flex items-center gap-2 text-cyan-400">
                              <ExternalLink className="w-3 h-3" />
                              {festival.website}
                            </div>
                          )}
                        </div>

                        {festival.tags && festival.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {festival.tags.slice(0, 5).map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs border-gray-700 text-gray-400">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
