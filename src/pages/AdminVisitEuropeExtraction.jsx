import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import VisitEuropeRawDataTab from "@/components/admin/VisitEuropeRawDataTab";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminVisitEuropeExtraction() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("discover");
  const [urlInput, setUrlInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedRawIds, setSelectedRawIds] = useState(new Set());

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: rawDataList } = useQuery({
    queryKey: ['visitEuropeRawData'],
    queryFn: () => base44.entities.VisitEuropeRawData.list('-created_date'),
    initialData: [],
  });

  React.useEffect(() => {
    if (!userLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(-1);
    }
  }, [user, userLoading, navigate]);

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('discoverVisitEuropeEvents', {});
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
        setActiveTab("extract");
      } else {
        alert(`발견 실패: ${data.error}`);
      }
    },
    onError: (error) => alert('이벤트 발견 중 오류가 발생했습니다: ' + error.message),
  });

  const extractMutation = useMutation({
    mutationFn: async (url) => {
      const { data } = await base44.functions.invoke('extractVisitEuropeFestivalFromUrl', { url });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(`${data.message}\n\n${data.extraction_quality?.quality_note || ''}`);
        setUrlInput("");
        setActiveTab("rawdata");
        queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
      } else {
        alert(`추출 실패: ${data.error}`);
      }
    },
    onError: (error) => alert('추출 중 오류가 발생했습니다: ' + error.message),
  });

  const transformMutation = useMutation({
    mutationFn: async (rawDataIds) => {
      const { data } = await base44.functions.invoke('transformVisitEuropeRawData', { rawDataIds });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setSelectedRawIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
        queryClient.invalidateQueries({ queryKey: ['festivals'] });
      }
    },
    onError: (error) => alert('변환 중 오류가 발생했습니다: ' + error.message),
  });

  const deleteRawDataMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.VisitEuropeRawData.delete(id);
      }
    },
    onSuccess: () => {
      setSelectedRawIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
    },
  });

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      await discoverMutation.mutateAsync();
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleExtract = async () => {
    if (!urlInput.trim()) { alert('URL을 입력해주세요'); return; }
    setIsExtracting(true);
    try {
      await extractMutation.mutateAsync(urlInput.trim());
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSelectItem = (id) => {
    const newSet = new Set(selectedRawIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedRawIds(newSet);
  };

  const handleTransform = () => {
    if (selectedRawIds.size === 0) { alert('변환할 데이터를 선택해주세요'); return; }
    // 안전하게 1건씩 순차 처리 (CPU 시간 제한 회피)
    transformMutation.mutate([Array.from(selectedRawIds)[0]]);
  };

  const handleDelete = () => {
    if (selectedRawIds.size === 0) { alert('삭제할 데이터를 선택해주세요'); return; }
    if (confirm(`선택한 ${selectedRawIds.size}개의 데이터를 삭제하시겠습니까?`)) {
      deleteRawDataMutation.mutate(Array.from(selectedRawIds));
    }
  };

  const discoveredCount = rawDataList.filter(r => r.extract_status === 'pending').length;
  const extractedCount = rawDataList.filter(r => r.extract_status === 'processed').length;
  const errorCount = rawDataList.filter(r => r.extract_status === 'failed' || r.processing_status === 'failed').length;

  if (userLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Europe - visiteurope.com 축제 정보 추출</h1>
            <p className="text-gray-400 text-sm">visiteurope.com 웹페이지에서 축제 정보 추출 (관리자 수동 PoC)</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <Card className="bg-orange-900/10 border-orange-400/30 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-300 font-bold text-sm mb-1">대량 자동 수집 비활성화</p>
            <p className="text-gray-400 text-xs">
              visiteurope.com 이용약관상 자동화된 대량 수집이 제한되어 있어, 이 기능은 관리자가 직접 소수의 이벤트를 발견/추출하는 PoC로 구현되어 있습니다.
              스케줄러나 반복 크롤링은 포함되어 있지 않습니다.
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-gray-900 border-gray-800 p-3 text-center">
            <div className="text-2xl font-bold text-cyan-400">{discoveredCount}</div>
            <div className="text-xs text-gray-400">발견됨 (상세추출 대기)</div>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{extractedCount}</div>
            <div className="text-xs text-gray-400">상세추출 완료</div>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{errorCount}</div>
            <div className="text-xs text-gray-400">오류</div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-gray-900 grid grid-cols-3">
            <TabsTrigger value="discover" className="data-[state=active]:bg-blue-500">이벤트 발견</TabsTrigger>
            <TabsTrigger value="extract" className="data-[state=active]:bg-blue-500">상세 추출</TabsTrigger>
            <TabsTrigger value="rawdata" className="data-[state=active]:bg-blue-500">RawData 변환</TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="mt-4 space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-bold text-lg mb-2">이벤트 목록 발견</h3>
              <p className="text-gray-400 text-sm mb-4">
                https://visiteurope.com/events 첫 페이지에서 이벤트 후보(제목/국가/도시/날짜/링크)를 최대 20개까지 가져옵니다.
                각 후보는 아직 상세 정보가 없으므로 "상세 추출" 탭에서 개별적으로 처리해야 합니다.
              </p>
              <Button
                onClick={handleDiscover}
                disabled={isDiscovering || discoverMutation.isPending}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-base font-bold"
              >
                {isDiscovering || discoverMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />이벤트 발견 중...</>
                ) : (
                  <><Search className="w-5 h-5 mr-2" />이벤트 목록에서 발견 시작</>
                )}
              </Button>
            </Card>

            {discoveredCount > 0 && (
              <Card className="bg-cyan-900/10 border-cyan-400/30 p-4">
                <p className="text-cyan-400 text-sm">
                  현재 {discoveredCount}개의 이벤트가 상세 추출을 기다리고 있습니다. "상세 추출" 탭으로 이동해서 처리하세요.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="extract" className="mt-4 space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-bold text-lg mb-4">단일 URL 상세정보 추출</h3>
              <div className="space-y-4">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://visiteurope.com/event/madeira-wine-festival"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white"
                  disabled={isExtracting}
                />
                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || !urlInput.trim()}
                  className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-base font-bold"
                >
                  {isExtracting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />축제 정보 추출 중...</>
                  ) : (
                    <><ExternalLink className="w-5 h-5 mr-2" />축제 정보 추출 시작</>
                  )}
                </Button>
              </div>
            </Card>

            {discoveredCount > 0 && (
              <Card className="bg-gray-900 border-gray-800 p-4">
                <h3 className="text-white font-bold mb-3">발견된 이벤트 (상세추출 대기)</h3>
                <div className="space-y-2">
                  {rawDataList.filter(r => r.extract_status === 'pending').map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{item.source_title}</p>
                        <p className="text-gray-500 text-xs truncate">{item.source_city}, {item.source_country} · {item.source_url}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { setUrlInput(item.source_url); extractMutation.mutate(item.source_url); }}
                        disabled={extractMutation.isPending}
                        className="bg-purple-500 hover:bg-purple-600 whitespace-nowrap ml-2"
                      >
                        상세 추출
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rawdata" className="mt-4 space-y-4">
            <VisitEuropeRawDataTab
              rawDataList={rawDataList}
              selectedRawIds={selectedRawIds}
              setSelectedRawIds={setSelectedRawIds}
              transformMutation={transformMutation}
              deleteRawDataMutation={deleteRawDataMutation}
              handleTransform={handleTransform}
              handleDelete={handleDelete}
              handleSelectItem={handleSelectItem}
              queryClient={queryClient}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}