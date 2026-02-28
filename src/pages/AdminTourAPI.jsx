import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Globe, CheckCircle, CheckCircle2, Loader, MapPin, Calendar, Check, AlertCircle, Database, RefreshCw, Eye, Trash2, Clock, Play, Pause, Power, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");

  // 최대 변환 개수 제한 제거 (자동화 모드)
  const MAX_TRANSFORM_COUNT = 999;

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

  const { data: scheduledTasksData, isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['scheduledTasks'],
    queryFn: async () => {
      const response = await base44.functions.invoke('listScheduledTasks', {});
      return response.data;
    },
    initialData: { success: true, tasks: [] },
  });

  const scheduledTasks = scheduledTasksData?.tasks || [];

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

    const actionText = isRetransform ? '재변환' : '변환';
    const warningText = isRetransform 
      ? '\n\n⚠️ 기존 Festival 데이터가 삭제되고 새로 생성됩니다!'
      : '';
    
    const confirmMessage = `${rawDataIds.length}개의 데이터를 변환 대기열에 추가하고 지금 바로 시작하시겠습니까?${warningText}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      // 선택된 레코드들의 processing_status를 pending으로 업데이트
      for (const id of rawDataIds) {
        await base44.entities.TourApiRawData.update(id, {
          processing_status: 'pending',
          error_message: ''
        });
      }
      
      setSelectedRawData([]);
      refetchRawData();
      
      // 대기열 추가 후 바로 변환 시작
      setTimeout(() => {
        startTransformNowMutation.mutate();
      }, 500);
      
    } catch (error) {
      console.error('[AdminTourAPI] Status update error:', error);
      alert(`상태 업데이트 중 오류가 발생했습니다:\n\n${error.message}`);
    }
  };

  const toggleRawData = (id) => {
    setSelectedRawData(prev => {
      const newSelection = prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id];
      
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.TourApiRawData.delete(id);
      }
    },
    onSuccess: (_, ids) => {
      refetchRawData();
      setSelectedRawData([]);
      alert(`${ids.length}개의 원본 데이터가 삭제되었습니다`);
    },
  });

  const stopProcessingMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.TourApiRawData.update(id, {
        processing_status: 'failed',
        error_message: '관리자에 의해 수동으로 중단됨'
      });
    },
    onSuccess: () => {
      refetchRawData();
      alert('처리가 중단되었습니다. 다른 대기 중인 축제가 곧 처리됩니다.');
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

    const startTransformNowMutation = useMutation({
      mutationFn: async () => {
        const response = await base44.functions.invoke('autoTransformPendingData', {});
        return response.data;
      },
      onSuccess: (data) => {
        refetchRawData();
        alert(`✅ 변환이 시작되었습니다!\n\n처리된 축제: ${data.processed || 0}개`);
      },
      onError: (error) => {
        alert(`변환 실패:\n\n${error.message}`);
      }
    });

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      alert('⚠️ 스케줄 생성 기능은 시스템 제약으로 인해 현재 사용할 수 없습니다.\n\n관리자가 직접 스케줄을 생성해드렸습니다.');
      throw new Error('Not supported');
    },
    onSuccess: () => {
      refetchTasks();
    },
    onError: (error) => {
      refetchTasks();
    }
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: async (taskId) => {
      const response = await base44.functions.invoke('toggleScheduledTask', { taskId });
      return response.data;
    },
    onSuccess: () => {
      refetchTasks();
    },
    onError: (error) => {
      alert(`상태 변경 실패:\n\n${error.message}`);
    }
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (taskId) => {
      const response = await base44.functions.invoke('deleteScheduledTask', { taskId });
      return response.data;
    },
    onSuccess: () => {
      refetchTasks();
      alert('스케줄이 삭제되었습니다');
    },
    onError: (error) => {
      alert(`스케줄 삭제 실패:\n\n${error.message}`);
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

  // 검색 및 월 필터링
  const filteredRawDataList = rawDataList.filter(raw => {
    // 검색 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        raw.title?.toLowerCase().includes(query) ||
        raw.addr1?.toLowerCase().includes(query) ||
        raw.contentid?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }
    
    // 월 필터
    if (filterMonth !== "all") {
      const startDate = raw.eventstartdate;
      if (!startDate || startDate.length < 6) return false;
      const month = startDate.substring(4, 6);
      if (month !== filterMonth.padStart(2, '0')) return false;
    }
    
    return true;
  });

  const pendingData = filteredRawDataList.filter(r => r.processing_status === 'pending');
  const processingData = filteredRawDataList.filter(r => r.processing_status === 'processing');
  const processedData = filteredRawDataList.filter(r => r.processing_status === 'processed');
  const failedData = filteredRawDataList.filter(r => r.processing_status === 'failed');

  // 신규 축제 데이터 - festival_id가 없는 모든 데이터 (필터 적용)
  const newFestivalData = filteredRawDataList.filter(r => !r.festival_id);
  
  // 기존 축제 데이터 - festival_id가 있는 모든 데이터 (필터 적용)
  const existingFestivalData = filteredRawDataList.filter(r => r.festival_id);

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
              축제정보가져오기
            </TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              RawData 변환
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
                2단계: 원본 데이터를 Festival로 변환 (자동화)
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 변환 버튼 클릭 시 대기열에 추가되며, 자동화가 백그라운드에서 처리</li>
                <li>✓ 5분마다 최대 10개씩 자동 변환 (타임아웃 없음)</li>
                <li>✓ 변환 완료까지 페이지를 닫아도 됩니다</li>
                <li>✓ 실패한 데이터는 자동으로 재시도 가능</li>
                <li className="text-cyan-400 font-medium">💡 원하는 만큼 선택 가능 - 자동으로 순차 처리됩니다</li>
              </ul>
            </Card>

            {/* 백그라운드 변환 진행 중 알림 배너 */}
            {processingData.length > 0 && (
              <Card className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-400/50 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Loader className="w-6 h-6 text-blue-400 animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-blue-400 font-bold mb-1">
                      백그라운드 변환 진행 중
                    </h3>
                    <p className="text-gray-300 text-sm">
                      현재 {processingData.length}개의 축제가 자동으로 변환되고 있습니다. 
                      처리가 너무 오래 걸리면 아래에서 중단할 수 있습니다.
                    </p>
                  </div>
                  <Button
                    onClick={() => refetchRawData()}
                    size="sm"
                    variant="outline"
                    className="border-blue-400 text-blue-400 hover:bg-blue-900/20 flex-shrink-0"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    새로고침
                  </Button>
                </div>

                {/* 처리 중인 축제 목록 */}
                <div className="space-y-2">
                  {processingData.map((raw) => (
                    <div key={raw.id} className="flex items-center justify-between bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                      <div className="flex items-center gap-3 flex-1">
                        <Loader className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium text-sm truncate">{raw.title}</h4>
                          <p className="text-gray-400 text-xs">
                            시작: {safeFormatDate(raw.updated_date, 'HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          if (confirm(`"${raw.title}" 처리를 중단하시겠습니까?\n\n다음 대기 중인 축제가 처리됩니다.`)) {
                            stopProcessingMutation.mutate(raw.id);
                          }
                        }}
                        size="sm"
                        className="bg-red-900/30 border border-red-500 text-red-400 hover:bg-red-900/50 hover:border-red-400 flex-shrink-0"
                        disabled={stopProcessingMutation.isPending}
                      >
                        {stopProcessingMutation.isPending ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          '중단'
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 통계 카드 */}
            <div className="grid grid-cols-4 gap-3">
              <Card className="bg-yellow-900/20 border-yellow-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{pendingData.length}</div>
                  <div className="text-xs text-gray-400">대기 중</div>
                </div>
              </Card>
              <Card className="bg-blue-900/20 border-blue-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 flex items-center justify-center gap-1">
                    {processingData.length}
                    {processingData.length > 0 && <Loader className="w-4 h-4 animate-spin" />}
                  </div>
                  <div className="text-xs text-gray-400">처리 중</div>
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

            {/* 검색 및 필터 */}
            <div className="flex gap-3">
              <Input
                type="text"
                placeholder="축제명, 주소, ContentID로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
              />
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-32 bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="월 선택" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">
                    전체 월
                  </SelectItem>
                  {months.map((month) => (
                    <SelectItem 
                      key={month.value} 
                      value={month.value} 
                      className="text-white hover:bg-gray-800 focus:bg-gray-800"
                    >
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => refetchRawData()}
                variant="outline"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/20"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* 필터 결과 표시 및 선택 버튼 */}
            <div className="flex items-center justify-between gap-3">
              {(searchQuery || filterMonth !== "all") && (
                <p className="text-gray-400 text-sm">
                  {searchQuery && `"${searchQuery}" 검색 결과`}
                  {searchQuery && filterMonth !== "all" && " · "}
                  {filterMonth !== "all" && `${months.find(m => m.value === filterMonth)?.label}`}
                  : {filteredRawDataList.length}개
                </p>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                   onClick={() => {
                     const allFilteredIds = filteredRawDataList.map(r => r.id);
                     setSelectedRawData(allFilteredIds);
                   }}
                   size="sm"
                   className="bg-gray-800 border border-cyan-500/50 text-cyan-400 hover:bg-gray-700 hover:border-cyan-400 text-xs"
                 >
                   {searchQuery ? '검색 결과 전체 선택' : '전체 선택'} ({filteredRawDataList.length}개)
                 </Button>
                <Button
                   onClick={() => setSelectedRawData([])}
                   size="sm"
                   className="bg-gray-800 border border-cyan-500/50 text-cyan-400 hover:bg-gray-700 hover:border-cyan-400"
                   disabled={selectedRawData.length === 0}
                 >
                   선택 해제
                 </Button>
                <Button
                   onClick={() => {
                     if (selectedRawData.length === 0) {
                       alert('삭제할 데이터를 선택해주세요');
                       return;
                     }
                     if (confirm(`선택한 ${selectedRawData.length}개의 원본 데이터를 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
                       bulkDeleteMutation.mutate(selectedRawData);
                     }
                   }}
                   size="sm"
                   className="bg-gray-800 border border-red-500/50 text-red-400 hover:bg-gray-700 hover:border-red-400"
                   disabled={selectedRawData.length === 0 || bulkDeleteMutation.isPending}
                 >
                   {bulkDeleteMutation.isPending ? (
                     <>
                       <Loader className="w-4 h-4 mr-1 animate-spin" />
                       삭제 중...
                     </>
                   ) : (
                     <>
                       <Trash2 className="w-4 h-4 mr-1" />
                       일괄 삭제 ({selectedRawData.length})
                     </>
                   )}
                 </Button>
              </div>
            </div>

            {/* 신규 변환 섹션 - 항상 표시 */}
            <div className="space-y-3 border border-purple-800/50 rounded-lg p-4 bg-purple-900/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-purple-400 font-bold flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    신규 축제 ({newFestivalData.length}개)
                  </h3>
                  <p className="text-gray-400 text-xs mt-1">Festival 엔티티에 없는 새로운 데이터</p>
                </div>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => {
                      const pendingNewIds = newFestivalData.filter(r => r.processing_status !== 'processed').map(r => r.id);
                      setSelectedRawData(prev => [...new Set([...prev, ...pendingNewIds])]);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-yellow-600 bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                  >
                    대기중 선택 ({newFestivalData.filter(r => r.processing_status !== 'processed').length}개)
                </Button>
                <Button
                  onClick={() => {
                    const allNewIds = newFestivalData.map(r => r.id);
                    setSelectedRawData(prev => [...new Set([...prev, ...allNewIds])]);
                  }}
                  variant="outline"
                  size="sm"
                  className="border-purple-600 bg-purple-900/20 text-purple-400 hover:bg-purple-900/40"
                >
                  전체 선택 ({newFestivalData.length}개)
                </Button>
                <Button
                  onClick={() => {
                    const newFestivalIds = selectedRawData.filter(id => newFestivalData.some(r => r.id === id));
                    if (newFestivalIds.length === 0) {
                      alert('⚠️ 신규 축제 영역에서 선택된 항목이 없습니다.');
                      return;
                    }
                    handleTransform(newFestivalIds, false);
                  }}
                  disabled={selectedRawData.filter(id => newFestivalData.some(r => r.id === id)).length === 0}
                  size="sm"
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  변환 ({selectedRawData.filter(id => newFestivalData.some(r => r.id === id)).length}개)
                </Button>
                <Button
                  onClick={async () => {
                    const newFestivalIds = selectedRawData.filter(id => newFestivalData.some(r => r.id === id));
                    if (newFestivalIds.length === 0) {
                      alert('⚠️ 신규 축제 영역에서 선택된 항목이 없습니다.');
                      return;
                    }
                    if (!confirm(`선택한 ${newFestivalIds.length}개를 완료 처리하시겠습니까?`)) return;
                    for (const id of newFestivalIds) {
                      await base44.entities.TourApiRawData.update(id, { processing_status: 'processed', error_message: '' });
                    }
                    setSelectedRawData(prev => prev.filter(id => !newFestivalIds.includes(id)));
                    refetchRawData();
                    alert(`${newFestivalIds.length}개 완료 처리되었습니다.`);
                  }}
                  disabled={selectedRawData.filter(id => newFestivalData.some(r => r.id === id)).length === 0}
                  size="sm"
                  variant="outline"
                  className="border-green-600 text-green-400 hover:bg-green-900/20"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  완료처리 ({selectedRawData.filter(id => newFestivalData.some(r => r.id === id)).length}개)
                </Button>
              </div>

              {newFestivalData.length > 0 ? (
                <div className="space-y-3 mt-4">
                  {newFestivalData.map((raw) => {
                    const isSelected = selectedRawData.includes(raw.id);
                  return (
                    <Card
                      key={raw.id}
                      className={`border-2 transition-all ${
                        isSelected
                          ? 'bg-purple-900/30 border-purple-400'
                          : 'bg-yellow-900/20 border-yellow-500/50'
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {/* 체크박스 */}
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
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold text-base">{raw.title}</h3>
                              {raw.processing_status === 'processing' ? (
                                <Badge className="bg-blue-900/20 border-blue-500/50 flex items-center gap-1">
                                  <Loader className="w-3 h-3 animate-spin" />
                                  처리 중
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-900/20 border-yellow-500/50">대기 중</Badge>
                              )}
                              <Badge className="bg-purple-900/50 text-purple-400 border border-purple-400/50">
                                신규 축제
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
                            </div>
                          </div>

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
                    </Card>
                  );
                })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">신규 축제 데이터가 없습니다.</p>
              )}
            </div>

            {/* 재변환 섹션 - 데이터가 있을 때만 표시 */}
            {existingFestivalData.length > 0 && (
              <div className="space-y-3 border border-orange-800/50 rounded-lg p-4 bg-orange-900/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-orange-400 font-bold flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      기존 축제 ({existingFestivalData.length}개)
                    </h3>
                    <p className="text-gray-400 text-xs mt-1">Festival 엔티티에 이미 존재하는 축제 (재변환 가능)</p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => {
                      const pendingExistingIds = existingFestivalData.filter(r => r.processing_status === 'pending').map(r => r.id);
                      setSelectedRawData(prev => [...new Set([...prev, ...pendingExistingIds])]);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-yellow-600 bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                  >
                    대기중 선택 ({existingFestivalData.filter(r => r.processing_status === 'pending').length}개)
                  </Button>
                  <Button
                    onClick={() => {
                      const allExistingIds = existingFestivalData.map(r => r.id);
                      setSelectedRawData(prev => [...new Set([...prev, ...allExistingIds])]);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-orange-600 bg-orange-900/20 text-orange-400 hover:bg-orange-900/40"
                  >
                    전체 선택 ({existingFestivalData.length}개)
                  </Button>
                  <Button
                    onClick={() => {
                      const updateFestivalIds = selectedRawData.filter(id => existingFestivalData.some(r => r.id === id));
                      if (updateFestivalIds.length === 0) {
                        alert('⚠️ 기존 축제 영역에서 선택된 항목이 없습니다.');
                        return;
                      }
                      handleTransform(updateFestivalIds, true);
                    }}
                    disabled={selectedRawData.filter(id => existingFestivalData.some(r => r.id === id)).length === 0}
                    size="sm"
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    변환 ({selectedRawData.filter(id => existingFestivalData.some(r => r.id === id)).length}개)
                  </Button>
                  <Button
                    onClick={async () => {
                      const existingIds = selectedRawData.filter(id => existingFestivalData.some(r => r.id === id));
                      if (existingIds.length === 0) {
                        alert('⚠️ 기존 축제 영역에서 선택된 항목이 없습니다.');
                        return;
                      }
                      if (!confirm(`선택한 ${existingIds.length}개를 완료 처리하시겠습니까?`)) return;
                      for (const id of existingIds) {
                        await base44.entities.TourApiRawData.update(id, { processing_status: 'processed', error_message: '' });
                      }
                      setSelectedRawData(prev => prev.filter(id => !existingIds.includes(id)));
                      refetchRawData();
                      alert(`${existingIds.length}개 완료 처리되었습니다.`);
                    }}
                    disabled={selectedRawData.filter(id => existingFestivalData.some(r => r.id === id)).length === 0}
                    size="sm"
                    variant="outline"
                    className="border-green-600 text-green-400 hover:bg-green-900/20"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    완료처리 ({selectedRawData.filter(id => existingFestivalData.some(r => r.id === id)).length}개)
                  </Button>
                </div>

                <div className="space-y-3 mt-4">
                  {existingFestivalData.map((raw) => {
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
                  const statusIcons = {
                    processing: <Loader className="w-3 h-3 animate-spin" />,
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
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-white font-bold text-base">{raw.title}</h3>
                            <Badge className={statusColors[raw.processing_status] + " flex items-center gap-1"}>
                              {statusIcons[raw.processing_status]}
                              {statusLabels[raw.processing_status]}
                            </Badge>
                            <Badge className="bg-blue-900/50 text-blue-400 border border-blue-400/50">
                              기존 축제
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
                          {/* 개별 재변환 버튼 */}
                          <Button
                            onClick={() => handleTransform([raw.id], true)}
                            size="sm"
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                            title="대기열에 추가"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          
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
                </div>
              </div>
            )}

            {/* 선택 개수 안내 */}
            {selectedRawData.length > 0 && (
              <Card className="p-3 bg-blue-900/20 border-blue-400/30">
                <p className="text-sm text-center text-blue-400">
                  ✓ {selectedRawData.length}개 선택됨 (자동화가 백그라운드에서 처리합니다)
                </p>
              </Card>
            )}

            {/* 데이터가 없을 때 표시 */}
            {newFestivalData.length === 0 && existingFestivalData.length === 0 && filteredRawDataList.length > 0 && searchQuery && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">검색 결과가 없습니다</p>
                  <p className="text-gray-600 text-sm">다른 검색어를 시도해보세요</p>
                </Card>
              )}

              {rawDataList.length === 0 && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">저장된 원본 데이터가 없습니다</p>
                  <p className="text-gray-600 text-sm">먼저 "데이터 가져오기" 탭에서 데이터를 가져오세요</p>
                </Card>
              )}
          </TabsContent>

          {/* 자동화 스케줄 탭 */}
          <TabsContent value="schedule" className="space-y-4">
            <Card className="bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border-indigo-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                3단계: 자동화 관리
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 매월 1일 00:00에 모든 지역의 TourAPI 데이터를 자동 수집</li>
                <li>✓ 각 지역별로 5분 간격으로 순차적 수집 (서버 부하 관리)</li>
                <li>✓ 수집 완료 후 대기 중인 데이터를 10개씩 자동 변환</li>
                <li>✓ 현재 월과 다음 월 데이터를 모두 수집</li>
              </ul>
            </Card>

            {isLoadingTasks ? (
              <Card className="bg-gray-900 border-gray-800 p-8 text-center">
                <Loader className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400">스케줄 정보 로딩 중...</p>
              </Card>
            ) : scheduledTasks.length === 0 ? (
              /* 스케줄이 없을 때 */
              <Card className="bg-gray-900 border-gray-800 p-6">
                <div className="text-center mb-6">
                  <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h4 className="text-white font-bold mb-2">자동화 스케줄이 설정되지 않았습니다</h4>
                  <p className="text-gray-400 text-sm mb-4">
                    매월 자동으로 TourAPI 데이터를 수집하고 Festival로 변환하는 스케줄을 생성하세요.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={() => createScheduleMutation.mutate()}
                    disabled={createScheduleMutation.isPending}
                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 h-12"
                  >
                    {createScheduleMutation.isPending ? (
                      <>
                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                        스케줄 생성 중...
                      </>
                    ) : (
                      <>
                        <Clock className="w-5 h-5 mr-2" />
                        자동화 스케줄 생성 (매월 1일 00:00)
                      </>
                    )}
                  </Button>

                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-gray-400 text-sm mb-2">또는 수동으로 지금 실행:</p>
                    <Button
                      onClick={() => runSyncNowMutation.mutate()}
                      disabled={runSyncNowMutation.isPending}
                      variant="outline"
                      className="w-full border-gray-700 text-white hover:bg-gray-800"
                    >
                      {runSyncNowMutation.isPending ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          실행 중...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          전체 동기화 지금 실행
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              /* 스케줄이 있을 때 */
              <>
                {scheduledTasks.map((task) => (
                  <Card key={task.id} className={`border-2 ${
                    task.is_active 
                      ? 'bg-green-900/10 border-green-500/50' 
                      : 'bg-gray-900 border-gray-700'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-white font-bold text-lg">{task.name}</h4>
                            <Badge className={task.is_active 
                              ? 'bg-green-500 text-white' 
                              : 'bg-gray-600 text-gray-300'
                            }>
                              {task.is_active ? '활성' : '비활성'}
                            </Badge>
                          </div>
                          <p className="text-gray-400 text-sm mb-3">{task.description}</p>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-indigo-400" />
                              <span className="text-gray-300">실행 주기: <strong className="text-white">매월 1일 00:00</strong></span>
                            </div>
                            
                            {task.last_run_at && (
                              <div className="flex items-center gap-2 text-sm">
                                <CheckCircle className="w-4 h-4 text-cyan-400" />
                                <span className="text-gray-400">마지막 실행: {safeFormatDate(task.last_run_at, 'yyyy-MM-dd HH:mm')}</span>
                              </div>
                            )}
                            
                            {task.next_run_at && task.is_active && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-4 h-4 text-yellow-400" />
                                <span className="text-gray-300">다음 실행: <strong className="text-yellow-400">{safeFormatDate(task.next_run_at, 'yyyy-MM-dd HH:mm')}</strong></span>
                              </div>
                            )}

                            {!task.is_active && (
                              <div className="flex items-center gap-2 text-sm">
                                <AlertCircle className="w-4 h-4 text-orange-400" />
                                <span className="text-orange-400">스케줄이 비활성화되어 자동 실행되지 않습니다</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => runSyncNowMutation.mutate()}
                          disabled={runSyncNowMutation.isPending}
                          className="flex-1 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                        >
                          {runSyncNowMutation.isPending ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              실행 중...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              지금 실행
                            </>
                          )}
                        </Button>
                        
                        <Button
                          onClick={() => toggleScheduleMutation.mutate(task.id)}
                          disabled={toggleScheduleMutation.isPending}
                          variant="outline"
                          className={task.is_active 
                            ? "border-orange-600 text-orange-400 hover:bg-orange-900/20" 
                            : "border-green-600 text-green-400 hover:bg-green-900/20"
                          }
                        >
                          {toggleScheduleMutation.isPending ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : task.is_active ? (
                            <>
                              <Pause className="w-4 h-4 mr-2" />
                              비활성화
                            </>
                          ) : (
                            <>
                              <Power className="w-4 h-4 mr-2" />
                              활성화
                            </>
                          )}
                        </Button>
                        
                        <Button
                          onClick={() => {
                            if (confirm('이 자동화 스케줄을 삭제하시겠습니까?')) {
                              deleteScheduleMutation.mutate(task.id);
                            }
                          }}
                          disabled={deleteScheduleMutation.isPending}
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-900/20"
                        >
                          {deleteScheduleMutation.isPending ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}

                {/* 추가 스케줄 생성 버튼 */}
                <Button
                  onClick={() => createScheduleMutation.mutate()}
                  disabled={createScheduleMutation.isPending}
                  variant="outline"
                  className="w-full border-gray-700 text-gray-400 hover:bg-gray-800"
                >
                  {createScheduleMutation.isPending ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      추가 스케줄 생성
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}