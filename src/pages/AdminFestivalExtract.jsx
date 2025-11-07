
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Link as LinkIcon, Loader, CheckCircle, MapPin, Calendar, Shield, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 날짜 유효성 검사 헬퍼 함수
const isValidDate = (dateString) => {
  if (!dateString || dateString.trim() === '') return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

const safeFormatDate = (dateString, formatString = 'yyyy-MM-dd') => {
  if (!isValidDate(dateString)) return '날짜 미정';
  try {
    return format(new Date(dateString), formatString, { locale: ko });
  } catch (e) {
    console.error("Error formatting date:", e);
    return '날짜 미정';
  }
};

export default function AdminFestivalExtract() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResults, setExtractionResults] = useState(null);
  const [selectedFestivals, setSelectedFestivals] = useState([]);
  const [extractionProgress, setExtractionProgress] = useState("");
  const [extractionType, setExtractionType] = useState("single");

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
      console.log('Saving festivals:', festivals);
      
      const festivalsToCreate = festivals.map(f => {
        const { _metadata, start_date, end_date, ...festivalData } = f;
        
        // 날짜 변환 - ISO 문자열을 날짜 부분만 추출 (YYYY-MM-DD)
        let processedStartDate = null;
        let processedEndDate = null;
        
        if (isValidDate(start_date)) {
          const startDateObj = new Date(start_date);
          processedStartDate = startDateObj.toISOString().split('T')[0];
        }
        
        if (isValidDate(end_date)) {
          const endDateObj = new Date(end_date);
          processedEndDate = endDateObj.toISOString().split('T')[0];
        }
        
        console.log('Processed dates for festival:', festivalData.name, { 
          original: { start_date, end_date },
          processed: { processedStartDate, processedEndDate }
        });
        
        return {
          ...festivalData,
          start_date: processedStartDate,
          end_date: processedEndDate,
        };
      });
      
      console.log('Festivals to create:', festivalsToCreate);
      await base44.entities.Festival.bulkCreate(festivalsToCreate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert('선택한 축제가 추가되었습니다!');
      setExtractionResults(null);
      setSelectedFestivals([]);
      setUrl("");
    },
    onError: (error) => {
      console.error('Save error:', error);
      alert(`저장 중 오류가 발생했습니다:\n\n${error.message}\n\n콘솔을 확인해주세요.`);
    },
  });

  const handleExtract = async () => {
    if (!url.trim()) {
      alert('URL을 입력해주세요');
      return;
    }

    setIsExtracting(true);
    setExtractionResults(null);

    try {
      if (extractionType === 'list') {
        setExtractionProgress("목록 페이지 분석 중...");

        const response = await base44.functions.invoke('extractFestivalsFromListPage', {
          url: url.trim(),
          maxFestivals: 8
        });

        if (response.data.success) {
          setExtractionResults(response.data);
          setSelectedFestivals(response.data.festivals.map((_, idx) => idx));
          setExtractionProgress("");

          if (response.data.festivals.length === 0) {
            alert(`축제 정보를 찾을 수 없습니다.\n\n${response.data.message || '다른 URL을 시도하거나, 단일 페이지 추출을 사용해주세요.'}`);
          }
        } else {
          const errorMsg = response.data.message || response.data.error || '알 수 없는 오류';
          alert(`추출 중 오류가 발생했습니다:\n\n${errorMsg}\n\n💡 팁:\n- URL이 올바른지 확인해주세요\n- 일부 웹사이트는 보안 정책으로 접근이 제한될 수 있습니다\n- 다른 URL을 시도하거나 수동으로 축제를 추가해주세요`);
        }
      } else {
        setExtractionProgress("페이지 내용 분석 중...");

        const response = await base44.functions.invoke('extractFestivalFromUrl', {
          url: url.trim()
        });

        if (response.data.success) {
          setExtractionResults(response.data);
          setSelectedFestivals(response.data.festivals.map((_, idx) => idx));
          setExtractionProgress("");

          if (response.data.festivals.length === 0) {
            alert('이 페이지에서 축제 정보를 추출하지 못했습니다.\n다른 URL을 시도해주세요.');
          }
        } else {
          const errorMsg = response.data.message || response.data.error || '알 수 없는 오류';
          alert(`추출 중 오류가 발생했습니다:\n\n${errorMsg}\n\n💡 팁:\n- URL이 올바른지 확인해주세요\n- 일부 웹사이트는 보안 정책으로 접근이 제한될 수 있습니다\n- 다른 URL을 시도하거나 수동으로 축제를 추가해주세요`);
        }
      }
    } catch (error) {
      console.error('Extraction error:', error);
      let errorMessage = '추출 중 오류가 발생했습니다';
      
      if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
        errorMessage = '네트워크 오류가 발생했습니다.\n인터넷 연결을 확인하고 다시 시도해주세요.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = '요청 시간이 초과되었습니다.\n웹사이트 응답이 느립니다. 다른 URL을 시도해주세요.';
      } else {
        errorMessage = `${error.message}\n\n다시 시도해주세요.`;
      }
      
      alert(errorMessage);
    } finally {
      setIsExtracting(false);
      setExtractionProgress("");
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
    const festivalsToSave = extractionResults.festivals.filter((_, idx) =>
      selectedFestivals.includes(idx)
    );
    
    if (festivalsToSave.length === 0) {
      alert('저장할 축제를 선택해주세요');
      return;
    }

    console.log('Attempting to save festivals:', festivalsToSave);
    bulkCreateMutation.mutate(festivalsToSave);
  };

  const getConfidenceBadge = (confidence) => {
    const confidencePercent = Math.round(confidence * 100);
    if (confidencePercent >= 90) return { color: 'bg-green-500', text: '매우 높음', percent: confidencePercent };
    if (confidencePercent >= 80) return { color: 'bg-cyan-500', text: '높음', percent: confidencePercent };
    if (confidencePercent >= 70) return { color: 'bg-yellow-500', text: '보통', percent: confidencePercent };
    return { color: 'bg-red-500', text: '낮음', percent: confidencePercent };
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
            <h1 className="text-xl font-bold text-white">URL에서 축제 정보 추출</h1>
            <p className="text-gray-400 text-sm">웹페이지에서 자동으로 축제 정보 수집</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* 설명 카드 */}
        <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30 p-4">
          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-cyan-400" />
            URL 기반 자동 추출 시스템
          </h3>
          <ul className="text-gray-300 text-sm space-y-1 mb-3">
            <li>✓ AI가 웹페이지 내용을 분석하여 축제 정보 추출</li>
            <li>✓ 축제 이름, 날짜, 장소 등 자동 추출</li>
            <li>✓ 단일 축제, 여러 축제, 목록 페이지 모두 지원</li>
            <li>✓ 신뢰도 검증으로 정확한 정보만 저장</li>
          </ul>
          <div className="bg-cyan-900/20 border border-cyan-400/30 rounded-lg p-3 mt-3">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-cyan-400 font-bold text-sm mb-1">신뢰도 검증 시스템</p>
                <ul className="text-gray-300 text-xs space-y-0.5">
                  <li>• 필수 정보(이름, 도시, 설명) 확인</li>
                  <li>• 날짜 유효성 검사 (2025년 이후)</li>
                  <li>• GPS 좌표 정확도 검증</li>
                  <li>• 신뢰도 80% 이상만 저장</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* 추출 타입 선택 */}
        {!extractionResults && (
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">추출 방식 선택</label>
                <Tabs value={extractionType} onValueChange={setExtractionType}>
                  <TabsList className="w-full bg-gray-800 grid grid-cols-3">
                    <TabsTrigger value="single" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
                      단일 페이지
                    </TabsTrigger>
                    <TabsTrigger value="multiple" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                      복합 페이지
                    </TabsTrigger>
                    <TabsTrigger value="list" className="data-[state=active]:bg-pink-500 data-[state=active]:text-white">
                      목록 페이지
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* 각 타입별 설명 */}
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                {extractionType === 'single' && (
                  <div>
                    <p className="text-cyan-400 font-bold text-sm mb-2">📄 단일 페이지</p>
                    <p className="text-gray-300 text-xs mb-2">
                      <strong>1개의 축제</strong>에 대한 상세 정보가 담긴 페이지입니다.
                    </p>
                    <p className="text-gray-400 text-xs">
                      예: 특정 축제의 공식 웹사이트, 단일 축제 소개 페이지
                    </p>
                  </div>
                )}
                {extractionType === 'multiple' && (
                  <div>
                    <p className="text-purple-400 font-bold text-sm mb-2">📑 복합 페이지</p>
                    <p className="text-gray-300 text-xs mb-2">
                      <strong>여러 개의 축제</strong> 정보가 한 페이지 안에 모두 담겨 있는 페이지입니다.
                    </p>
                    <p className="text-gray-400 text-xs">
                      예: "나고야 축제 Top 10" 같은 블로그 글, 여러 축제를 소개하는 아티클
                    </p>
                  </div>
                )}
                {extractionType === 'list' && (
                  <div>
                    <p className="text-pink-400 font-bold text-sm mb-2">🔗 목록 페이지</p>
                    <p className="text-gray-300 text-xs mb-2">
                      축제 정보는 없고, <strong>각 축제 상세 페이지로 가는 링크</strong>만 모아둔 페이지입니다.
                    </p>
                    <p className="text-gray-400 text-xs mb-2">
                      예: 관광청의 이벤트 목록, 축제 디렉토리 페이지
                    </p>
                    <p className="text-yellow-400 text-xs">
                      ⚠️ 각 링크를 타고 들어가 정보를 추출하므로 시간이 오래 걸릴 수 있습니다.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block flex items-center gap-2">
                  {extractionType === 'list' ? (
                    <>
                      <LinkIcon className="w-4 h-4 text-pink-500" />
                      축제 목록 페이지 URL
                    </>
                  ) : extractionType === 'multiple' ? (
                    <>
                      <LinkIcon className="w-4 h-4 text-purple-400" />
                      복합 페이지 URL (여러 축제)
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4 text-cyan-400" />
                      단일 축제 페이지 URL
                    </>
                  )}
                </label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                    extractionType === 'list'
                      ? "예: https://example.com/festivals/nagoya"
                      : extractionType === 'multiple'
                      ? "예: https://matcha-jp.com/en/20953"
                      : "예: https://example.com/festival/detail/123"
                  }
                  className="bg-gray-800 border-gray-700 text-white mb-2"
                  disabled={isExtracting}
                />
                <p className="text-gray-500 text-xs">
                  {extractionType === 'list'
                    ? "💡 각 축제 링크를 자동으로 찾아 상세 정보를 추출합니다."
                    : extractionType === 'multiple'
                    ? "💡 한 페이지 안의 모든 축제 정보를 추출합니다."
                    : "💡 해당 페이지의 축제 정보를 추출합니다."
                  }
                </p>
              </div>

              <Button
                onClick={handleExtract}
                disabled={isExtracting || !url.trim()}
                className={`w-full h-12 ${
                  extractionType === 'list'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600'
                    : extractionType === 'multiple'
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                }`}
              >
                {isExtracting ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    추출 중...
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-5 h-5 mr-2" />
                    축제 정보 추출 시작
                  </>
                )}
              </Button>

              {extractionProgress && (
                <div className="bg-gray-800 rounded-lg p-4 text-center">
                  <Loader className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                  <p className="text-white font-medium mb-1">{extractionProgress}</p>
                  <p className="text-gray-400 text-xs">
                    {extractionType === 'list' ? '약 1-2분 소요됩니다' : '약 10-20초 소요됩니다'}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 추출 결과 */}
        {extractionResults && (
          <>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    추출 완료
                  </h3>
                  <p className="text-gray-400 text-sm">
                    총 {extractionResults.festivals_found}개 발견 · {selectedFestivals.length}개 선택됨
                  </p>
                  {extractionResults.reliability_note && (
                    <p className="text-cyan-400 text-xs mt-1 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {extractionResults.reliability_note}
                    </p>
                  )}
                  {extractionResults.extraction_quality && (
                    <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                      {extractionResults.extraction_quality.video_found ? (
                        <p className="text-green-400">
                          ✅ 영상 발견: {extractionResults.extraction_quality.video_validation?.videoId || 'ID 추출 성공'}
                        </p>
                      ) : (
                        <p className="text-gray-500">
                          ℹ️ 영상 없음 {extractionResults.extraction_quality.html_youtube_urls_found > 0 ? `(HTML에서 ${extractionResults.extraction_quality.html_youtube_urls_found}개 URL 발견했으나 유효하지 않음)` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setExtractionResults(null);
                      setSelectedFestivals([]);
                    }}
                    variant="outline"
                    className="border-gray-700 bg-gray-800 text-white hover:bg-gray-700 hover:text-white hover:border-gray-600"
                  >
                    다시 추출
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={selectedFestivals.length === 0 || bulkCreateMutation.isPending}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  >
                    {bulkCreateMutation.isPending ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      `${selectedFestivals.length}개 저장`
                    )}
                  </Button>
                </div>
              </div>

              {extractionResults.errors && extractionResults.errors.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-400/30 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-400 font-bold text-sm mb-1">
                        {extractionResults.errors.length}개 축제는 신뢰도 기준 미달
                      </p>
                      <p className="text-gray-400 text-xs mb-2">
                        다음 축제들은 필수 정보 누락 또는 낮은 신뢰도로 제외되었습니다:
                      </p>
                      <div className="space-y-1">
                        {extractionResults.errors.slice(0, 3).map((err, idx) => (
                          <p key={idx} className="text-gray-500 text-xs">
                            • {err.title || err.url} - {err.error}
                          </p>
                        ))}
                        {extractionResults.errors.length > 3 && (
                          <p className="text-gray-500 text-xs">
                            ... 외 {extractionResults.errors.length - 3}개
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* 추출된 축제 목록 */}
            <div className="space-y-3">
              {extractionResults.festivals.map((festival, idx) => {
                const isSelected = selectedFestivals.includes(idx);
                const confidence = festival._metadata?.confidence || 0;
                const confidenceBadge = getConfidenceBadge(confidence);
                
                // 영상 포함 여부 체크 - 유효성 검증 강화
                const hasValidVideo = festival.video_url && festival.video_url.trim() !== '' && 
                  (festival.video_url.includes('youtube.com/watch?v=') || festival.video_url.includes('youtu.be/'));
                
                const hasValidVideoInMedia = festival.media_urls && festival.media_urls.some(m => 
                  (m.type === 'youtube' || m.type === 'video') && m.url && m.url.trim() !== ''
                );
                
                const hasVideo = hasValidVideo || hasValidVideoInMedia;
                
                // 추가 미디어 개수 (영상 제외, 이미지 타입만 카운트)
                const additionalMediaCount = festival.media_urls?.filter(m => m.type === 'image').length || 0;
                
                // date_status 필드 추가 및 로직 개선
                const dateStatus = festival.date_status || festival._metadata?.date_status || 'confirmed';

                // 추가 정보 카운트
                const additionalInfoCount = [
                  festival.opening_hours && festival.opening_hours.trim() !== '',
                  festival.access_info && festival.access_info.trim() !== '',
                  festival.parking_info && festival.parking_info.trim() !== '',
                  festival.organizer && festival.organizer.trim() !== '',
                  (festival.contact?.phone && festival.contact.phone.trim() !== '') || (festival.contact?.email && festival.contact.email.trim() !== ''),
                  festival.restrictions?.length > 0,
                  festival.recommendations?.length > 0,
                  festival.schedule?.length > 0,
                  festival.nearby_attractions?.length > 0,
                ].filter(Boolean).length;

                return (
                  <Card
                    key={idx}
                    className={`border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-900/30 border-cyan-400'
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    }`}
                    onClick={() => toggleFestival(idx)}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* 체크박스 */}
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'bg-cyan-400 border-cyan-400' : 'border-gray-600'
                          }`}>
                            {isSelected && <Check className="w-4 h-4 text-black" />}
                          </div>
                        </div>

                        {/* 축제 이미지 */}
                        <div className="flex-shrink-0">
                          <img
                            src={festival.thumbnail_url}
                            alt={festival.name}
                            className="w-20 h-20 rounded-lg object-cover"
                            onError={(e) => {
                              e.target.src = `https://picsum.photos/seed/${festival.name || idx}/200/200`;
                              e.target.onerror = null;
                            }}
                          />
                        </div>

                        {/* 축제 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-white font-bold text-lg">{festival.name}</h3>
                            <Badge className={`${confidenceBadge.color} text-white text-xs flex-shrink-0`}>
                              {confidenceBadge.text} {confidenceBadge.percent}%
                            </Badge>
                          </div>

                          {/* 날짜 - date_status 표시 추가 */}
                          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <Calendar className="w-4 h-4 text-cyan-400" />
                            <span>
                              {safeFormatDate(festival.start_date, 'yyyy-MM-dd')} ~ {safeFormatDate(festival.end_date, 'yyyy-MM-dd')}
                            </span>
                            {dateStatus === 'tentative' && (
                              <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                                날짜 미확정
                              </Badge>
                            )}
                            {dateStatus === 'estimated' && (
                              <Badge variant="outline" className="text-xs border-orange-500 text-orange-500">
                                추정
                              </Badge>
                            )}
                          </div>
                          
                          {/* 위치 */}
                          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                            <MapPin className="w-4 h-4 text-pink-500" />
                            <span>{festival.city}, {festival.country}</span>
                          </div>

                          {/* 설명 */}
                          <p className="text-gray-300 text-sm line-clamp-2 mb-2">
                            {festival.description}
                          </p>

                          {/* 카테고리 & 태그 */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            <Badge className="bg-purple-500 text-white text-xs">
                              {festival.category}
                            </Badge>
                            {festival.tags?.slice(0, 3).map((tag, tagIdx) => (
                              <Badge key={tagIdx} variant="outline" className="text-xs border-gray-700 text-gray-400">
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          {/* 미디어 & 추가 정보 표시 */}
                          <div className="flex flex-wrap gap-2 items-center">
                            {hasVideo && (
                              <div className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded-full border border-cyan-400/30">
                                <span>🎬</span>
                                <span className="font-medium">영상</span>
                              </div>
                            )}
                            {additionalMediaCount > 0 && (
                              <div className="flex items-center gap-1 text-xs text-purple-400 bg-purple-900/30 px-2 py-1 rounded-full border border-purple-400/30">
                                <span>📸</span>
                                <span className="font-medium">+{additionalMediaCount}</span>
                              </div>
                            )}
                            {additionalInfoCount > 0 && (
                                <div className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full border border-green-400/30">
                                  <span>ℹ️</span>
                                  <span className="font-medium">+{additionalInfoCount}개 정보</span>
                                </div>
                              )}
                          </div>

                          {/* 메타데이터 */}
                          {festival._metadata && festival._metadata.name_local && (
                            <div className="mt-2 text-xs text-gray-500">
                              원어명: {festival._metadata.name_local}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
