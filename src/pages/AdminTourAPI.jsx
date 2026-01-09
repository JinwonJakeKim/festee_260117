import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Globe, CheckCircle, Loader, MapPin, Calendar, Check, AlertCircle, Database, RefreshCw, Eye, Trash2, Clock, Play, Pause, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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

export default function AdminTourAPI() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("fetch");
  const [areaCode, setAreaCode] = useState("all");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [numOfRows, setNumOfRows] = useState(100);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResults, setFetchResults] = useState(null);
  const [selectedRawData, setSelectedRawData] = useState([]);
  const [isTransforming, setIsTransforming] = useState(false);

  // 최대 변환 개수 제한
  const MAX_TRANSFORM_COUNT = 10;

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

  const { data: rawDataList = [], refetch: refetchRawData } = useQuery({
    queryKey: ['tourApiRawData'],
    queryFn: () => base44.entities.TourApiRawData.list('-created_date', 100),
    initialData: [],
  });

  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        // 스케줄 태스크는 현재 플랫폼 대시보드에서만 관리 가능
        setScheduledTasks([]);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
  }, []);

  const handleFetch = async () => {
    setIsFetching(true);
    
    try {
      console.log('[AdminTourAPI] Calling fetchTourFestivals...');
      const response = await base44.functions.invoke('fetchTourFestivals', {
        areaCode: areaCode === "all" ? null : areaCode,
        year: parseInt(selectedYear),
        month: parseInt(selectedMonth),
        numOfRows: numOfRows
      });

      console.log('[AdminTourAPI] Response:', response.data);

      if (response.data.success) {
        alert(`✅ ${response.data.raw_data_saved}개의 원본 데이터를 저장했습니다.\n- 새로 생성: ${response.data.new_records}개\n- 업데이트: ${response.data.updated_records}개\n\n이제 "원본 데이터 관리" 탭에서 변환 작업을 진행하세요.`);
        setFetchResults(response.data);
        refetchRawData();
        setSelectedTab("manage");
      } else {
        alert(`조회 중 오류가 발생했습니다:\n\n${response.data.message || response.data.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('[AdminTourAPI] Fetch error:', error);
      alert(`조회 중 오류가 발생했습니다:\n\n${error.message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleTransform = async (rawDataIds, isRetransform = false) => {
    if (rawDataIds.length === 0) {
      alert('변환할 데이터를 선택해주세요');
      return;
    }

    // 최대 개수 체크
    if (rawDataIds.length > MAX_TRANSFORM_COUNT) {
      alert(`⚠️ 한 번에 최대 ${MAX_TRANSFORM_COUNT}개까지만 변환할 수 있습니다.\n\n현재 선택: ${rawDataIds.length}개\n\n서버 안정성을 위해 더 작은 단위로 나누어 변환해주세요.`);
      return;
    }

    const actionText = isRetransform ? '재변환' : '변환';
    const warningText = isRetransform 
      ? '\n\n⚠️ 기존 Festival 데이터가 삭제되고 새로 생성됩니다!'
      : '';
    
    const confirmMessage = `${rawDataIds.length}개의 데이터를 Festival로 ${actionText}하시겠습니까?\n\n⏱️ 예상 소요 시간: 약 ${Math.ceil(rawDataIds.length * 30 / 60)}분${warningText}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setIsTransforming(true);
    
    try {
      console.log(`[AdminTourAPI] Calling transformTourApiData (retransform: ${isRetransform})...`);
      const response = await base44.functions.invoke('transformTourApiData', {
        rawDataIds: rawDataIds,
        retransform: isRetransform
      });

      console.log('[AdminTourAPI] Transform response:', response.data);

      if (response.data.success) {
        const message = isRetransform 
          ? `✅ ${response.data.festivals_created}개의 축제가 재변환되었습니다!`
          : `✅ ${response.data.festivals_created}개의 축제가 생성되었습니다!`;
        alert(message);
        refetchRawData();
        queryClient.invalidateQueries({ queryKey: ['festivals'] });
        setSelectedRawData([]);
      } else {
        alert(`${actionText} 중 오류가 발생했습니다:\n\n${response.data.message || response.data.error}`);
      }
    } catch (error) {
      console.error('[AdminTourAPI] Transform error:', error);
      alert(`${actionText} 중 오류가 발생했습니다:\n\n${error.message}`);
    } finally {
      setIsTransforming(false);
    }
  };

  const toggleRawData = (id) => {
    setSelectedRawData(prev => {
      const newSelection = prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id];
      
      // 최대 개수 초과 체크
      if (newSelection.length > MAX_TRANSFORM_COUNT) {
        alert(`⚠️ 최대 ${MAX_TRANSFORM_COUNT}개까지만 선택할 수 있습니다.`);
        return prev;
      }
      
      return newSelection;
    });
  };

  const deleteRawDataMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.TourApiRawData.delete(id);
    },
    onSuccess: () => {
      refetchRawData();
      alert('원본 데이터가 삭제되었습니다');
    },
  });



  const runSyncNowMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('syncTourApiData', {});
      return response.data;
    },
    onSuccess: (data) => {
      refetchRawData();
      alert(`✅ 동기화가 완료되었습니다!\n\n원본 데이터 수집: ${data.summary?.raw_data_fetched || 0}개\nFestival 생성: ${data.summary?.festivals_created || 0}개`);
    },
    onError: (error) => {
      alert(`동기화 실패:\n\n${error.message}`);
    }
  });

  const areaCodes = [
    { value: "all", label: "전체" },
    { value: "1", label: "서울" },
    { value: "2", label: "인천" },
    { value: "3", label: "대전" },
    { value: "4", label: "대구" },
    { value: "5", label: "광주" },
    { value: "6", label: "부산" },
    { value: "7", label: "울산" },
    { value: "8", label: "세종" },
    { value: "31", label: "경기도" },
    { value: "32", label: "강원도" },
    { value: "33", label: "충청북도" },
    { value: "34", label: "충청남도" },
    { value: "35", label: "경상북도" },
    { value: "36", label: "경상남도" },
    { value: "37", label: "전라북도" },
    { value: "38", label: "전라남도" },
    { value: "39", label: "제주도" },
  ];

  const years = [2024, 2025, 2026, 2027].map(y => y.toString());
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `${i + 1}월`
  }));

  const rowOptions = [
    { value: 20, label: "20개" },
    { value: 30, label: "30개" },
    { value: 50, label: "50개" },
    { value: 100, label: "100개 (최대)" },
  ];

  const pendingData = rawDataList.filter(r => r.processing_status === 'pending');
  const processedData = rawDataList.filter(r => r.processing_status === 'processed');
  const failedData = rawDataList.filter(r => r.processing_status === 'failed');

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
            <h1 className="text-xl font-bold text-white">TourAPI 국내 축제 연동</h1>
            <p className="text-gray-400 text-sm">2단계 프로세스: 원본 저장 → 변환</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="w-full bg-gray-900 grid grid-cols-3 mb-6">
            <TabsTrigger value="fetch" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              1. 데이터 가져오기
            </TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              2. 데이터 관리
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              3. 자동화
            </TabsTrigger>
          </TabsList>

          {/* 데이터 가져오기 탭 */}
          <TabsContent value="fetch" className="space-y-4">
            <Card className="bg-gradient-to-r from-green-900/20 to-teal-900/20 border-green-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Globe className="w-5 h-5 text-green-400" />
                1단계: TourAPI에서 원본 데이터 가져오기
              </h3>
              <ul className="text-gray-300 text-sm space-y-1 mb-3">
                <li>✓ API에서 축제 목록을 가져와 원본 그대로 저장</li>
                <li>✓ 데이터 손실 없이 모든 정보 보관</li>
                <li>✓ 언제든지 재처리 가능</li>
              </ul>
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-2 block">지역 선택</label>
                  <Select value={areaCode} onValueChange={setAreaCode}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="전체 지역" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800">
                      {areaCodes.map((area) => (
                        <SelectItem 
                          key={area.value} 
                          value={area.value} 
                          className="text-white hover:bg-gray-800 focus:bg-gray-800"
                        >
                          {area.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">년도</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-800">
                        {years.map((year) => (
                          <SelectItem key={year} value={year} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                            {year}년
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">월</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-800">
                        {months.map((month) => (
                          <SelectItem key={month.value} value={month.value} className="text-white hover:bg-gray-800 focus:bg-gray-800">
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-sm mb-2 block">가져올 개수</label>
                  <Select value={numOfRows.toString()} onValueChange={(value) => setNumOfRows(parseInt(value))}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800">
                      {rowOptions.map((option) => (
                        <SelectItem 
                          key={option.value} 
                          value={option.value.toString()} 
                          className="text-white hover:bg-gray-800 focus:bg-gray-800"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-gray-500 text-xs mt-1">
                    💡 최대 100개까지 한 번에 가져올 수 있습니다
                  </p>
                </div>

                <Button
                  onClick={handleFetch}
                  disabled={isFetching}
                  className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 h-12"
                >
                  {isFetching ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />
                      원본 데이터 가져오는 중...
                    </>
                  ) : (
                    <>
                      <Database className="w-5 h-5 mr-2" />
                      1단계: 원본 데이터 가져오기
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* 원본 데이터 관리 탭 */}
          <TabsContent value="manage" className="space-y-4">
            <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-purple-400" />
                2단계: 원본 데이터를 Festival로 변환
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 저장된 원본 데이터를 Festival 엔티티로 변환</li>
                <li>✓ 이미 변환된 데이터도 재변환 가능 (기존 데이터 삭제 후 재생성)</li>
                <li>✓ 실패한 데이터는 언제든지 재처리 가능</li>
                <li>✓ 원본 데이터는 보관되므로 안전</li>
                <li className="text-yellow-400 font-medium">⚠️ 한 번에 최대 {MAX_TRANSFORM_COUNT}개까지만 변환 가능</li>
              </ul>
            </Card>

            {/* 통계 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-yellow-900/20 border-yellow-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{pendingData.length}</div>
                  <div className="text-xs text-gray-400">대기 중</div>
                </div>
              </Card>
              <Card className="bg-green-900/20 border-green-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{processedData.length}</div>
                  <div className="text-xs text-gray-400">완료</div>
                </div>
              </Card>
              <Card className="bg-red-900/20 border-red-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{failedData.length}</div>
                  <div className="text-xs text-gray-400">실패</div>
                </div>
              </Card>
            </div>

            {/* 액션 버튼 - 개선된 버전 */}
            <div className="space-y-2">
              {pendingData.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const allPendingIds = pendingData.slice(0, MAX_TRANSFORM_COUNT).map(r => r.id);
                      setSelectedRawData(allPendingIds);
                      if (pendingData.length > MAX_TRANSFORM_COUNT) {
                        alert(`⚠️ 대기 중인 데이터가 ${pendingData.length}개 있지만, 서버 안정성을 위해 최대 ${MAX_TRANSFORM_COUNT}개만 선택되었습니다.`);
                      }
                    }}
                    variant="outline"
                    className="flex-1 border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
                  >
                    대기 중 {Math.min(pendingData.length, MAX_TRANSFORM_COUNT)}개 선택
                  </Button>
                  <Button
                    onClick={() => handleTransform(selectedRawData, false)}
                    disabled={selectedRawData.length === 0 || isTransforming}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    {isTransforming ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        변환 중...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {selectedRawData.length}개 변환하기 (최초생성)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* 재변환 버튼 - 새로 추가 */}
              {([...processedData, ...failedData].length > 0) && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const reprocessableData = [...processedData, ...failedData].slice(0, MAX_TRANSFORM_COUNT);
                      setSelectedRawData(reprocessableData.map(r => r.id));
                      if (processedData.length + failedData.length > MAX_TRANSFORM_COUNT) {
                        alert(`⚠️ 재처리 가능한 데이터가 ${processedData.length + failedData.length}개 있지만, 최대 ${MAX_TRANSFORM_COUNT}개만 선택되었습니다.`);
                      }
                    }}
                    variant="outline"
                    className="flex-1 border-orange-600 bg-orange-900/20 text-orange-400 hover:bg-orange-900/40"
                  >
                    완료/실패 {Math.min(processedData.length + failedData.length, MAX_TRANSFORM_COUNT)}개 선택
                  </Button>
                  <Button
                    onClick={() => handleTransform(selectedRawData, true)}
                    disabled={selectedRawData.length === 0 || isTransforming}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    {isTransforming ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        재변환 중...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {selectedRawData.length}개 재변환하기 (Update)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* 선택 개수 경고 */}
            {selectedRawData.length > 0 && (
              <Card className={`p-3 ${
                selectedRawData.length > MAX_TRANSFORM_COUNT 
                  ? 'bg-red-900/20 border-red-400/30' 
                  : 'bg-blue-900/20 border-blue-400/30'
              }`}>
                <p className={`text-sm text-center ${
                  selectedRawData.length > MAX_TRANSFORM_COUNT ? 'text-red-400' : 'text-blue-400'
                }`}>
                  {selectedRawData.length > MAX_TRANSFORM_COUNT 
                    ? `⚠️ ${selectedRawData.length}개 선택됨 - 최대 ${MAX_TRANSFORM_COUNT}개까지만 가능합니다.`
                    : `✓ ${selectedRawData.length}개 선택됨 (예상 소요시간: 약 ${Math.ceil(selectedRawData.length * 30 / 60)}초)`
                  }
                </p>
              </Card>
            )}

            {/* 원본 데이터 목록 */}
            <div className="space-y-3">
              {rawDataList.map((raw) => {
                const isSelected = selectedRawData.includes(raw.id);
                const statusColors = {
                  pending: 'bg-yellow-900/20 border-yellow-500/50',
                  processing: 'bg-blue-900/20 border-blue-500/50',
                  processed: 'bg-green-900/20 border-green-500/50',
                  failed: 'bg-red-900/20 border-red-500/50',
                };
                const statusLabels = {
                  pending: '대기 중',
                  processing: '처리 중',
                  processed: '완료',
                  failed: '실패',
                };
                
                return (
                  <Card
                    key={raw.id}
                    className={`border-2 transition-all ${
                      isSelected
                        ? 'bg-purple-900/30 border-purple-400'
                        : statusColors[raw.processing_status] || 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* 체크박스 - 모든 상태에서 표시 */}
                        <div className="flex-shrink-0 mt-1">
                          <div 
                            onClick={() => toggleRawData(raw.id)}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center cursor-pointer ${
                              isSelected ? 'bg-purple-400 border-purple-400' : 'border-gray-600 hover:border-gray-500'
                            }`}
                          >
                            {isSelected && <Check className="w-4 h-4 text-black" />}
                          </div>
                        </div>

                        {/* 이미지 */}
                        {raw.firstimage && (
                          <div className="flex-shrink-0">
                            <img
                              src={raw.firstimage}
                              alt={raw.title}
                              className="w-20 h-20 rounded-lg object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        )}

                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-white font-bold text-base">{raw.title}</h3>
                            <Badge className={statusColors[raw.processing_status]}>
                              {statusLabels[raw.processing_status]}
                            </Badge>
                          </div>

                          <div className="text-gray-400 text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-green-400" />
                              <span>
                                {raw.eventstartdate ? 
                                  `${raw.eventstartdate.substring(0,4)}-${raw.eventstartdate.substring(4,6)}-${raw.eventstartdate.substring(6,8)}` : 
                                  '시작일 없음'
                                } ~ {raw.eventenddate ? 
                                  `${raw.eventenddate.substring(0,4)}-${raw.eventenddate.substring(4,6)}-${raw.eventenddate.substring(6,8)}` : 
                                  '종료일 없음'
                                }
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-teal-400" />
                              <span>{raw.addr1 || '주소 없음'}</span>
                            </div>

                            <p className="text-xs text-gray-500">
                              ContentID: {raw.contentid} · 수집: {safeFormatDate(raw.fetch_date || raw.created_date, 'yy-MM-dd HH:mm')}
                            </p>

                            {raw.processing_status === 'failed' && raw.error_message && (
                              <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded">
                                <p className="text-red-400 text-xs">
                                  <AlertCircle className="w-3 h-3 inline mr-1" />
                                  {raw.error_message}
                                </p>
                              </div>
                            )}

                            {raw.processing_status === 'processed' && raw.festival_id && (
                              <div className="mt-2">
                                <Badge variant="outline" className="text-green-400 border-green-400">
                                  ✓ Festival ID: {raw.festival_id}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex flex-col gap-2">
                          {/* 개별 재변환 버튼 (processed나 failed인 경우) */}
                          {(raw.processing_status === 'processed' || raw.processing_status === 'failed') && (
                            <Button
                              onClick={() => handleTransform([raw.id], true)}
                              disabled={isTransforming}
                              size="sm"
                              className="bg-orange-500 hover:bg-orange-600 text-white"
                              title="이 항목만 재변환"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                          
                          {/* 삭제 버튼 */}
                          <Button
                            onClick={() => {
                              if (confirm('이 원본 데이터를 삭제하시겠습니까?')) {
                                deleteRawDataMutation.mutate(raw.id);
                              }
                            }}
                            size="sm"
                            variant="outline"
                            className="border-gray-700 text-red-400 hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {rawDataList.length === 0 && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">저장된 원본 데이터가 없습니다</p>
                  <p className="text-gray-600 text-sm">먼저 "데이터 가져오기" 탭에서 데이터를 가져오세요</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* 자동화 스케줄 탭 */}
          <TabsContent value="schedule" className="space-y-4">
            <Card className="bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border-indigo-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                3단계: 자동화 실행
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 모든 지역의 TourAPI 데이터를 자동 수집</li>
                <li>✓ 각 지역별로 5분 간격으로 순차적 수집</li>
                <li>✓ 수집 완료 후 대기 중인 데이터를 10개씩 자동 변환</li>
                <li>✓ 현재 월과 다음 월 데이터를 모두 수집</li>
              </ul>
            </Card>

            {/* 전체 동기화 실행 */}
            <Card className="bg-gray-900 border-gray-800 p-4">
              <h4 className="text-white font-bold mb-2">전체 동기화 실행</h4>
              <p className="text-gray-400 text-sm mb-4">
                모든 지역의 TourAPI 데이터를 수집하고 Festival로 자동 변환합니다.<br />
                <span className="text-yellow-400">⏱️ 예상 소요 시간: 약 2-3시간</span>
              </p>
              <Button
                onClick={() => runSyncNowMutation.mutate()}
                disabled={runSyncNowMutation.isPending}
                className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 h-12"
              >
                {runSyncNowMutation.isPending ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    전체 동기화 실행 중... (백그라운드에서 실행됩니다)
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    전체 동기화 지금 실행
                  </>
                )}
              </Button>
            </Card>

            {/* 스케줄링 안내 */}
            <Card className="bg-blue-900/20 border-blue-400/30 p-4">
              <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                자동 스케줄링 설정 방법
              </h4>
              <div className="text-gray-300 text-sm space-y-2">
                <p>매월 자동으로 데이터를 수집하려면 Base44 대시보드에서 스케줄 태스크를 생성하세요:</p>
                <div className="bg-black/30 p-3 rounded-lg mt-2">
                  <p className="text-cyan-400 font-mono text-xs mb-2">설정 정보:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• <span className="text-gray-400">함수명:</span> <span className="text-white">syncTourApiData</span></li>
                    <li>• <span className="text-gray-400">실행 주기:</span> <span className="text-white">매월 1일 00:00</span></li>
                    <li>• <span className="text-gray-400">타입:</span> <span className="text-white">Simple (Monthly)</span></li>
                  </ul>
                </div>
                <p className="text-yellow-400 mt-2">
                  💡 Base44 대시보드 → Code → Scheduled Tasks에서 설정할 수 있습니다.
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}