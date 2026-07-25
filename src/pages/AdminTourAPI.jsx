import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Globe, Loader, MapPin, Calendar, Database, RefreshCw, Trash2, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 공통 RawData 카드 컴포넌트
function RawDataCard({ raw, onDelete, onTransform, selected, onToggleSelect, isTransforming }) {
  const isNew = !raw.festival_id;
  const statusColors = {
    pending: 'bg-yellow-900/20 border-yellow-500/50',
    processing: 'bg-blue-900/20 border-blue-500/50',
    processed: 'bg-green-900/20 border-green-500/50',
    failed: 'bg-red-900/20 border-red-500/50',
  };
  const statusLabels = { pending: '대기 중', processing: '처리 중', processed: '완료', failed: '실패' };

  return (
    <Card className={`border-2 transition-all ${statusColors[raw.processing_status] || 'bg-gray-900 border-gray-800'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* 선택 체크박스 */}
          <button onClick={onToggleSelect} className="flex-shrink-0 mt-1">
            {selected ? (
              <CheckSquare className="w-6 h-6 text-cyan-400" />
            ) : (
              <Square className="w-6 h-6 text-gray-600" />
            )}
          </button>
          {raw.firstimage && (
            <img src={raw.firstimage} alt={raw.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-white font-bold text-sm">{raw.title}</h3>
              <Badge className={`${statusColors[raw.processing_status]} flex items-center gap-1 text-xs`}>
                {raw.processing_status === 'processing' && <Loader className="w-3 h-3 animate-spin" />}
                {statusLabels[raw.processing_status]}
              </Badge>
              <Badge className={`text-xs border ${isNew ? 'bg-purple-900/50 text-purple-400 border-purple-400/50' : 'bg-blue-900/50 text-blue-400 border-blue-400/50'}`}>
                {isNew ? '신규' : '기존'}
              </Badge>
            </div>
            <div className="text-gray-400 text-xs space-y-1">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-green-400" />
                <span>
                  {raw.eventstartdate ? `${raw.eventstartdate.substring(0,4)}-${raw.eventstartdate.substring(4,6)}-${raw.eventstartdate.substring(6,8)}` : '시작일 없음'}
                  {' ~ '}
                  {raw.eventenddate ? `${raw.eventenddate.substring(0,4)}-${raw.eventenddate.substring(4,6)}-${raw.eventenddate.substring(6,8)}` : '종료일 없음'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-teal-400" />
                <span>{raw.addr1 || '주소 없음'}</span>
              </div>
              <p className="text-gray-500">ContentID: {raw.contentid}</p>
              {raw.processing_status === 'processed' && raw.festival_id && (
                <Badge variant="outline" className="text-green-400 border-green-400 text-xs">✓ Festival ID: {raw.festival_id}</Badge>
              )}
              {raw.processing_status === 'failed' && raw.error_message && (
                <p className="text-red-400 bg-red-900/20 p-2 rounded">❌ {raw.error_message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Button onClick={onTransform} disabled={isTransforming} size="sm" className={`${isNew ? 'bg-purple-500 hover:bg-purple-600' : 'bg-orange-500 hover:bg-orange-600'} text-white`} title={isTransforming ? '변환 중...' : (isNew ? '변환' : '재변환')}>
              {isTransforming ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={onDelete} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");
  const [selectedRawData, setSelectedRawData] = useState([]);
  const [transformingIds, setTransformingIds] = useState(new Set());
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoProcessedCount, setAutoProcessedCount] = useState(0);
  const autoStopRef = useRef(false);

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
    queryFn: () => base44.entities.TourApiRawData.list('-created_date', 9999),
    initialData: [],
  });

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

    const confirmMessage = isRetransform
      ? `${rawDataIds.length}개의 데이터를 재변환하시겠습니까?\n\n기존 Festival 데이터에 새로운 정보가 덮어쓰기됩니다.`
      : `${rawDataIds.length}개의 데이터를 변환하시겠습니까?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setTransformingIds(prev => new Set([...prev, ...rawDataIds]));
    
    try {
      const response = await base44.functions.invoke('transformTourApiData', {
        rawDataIds,
        retransform: isRetransform
      });

      refetchRawData();

      if (response.data?.success) {
        alert(`✅ ${response.data.festivals_created}개 변환 완료!`);
      } else {
        alert(`변환 중 오류가 발생했습니다:\n\n${response.data?.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('[AdminTourAPI] Transform error:', error);
      alert(`변환 중 오류가 발생했습니다:\n\n${error.message}`);
    } finally {
      setTransformingIds(prev => {
        const next = new Set(prev);
        rawDataIds.forEach(id => next.delete(id));
        return next;
      });
    }
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

    // 자동 일괄 변환: 대기중인 데이터를 모두 처리할 때까지 백엔드 워크플로우 함수를 반복 호출
    const runAutoTransformLoop = async () => {
      if (isAutoRunning) return;
      setIsAutoRunning(true);
      autoStopRef.current = false;
      setAutoProcessedCount(0);
      let total = 0;
      let safety = 0;
      while (!autoStopRef.current && safety < 1000) {
        safety++;
        try {
          const response = await base44.functions.invoke('autoTransformPendingData', {});
          const data = response?.data || {};
          if (data.success === false) {
            if (data.error === 'YOUTUBE_API_LIMIT_REACHED') {
              alert('⛔ YouTube API 일일 한도 초과로 자동 변환이 중단되었습니다.');
            } else {
              alert(`변환 중단: ${data.error || data.message || '알 수 없는 오류'}`);
            }
            break;
          }
          const processed = data.processed || data.dispatched || 0;
          if (processed === 0) break; // 더 이상 대기 중인 데이터 없음
          total += processed;
          setAutoProcessedCount(total);
          refetchRawData();
        } catch (e) {
          console.error('[AdminTourAPI] auto loop error:', e);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      setIsAutoRunning(false);
      refetchRawData();
    };

    const stopAutoLoop = () => { autoStopRef.current = true; };

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
          <TabsList className="w-full bg-gray-900 grid grid-cols-2 mb-6">
            <TabsTrigger value="fetch" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              축제정보가져오기
            </TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-cyan-400 data-[state=active]:text-black text-xs">
              RawData 변환
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
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-purple-400" />
                  RawData를 Festival로 변환
                </h3>
                <Button
                  onClick={() => refetchRawData()}
                  size="sm"
                  variant="outline"
                  className="border-purple-400 text-purple-400 hover:bg-purple-900/20"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  새로고침
                </Button>
              </div>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 선택한 RawData를 Festival 엔티티로 변환합니다</li>
                <li>✓ 자동 번역 (한국어, 영어, 일본어, 중국어) 및 미디어 추가</li>
                <li>✓ YouTube 하이라이트 영상 & Shorts 자동 검색 <span className="text-yellow-300">(매 변환마다 항상 재검색)</span></li>
                <li>✓ <span className="text-cyan-300 font-bold">Shorts 채택 기준: score ≥ 1 AND LLM 관련성 ≠ N</span> <span className="text-gray-400 text-xs">(Y·UNKNOWN·SKIP 포함, N만 제외)</span> → 조회수 합산 → <code className="bg-gray-800 px-1 rounded text-xs">shorts_views_5_total</code></li>
                <li>✓ 재변환 시 기존 데이터를 업데이트합니다 <span className="text-yellow-300">(단, summary/description 번역은 스킵 — name/city/country만 재번역)</span></li>
                <li>✓ 실패한 데이터는 재시도 가능</li>
              </ul>
              <div className="mt-3 bg-red-900/20 border border-red-400/30 rounded-lg p-3">
                <p className="text-red-400 font-bold text-xs mb-1">🚫 하이라이트 영상 블랙리스트 키워드</p>
                <p className="text-gray-400 text-xs">영상 제목에 아래 키워드가 포함된 경우 하이라이트 영상에서 자동 제외됩니다:</p>
                <p className="text-red-300 text-xs font-mono mt-1">Idol, dance, 아이돌, 공연, 춤, stage</p>
              </div>
            </Card>

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
            </div>

            {/* 자동 일괄 변환 버튼 */}
            {pendingData.length > 0 && (
              <Card className="bg-purple-900/20 border-purple-400/30 p-4">
                <h3 className="text-white font-bold mb-2">🤖 RawData 자동 일괄 변환</h3>
                <p className="text-gray-400 text-sm mb-3">
                  버튼을 누르면 대기중인 RawData를 모두 순차 자동 변환합니다
                </p>
                <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-3 mb-3">
                  <p className="text-blue-400 text-xs font-bold mb-1">⚡ 자동화 방식</p>
                  <ul className="text-gray-300 text-xs space-y-1">
                    <li>• 클릭 즉시 변환 시작 (남은 항목까지 백그라운드에서 순차 처리)</li>
                    <li>• 5분 간격 스케줄 자동화도 백그라운드 병행</li>
                    <li>• 실행 중 버튼이 "실행 중지"로 전환되어 중단 가능</li>
                    <li>• 페이지 새로고침으로 진행 상황 확인</li>
                  </ul>
                </div>
                {(() => {
                  const isWorkflowRunning = isAutoRunning || processingData.length > 0;
                  return (
                    <>
                      <Button
                        onClick={isAutoRunning ? stopAutoLoop : runAutoTransformLoop}
                        disabled={isWorkflowRunning && !isAutoRunning}
                        className={`w-full font-bold ${isWorkflowRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'}`}
                      >
                        {isWorkflowRunning ? (
                          <>
                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                            {isAutoRunning ? '실행 중지' : '일괄 변환 진행중'}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-5 h-5 mr-2" />
                            자동 일괄 변환 시작
                          </>
                        )}
                      </Button>
                      {isWorkflowRunning && (
                        <div className="mt-3 bg-blue-900/20 border border-blue-400/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-blue-400 text-sm font-bold mb-1">
                            <Loader className="w-4 h-4 animate-spin" />
                            {isAutoRunning ? '자동 변환 실행 중...' : '백엔드 워크플로우 변환 중...'}
                          </div>
                          <p className="text-gray-300 text-xs">
                            {isAutoRunning
                              ? <>지금까지 <span className="text-blue-300 font-bold">{autoProcessedCount}개</span> 변환 완료 · 백엔드 워크플로우에서 순차 처리 중</>
                              : <>현재 <span className="text-blue-300 font-bold">{processingData.length}개</span> 처리 중 · 5분 간격 스케줄 자동화가 진행 중</>
                            }
                          </p>
                          {isAutoRunning && <p className="text-gray-500 text-xs mt-1">버튼을 다시 눌러 중단할 수 있습니다</p>}
                        </div>
                      )}
                    </>
                  );
                })()}
              </Card>
            )}

            {/* 백그라운드 변환 진행 중 알림 배너 */}
            {processingData.length > 0 && (
              <Card className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-400/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-blue-400 font-bold">백그라운드 변환 진행 중 ({processingData.length}개)</h3>
                  </div>
                </div>
                <div className="space-y-2">
                  {processingData.map((raw) => (
                    <div key={raw.id} className="flex items-center justify-between bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Loader className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                        <span className="text-white text-sm truncate">{raw.title}</span>
                      </div>
                      <Button
                        onClick={() => {
                          if (confirm(`"${raw.title}" 처리를 중단하시겠습니까?`)) {
                            stopProcessingMutation.mutate(raw.id);
                          }
                        }}
                        size="sm"
                        className="bg-red-900/30 border border-red-500 text-red-400 hover:bg-red-900/50 flex-shrink-0 ml-2"
                        disabled={stopProcessingMutation.isPending}
                      >
                        중단
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

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

            {/* 상태별 탭 */}
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="w-full bg-gray-900 grid grid-cols-3">
                <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                  대기중 ({pendingData.length})
                </TabsTrigger>
                <TabsTrigger value="processed" className="data-[state=active]:bg-green-500 data-[state=active]:text-black">
                  완료 ({processedData.length})
                </TabsTrigger>
                <TabsTrigger value="failed" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
                  실패 ({failedData.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-4 space-y-3">
                {pendingData.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const allIds = pendingData.map(r => r.id);
                          const allSelected = allIds.every(id => selectedRawData.includes(id));
                          setSelectedRawData(prev => allSelected ? prev.filter(id => !allIds.includes(id)) : [...new Set([...prev, ...allIds])]);
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {pendingData.every(r => selectedRawData.includes(r.id)) ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedRawData.filter(id => pendingData.find(r => r.id === id)).length > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedRawData.filter(id => pendingData.find(r => r.id === id)).length}개 선택됨</span>
                      )}
                    </div>
                    {selectedRawData.filter(id => pendingData.find(r => r.id === id)).length > 0 && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleTransform(selectedRawData.filter(id => pendingData.find(r => r.id === id)), false)} disabled={transformingIds.size > 0} className="flex-1 bg-cyan-500 hover:bg-cyan-600">
                          {transformingIds.size > 0 ? <><Loader className="w-4 h-4 mr-2 animate-spin" />변환 중...</> : <><RefreshCw className="w-4 h-4 mr-2" />변환</>}
                        </Button>
                        <Button onClick={() => {
                          const ids = selectedRawData.filter(id => pendingData.find(r => r.id === id));
                          if (confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) ids.forEach(id => deleteRawDataMutation.mutate(id));
                          setSelectedRawData(prev => prev.filter(id => !ids.includes(id)));
                        }} className="bg-red-500 hover:bg-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}
                {pendingData.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">대기중인 데이터가 없습니다.</p>
                ) : (
                  pendingData.map((raw) => (
                    <RawDataCard
                      key={raw.id}
                      raw={raw}
                      selected={selectedRawData.includes(raw.id)}
                      onToggleSelect={() => setSelectedRawData(prev => prev.includes(raw.id) ? prev.filter(i => i !== raw.id) : [...prev, raw.id])}
                      onDelete={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate(raw.id); }}
                      onTransform={() => handleTransform([raw.id], !!raw.festival_id)}
                      isTransforming={transformingIds.has(raw.id)}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="processed" className="mt-4 space-y-3">
                {processedData.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const allIds = processedData.map(r => r.id);
                          const allSelected = allIds.every(id => selectedRawData.includes(id));
                          setSelectedRawData(prev => allSelected ? prev.filter(id => !allIds.includes(id)) : [...new Set([...prev, ...allIds])]);
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {processedData.every(r => selectedRawData.includes(r.id)) ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedRawData.filter(id => processedData.find(r => r.id === id)).length > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedRawData.filter(id => processedData.find(r => r.id === id)).length}개 선택됨</span>
                      )}
                    </div>
                    {selectedRawData.filter(id => processedData.find(r => r.id === id)).length > 0 && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleTransform(selectedRawData.filter(id => processedData.find(r => r.id === id)), true)} disabled={transformingIds.size > 0} className="flex-1 bg-purple-500 hover:bg-purple-600 text-white">
                          {transformingIds.size > 0 ? <><Loader className="w-4 h-4 mr-2 animate-spin" />재변환 중...</> : <><RefreshCw className="w-4 h-4 mr-2" />재변환</>}
                        </Button>
                        <Button onClick={() => {
                          const ids = selectedRawData.filter(id => processedData.find(r => r.id === id));
                          if (confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) ids.forEach(id => deleteRawDataMutation.mutate(id));
                          setSelectedRawData(prev => prev.filter(id => !ids.includes(id)));
                        }} className="bg-red-500 hover:bg-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}
                {processedData.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">완료된 데이터가 없습니다.</p>
                ) : (
                  processedData.map((raw) => (
                    <RawDataCard
                      key={raw.id}
                      raw={raw}
                      selected={selectedRawData.includes(raw.id)}
                      onToggleSelect={() => setSelectedRawData(prev => prev.includes(raw.id) ? prev.filter(i => i !== raw.id) : [...prev, raw.id])}
                      onDelete={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate(raw.id); }}
                      onTransform={() => handleTransform([raw.id], true)}
                      isTransforming={transformingIds.has(raw.id)}
                    />
                  ))
                )}
              </TabsContent>

              {/* 실패 탭 */}
              <TabsContent value="failed" className="mt-4 space-y-3">
                {failedData.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const allIds = failedData.map(r => r.id);
                          const allSelected = allIds.every(id => selectedRawData.includes(id));
                          setSelectedRawData(prev => allSelected ? prev.filter(id => !allIds.includes(id)) : [...new Set([...prev, ...allIds])]);
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {failedData.every(r => selectedRawData.includes(r.id)) ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedRawData.filter(id => failedData.find(r => r.id === id)).length > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedRawData.filter(id => failedData.find(r => r.id === id)).length}개 선택됨</span>
                      )}
                    </div>
                    {selectedRawData.filter(id => failedData.find(r => r.id === id)).length > 0 && (
                      <div className="flex gap-2">
                        <Button onClick={() => handleTransform(selectedRawData.filter(id => failedData.find(r => r.id === id)), false)} disabled={transformingIds.size > 0} className="flex-1 bg-purple-500 hover:bg-purple-600">
                          {transformingIds.size > 0 ? <><Loader className="w-4 h-4 mr-2 animate-spin" />변환 중...</> : <><RefreshCw className="w-4 h-4 mr-2" />선택 재시도</>}
                        </Button>
                        <Button onClick={() => {
                          const ids = selectedRawData.filter(id => failedData.find(r => r.id === id));
                          if (confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) ids.forEach(id => deleteRawDataMutation.mutate(id));
                          setSelectedRawData(prev => prev.filter(id => !ids.includes(id)));
                        }} className="bg-red-500 hover:bg-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}
                {failedData.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">실패한 데이터가 없습니다.</p>
                ) : (
                  failedData.map((raw) => (
                    <RawDataCard
                      key={raw.id}
                      raw={raw}
                      selected={selectedRawData.includes(raw.id)}
                      onToggleSelect={() => setSelectedRawData(prev => prev.includes(raw.id) ? prev.filter(i => i !== raw.id) : [...prev, raw.id])}
                      onDelete={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate(raw.id); }}
                      onTransform={() => handleTransform([raw.id], !!raw.festival_id)}
                      isTransforming={transformingIds.has(raw.id)}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>

            {rawDataList.length === 0 && (
              <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">저장된 원본 데이터가 없습니다</p>
                <p className="text-gray-600 text-sm">먼저 "데이터 가져오기" 탭에서 데이터를 가져오세요</p>
              </Card>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}