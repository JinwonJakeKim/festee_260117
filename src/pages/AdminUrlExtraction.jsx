import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, CheckSquare, Square, ExternalLink, Loader2, Pencil, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createPageUrl } from "@/utils";

export default function AdminUrlExtraction() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("extract");
  const [extractingLinkId, setExtractingLinkId] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [selectedRawIds, setSelectedRawIds] = useState(new Set());
  const [selectedLinkIds, setSelectedLinkIds] = useState(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [showAddUrlForm, setShowAddUrlForm] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [editingSourceData, setEditingSourceData] = useState(null);
  const [newSourceUrl, setNewSourceUrl] = useState({ 
    name: "", 
    url: "", 
    country: "", 
    description: "",
    container_selector: "div.row.small-event-gutter",
    link_selector: "a",
    use_date_parameters: false,
    date_parameter_template: ""
  });
  const [showBatchExtract, setShowBatchExtract] = useState(false);
  const [batchConfig, setBatchConfig] = useState({
    list_page_url: "",
    container_selector: "div.row.small-event-gutter",
    link_selector: "a"
  });
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState({});

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: rawDataList } = useQuery({
    queryKey: ['japantravelUrlExtractionRawData'],
    queryFn: () => base44.entities.JapantravelUrlExtractionRawData.list('-created_date'),
    initialData: [],
  });

  const { data: sourceUrls } = useQuery({
    queryKey: ['festivalSourceUrls'],
    queryFn: () => base44.entities.FestivalSourceUrl.list('-created_date'),
    initialData: [],
  });

  const { data: automationsList } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('listScheduledTasks');
      return data.tasks || [];
    },
    initialData: [],
  });

  React.useEffect(() => {
    if (!userLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(-1);
    }
  }, [user, userLoading, navigate]);

  const extractMutation = useMutation({
    mutationFn: async (url) => {
      const { data } = await base44.functions.invoke('extractJapantravelFestivalFromUrl', { url });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setUrlInput("");
        setActiveTab("data");
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      } else {
        alert(`추출 실패: ${data.error}\n${data.message || ''}`);
      }
    },
    onError: (error) => {
      alert('추출 중 오류가 발생했습니다: ' + error.message);
    }
  });

  const batchExtractMutation = useMutation({
    mutationFn: async (config) => {
      const { data } = await base44.functions.invoke('extractFestivalsFromListPage', config);
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message + `\n\n상세 결과:\n총 링크: ${data.links_found}개\n성공: ${data.extraction_results.success}개\n실패: ${data.extraction_results.failed}개`);
        setShowBatchExtract(false);
        setActiveTab("data");
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      } else {
        alert(`일괄 추출 실패: ${data.error}\n${data.message || ''}`);
      }
    },
    onError: (error) => {
      alert('일괄 추출 중 오류가 발생했습니다: ' + error.message);
    }
  });

  const transformMutation = useMutation({
    mutationFn: async ({ rawDataIds, retransform = false }) => {
      const { data } = await base44.functions.invoke('transformJapantravelUrlExtractionData', { 
        rawDataIds,
        retransform 
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setSelectedRawIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
        queryClient.invalidateQueries({ queryKey: ['festivals'] });
      }
    },
    onError: (error) => {
      alert('변환 중 오류가 발생했습니다: ' + error.message);
    }
  });

  const deleteRawDataMutation = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.JapantravelUrlExtractionRawData.delete(id);
      }
    },
    onSuccess: () => {
      setSelectedRawIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      alert('선택한 데이터가 삭제되었습니다');
    }
  });

  const addSourceUrlMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.FestivalSourceUrl.create(data);
    },
    onSuccess: () => {
      setShowAddUrlForm(false);
      setNewSourceUrl({ 
        name: "", 
        url: "", 
        country: "", 
        description: "",
        container_selector: "div.row.small-event-gutter",
        link_selector: "a",
        use_date_parameters: false,
        date_parameter_template: ""
      });
      queryClient.invalidateQueries({ queryKey: ['festivalSourceUrls'] });
      alert('소스 URL이 추가되었습니다');
    }
  });

  const deleteSourceUrlMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.FestivalSourceUrl.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivalSourceUrls'] });
    }
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.FestivalSourceUrl.update(id, data);
    },
    onSuccess: () => {
      setEditingSourceId(null);
      setEditingSourceData(null);
      queryClient.invalidateQueries({ queryKey: ['festivalSourceUrls'] });
      alert('소스 URL이 수정되었습니다');
    }
  });

  const updateSourceUrlMutation = useMutation({
    mutationFn: async ({ id, url }) => {
      await base44.entities.FestivalSourceUrl.update(id, { 
        last_used_date: new Date().toISOString(),
        url 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivalSourceUrls'] });
    }
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: async (taskId) => {
      const { data } = await base44.functions.invoke('toggleScheduledTask', { taskId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      alert('자동화 상태가 변경되었습니다');
    }
  });

  const runLinkExtractionMutation = useMutation({
    mutationFn: async ({ sourceUrlId, targetMonth }) => {
      const { data } = await base44.functions.invoke('extractJapantravelFestivalLinksFromSourceUrl', { 
        sourceUrlId,
        targetMonth 
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      }
    }
  });

  const runPendingProcessMutation = useMutation({
    mutationFn: async (batchSize = 5) => {
      const { data } = await base44.functions.invoke('processPendingJapantravelUrlExtractions', { batchSize });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      }
    }
  });

  const extractDetailMutation = useMutation({
    mutationFn: async ({ rawDataId, url }) => {
      const { data } = await base44.functions.invoke('extractJapantravelFestivalFromUrl', { url, rawDataId });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setExtractingLinkId(null);
        queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
      } else {
        alert(`상세 추출 실패: ${data.error}`);
        setExtractingLinkId(null);
      }
    },
    onError: (error) => {
      alert('상세 추출 중 오류가 발생했습니다: ' + error.message);
      setExtractingLinkId(null);
    }
  });

  const handleExtract = async () => {
    if (!urlInput.trim()) {
      alert('URL을 입력해주세요');
      return;
    }
    setIsExtracting(true);
    try {
      await extractMutation.mutateAsync(urlInput);
      
      // 저장된 URL이라면 last_used_date 업데이트
      const matchingSource = sourceUrls.find(s => s.url === urlInput);
      if (matchingSource) {
        updateSourceUrlMutation.mutate({ id: matchingSource.id, url: urlInput });
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSelectSourceUrl = (sourceUrl) => {
    setUrlInput(sourceUrl.url);
  };

  const handleUseBatchSourceUrl = (sourceUrl) => {
    setBatchConfig({
      list_page_url: sourceUrl.url,
      container_selector: sourceUrl.container_selector || "div.row.small-event-gutter",
      link_selector: sourceUrl.link_selector || "a"
    });
    setShowBatchExtract(true);
    if (sourceUrl.id) {
      updateSourceUrlMutation.mutate({ id: sourceUrl.id, url: sourceUrl.url });
    }
  };

  const handleAddSourceUrl = () => {
    if (!newSourceUrl.name || !newSourceUrl.url || !newSourceUrl.country) {
      alert('이름, URL, 국가를 모두 입력해주세요');
      return;
    }
    if (newSourceUrl.use_date_parameters && !newSourceUrl.date_parameter_template) {
      alert('날짜 파라미터 사용 시 템플릿을 입력해주세요');
      return;
    }
    addSourceUrlMutation.mutate(newSourceUrl);
  };

  const handleDeleteSourceUrl = (id) => {
    if (confirm('이 소스 URL을 삭제하시겠습니까?')) {
      deleteSourceUrlMutation.mutate(id);
    }
  };

  const handleEditSourceUrl = (source) => {
    setEditingSourceId(source.id);
    setEditingSourceData({
      name: source.name,
      url: source.url,
      country: source.country,
      description: source.description || "",
      container_selector: source.container_selector || "div.row.small-event-gutter",
      link_selector: source.link_selector || "a",
      use_date_parameters: source.use_date_parameters || false,
      date_parameter_template: source.date_parameter_template || ""
    });
  };

  const handleSaveEdit = () => {
    if (!editingSourceData.name || !editingSourceData.url || !editingSourceData.country) {
      alert('이름, URL, 국가는 필수 입력 항목입니다');
      return;
    }
    updateSourceMutation.mutate({ id: editingSourceId, data: editingSourceData });
  };

  const handleCancelEdit = () => {
    setEditingSourceId(null);
    setEditingSourceData(null);
  };

  const handleBatchExtract = async () => {
    if (!batchConfig.list_page_url.trim()) {
      alert('목록 페이지 URL을 입력해주세요');
      return;
    }
    setIsBatchExtracting(true);
    try {
      await batchExtractMutation.mutateAsync(batchConfig);
    } finally {
      setIsBatchExtracting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedRawIds.size === rawDataList.length) {
      setSelectedRawIds(new Set());
    } else {
      setSelectedRawIds(new Set(rawDataList.map(r => r.id)));
    }
  };

  const handleSelectItem = (id) => {
    const newSet = new Set(selectedRawIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRawIds(newSet);
  };

  const handleTransform = () => {
    if (selectedRawIds.size === 0) {
      alert('변환할 데이터를 선택해주세요');
      return;
    }
    transformMutation.mutate({ rawDataIds: Array.from(selectedRawIds), retransform: false });
  };

  const handleRetransform = () => {
    if (selectedRawIds.size === 0) {
      alert('재변환할 데이터를 선택해주세요');
      return;
    }
    const hasProcessed = Array.from(selectedRawIds).some(id => {
      const item = rawDataList.find(r => r.id === id);
      return item?.processing_status === 'processed';
    });
    if (!hasProcessed) {
      alert('재변환은 이미 변환된 데이터만 가능합니다');
      return;
    }
    transformMutation.mutate({ rawDataIds: Array.from(selectedRawIds), retransform: true });
  };

  const handleDelete = () => {
    if (selectedRawIds.size === 0) {
      alert('삭제할 데이터를 선택해주세요');
      return;
    }
    if (confirm(`선택한 ${selectedRawIds.size}개의 데이터를 삭제하시겠습니까?`)) {
      deleteRawDataMutation.mutate(Array.from(selectedRawIds));
    }
  };

  const handleSelectAllLinks = () => {
    const linkOnlyRecords = rawDataList.filter(r => !r.name_original || r.name_original === "");
    if (selectedLinkIds.size === linkOnlyRecords.length) {
      setSelectedLinkIds(new Set());
    } else {
      setSelectedLinkIds(new Set(linkOnlyRecords.map(r => r.id)));
    }
  };

  const handleSelectLink = (id) => {
    const newSet = new Set(selectedLinkIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedLinkIds(newSet);
  };

  const handleDeleteSelectedLinks = () => {
    if (selectedLinkIds.size === 0) {
      alert('삭제할 링크를 선택해주세요');
      return;
    }
    if (confirm(`선택한 ${selectedLinkIds.size}개의 링크를 삭제하시겠습니까?`)) {
      deleteRawDataMutation.mutate(Array.from(selectedLinkIds));
      setSelectedLinkIds(new Set());
    }
  };

  const handleDeleteAllLinks = () => {
    const linkOnlyRecords = rawDataList.filter(r => !r.name_original || r.name_original === "");
    if (linkOnlyRecords.length === 0) {
      alert('삭제할 링크가 없습니다');
      return;
    }
    if (confirm(`모든 링크 ${linkOnlyRecords.length}개를 삭제하시겠습니까?`)) {
      deleteRawDataMutation.mutate(linkOnlyRecords.map(r => r.id));
      setSelectedLinkIds(new Set());
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-gray-600">대기중</Badge>;
      case 'processing':
        return <Badge className="bg-blue-600">처리중</Badge>;
      case 'processed':
        return <Badge className="bg-green-600">완료</Badge>;
      case 'failed':
        return <Badge className="bg-red-600">실패</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

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
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Japan - japantravel.com 축제 정보 추출</h1>
            <p className="text-gray-400 text-sm">japantravel.com 웹페이지에서 축제 정보 자동 추출</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-gray-900 grid grid-cols-4">
            <TabsTrigger value="extract" className="data-[state=active]:bg-pink-500">
              URL 추출
            </TabsTrigger>
            <TabsTrigger value="links" className="data-[state=active]:bg-pink-500">
              링크 관리
            </TabsTrigger>
            <TabsTrigger value="data" className="data-[state=active]:bg-pink-500">
              데이터 관리
            </TabsTrigger>
            <TabsTrigger value="automation" className="data-[state=active]:bg-pink-500">
              자동화
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="mt-4">
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-bold mb-4">축제 웹페이지 URL 입력</h3>
              <div className="space-y-4">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/festival"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white"
                  disabled={isExtracting}
                />
                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || !urlInput.trim()}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      추출 중...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5 mr-2" />
                      축제 정보 추출 시작
                    </>
                  )}
                </Button>
              </div>

              <div className="mt-6 p-4 bg-blue-900/20 border border-blue-400/30 rounded-lg">
                <h4 className="text-blue-400 font-bold mb-2 text-sm">💡 사용 방법</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• 축제 공식 웹사이트 또는 상세 페이지 URL을 입력하세요</li>
                  <li>• 추출된 데이터는 "데이터 관리" 탭에서 확인할 수 있습니다</li>
                  <li>• 변환 시 Google 이미지, YouTube Shorts가 자동으로 추가됩니다</li>
                  <li>• 여러 축제가 나열된 목록 페이지는 "일괄 추출" 기능을 사용하세요</li>
                </ul>
              </div>

              {/* 일괄 추출 기능 */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-bold">일괄 추출 (Batch)</h4>
                  <Button
                    onClick={() => setShowBatchExtract(!showBatchExtract)}
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600"
                  >
                    {showBatchExtract ? '닫기' : '열기'}
                  </Button>
                </div>

                {showBatchExtract && (
                  <Card className="bg-gray-800 border-gray-700 p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="text-gray-300 text-xs mb-1 block">목록 페이지 URL *</label>
                        <input
                          type="url"
                          placeholder="https://en.japantravel.com/events"
                          value={batchConfig.list_page_url}
                          onChange={(e) => setBatchConfig({ ...batchConfig, list_page_url: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                          disabled={isBatchExtracting}
                        />
                      </div>
                      <div>
                        <label className="text-gray-300 text-xs mb-1 block">컨테이너 CSS 선택자</label>
                        <input
                          type="text"
                          placeholder="div.row.small-event-gutter"
                          value={batchConfig.container_selector}
                          onChange={(e) => setBatchConfig({ ...batchConfig, container_selector: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                          disabled={isBatchExtracting}
                        />
                      </div>
                      <div>
                        <label className="text-gray-300 text-xs mb-1 block">링크 선택자</label>
                        <input
                          type="text"
                          placeholder="a"
                          value={batchConfig.link_selector}
                          onChange={(e) => setBatchConfig({ ...batchConfig, link_selector: e.target.value })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                          disabled={isBatchExtracting}
                        />
                      </div>
                      <Button
                        onClick={handleBatchExtract}
                        disabled={isBatchExtracting || !batchConfig.list_page_url.trim()}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      >
                        {isBatchExtracting ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            일괄 추출 중... (시간이 걸릴 수 있습니다)
                          </>
                        ) : (
                          '일괄 추출 시작'
                        )}
                      </Button>
                      <div className="p-3 bg-yellow-900/20 border border-yellow-400/30 rounded-lg">
                        <p className="text-yellow-400 text-xs font-bold mb-1">⚠️ 주의사항</p>
                        <ul className="text-gray-300 text-xs space-y-1">
                          <li>• 여러 축제 링크가 있는 목록 페이지의 URL을 입력하세요</li>
                          <li>• CSS 선택자는 브라우저 개발자 도구로 확인할 수 있습니다</li>
                          <li>• 추출 시간은 링크 개수에 따라 수 분이 소요될 수 있습니다</li>
                        </ul>
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              {/* 저장된 소스 URL 관리 */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-bold">저장된 소스 URL</h4>
                  <Button
                    onClick={() => setShowAddUrlForm(!showAddUrlForm)}
                    size="sm"
                    className="bg-cyan-500 hover:bg-cyan-600"
                  >
                    {showAddUrlForm ? '취소' : '+ 추가'}
                  </Button>
                </div>

                {showAddUrlForm && (
                  <Card className="bg-gray-800 border-gray-700 p-4 mb-3">
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="이름 (예: Japan Travel Events)"
                        value={newSourceUrl.name}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, name: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <input
                        type="url"
                        placeholder="URL"
                        value={newSourceUrl.url}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, url: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <input
                        type="text"
                        placeholder="국가 (예: Japan)"
                        value={newSourceUrl.country}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, country: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <textarea
                        placeholder="설명 (선택)"
                        value={newSourceUrl.description}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, description: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                        rows={2}
                      />
                      <input
                        type="text"
                        placeholder="컨테이너 CSS 선택자 (예: div.row.small-event-gutter)"
                        value={newSourceUrl.container_selector}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, container_selector: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <input
                        type="text"
                        placeholder="링크 CSS 선택자 (예: a 또는 a.article-item-link)"
                        value={newSourceUrl.link_selector}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, link_selector: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <div className="flex items-center gap-2 p-3 bg-gray-800 rounded">
                        <input
                          type="checkbox"
                          checked={newSourceUrl.use_date_parameters}
                          onChange={(e) => setNewSourceUrl({ ...newSourceUrl, use_date_parameters: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label className="text-gray-300 text-sm">날짜 파라미터 사용</label>
                      </div>
                      {newSourceUrl.use_date_parameters && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="날짜 템플릿 (예: https://example.com/events?from={YYYY}-{MM}-01&to={YYYY}-{MM}-{LAST_DAY}&p=1)"
                            value={newSourceUrl.date_parameter_template}
                            onChange={(e) => setNewSourceUrl({ ...newSourceUrl, date_parameter_template: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                          />
                          <p className="text-xs text-gray-400">
                            사용 가능한 플레이스홀더: {'{YYYY}'} (연도), {'{MM}'} (월), {'{LAST_DAY}'} (월말일)
                          </p>
                        </div>
                      )}
                      <Button
                        onClick={handleAddSourceUrl}
                        disabled={addSourceUrlMutation.isPending}
                        className="w-full bg-green-500 hover:bg-green-600"
                        size="sm"
                      >
                        저장
                      </Button>
                    </div>
                  </Card>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sourceUrls.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">저장된 URL이 없습니다</p>
                  ) : (
                    sourceUrls.map((source) => (
                      <Card
                        key={source.id}
                        className="bg-gray-800 border-gray-700 p-3 hover:bg-gray-750 transition-colors"
                      >
                        {editingSourceId === source.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="이름"
                              value={editingSourceData.name}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, name: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            />
                            <input
                              type="url"
                              placeholder="URL"
                              value={editingSourceData.url}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, url: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            />
                            <input
                              type="text"
                              placeholder="국가"
                              value={editingSourceData.country}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, country: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            />
                            <textarea
                              placeholder="설명"
                              value={editingSourceData.description}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, description: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                              rows={2}
                            />
                            <input
                              type="text"
                              placeholder="컨테이너 CSS 선택자"
                              value={editingSourceData.container_selector}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, container_selector: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            />
                            <input
                              type="text"
                              placeholder="링크 CSS 선택자"
                              value={editingSourceData.link_selector}
                              onChange={(e) => setEditingSourceData({ ...editingSourceData, link_selector: e.target.value })}
                              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            />
                            <div className="flex items-center gap-2 p-2 bg-gray-800 rounded">
                              <input
                                type="checkbox"
                                checked={editingSourceData.use_date_parameters || false}
                                onChange={(e) => setEditingSourceData({ ...editingSourceData, use_date_parameters: e.target.checked })}
                                className="w-4 h-4"
                              />
                              <label className="text-gray-300 text-xs">날짜 파라미터 사용</label>
                            </div>
                            {editingSourceData.use_date_parameters && (
                              <input
                                type="text"
                                placeholder="날짜 템플릿 (예: https://example.com/events?from={YYYY}-{MM}-01&to={YYYY}-{MM}-{LAST_DAY}&p=1)"
                                value={editingSourceData.date_parameter_template || ''}
                                onChange={(e) => setEditingSourceData({ ...editingSourceData, date_parameter_template: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                              />
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveEdit} className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-xs">
                                저장
                              </Button>
                              <Button size="sm" onClick={handleCancelEdit} className="flex-1 bg-gray-600 hover:bg-gray-700 text-xs">
                                취소
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h5 className="text-white font-medium text-sm truncate">{source.name}</h5>
                                <Badge className="bg-pink-500/20 text-pink-400 border-pink-400/50 text-xs">
                                  {source.country}
                                </Badge>
                              </div>
                              <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 text-xs truncate mb-1 block underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {source.url}
                              </a>
                              {source.description && (
                                <p className="text-gray-500 text-xs">{source.description}</p>
                              )}
                              {source.last_used_date && (
                                <p className="text-gray-600 text-xs mt-1">
                                  마지막 사용: {new Date(source.last_used_date).toLocaleDateString('ko-KR')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditSourceUrl(source);
                                  }}
                                  className="flex-shrink-0 text-yellow-400 hover:text-yellow-300"
                                  title="수정"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSourceUrl(source.id);
                                  }}
                                  className="flex-shrink-0 text-red-400 hover:text-red-300"
                                  title="삭제"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {source.use_date_parameters ? (
                                <div className="space-y-2 w-full">
                                  <select
                                    value={selectedMonths[source.id] || ''}
                                    onChange={(e) => {
                                      setSelectedMonths({
                                        ...selectedMonths,
                                        [source.id]: e.target.value
                                      });
                                    }}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                                  >
                                    <option value="">월 선택</option>
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const month = String(i + 1).padStart(2, '0');
                                      return (
                                        <option key={month} value={`2026-${month}`}>
                                          2026년 {month}월
                                        </option>
                                      );
                                    })}
                                  </select>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!selectedMonths[source.id]) {
                                        alert('월을 선택해주세요');
                                        return;
                                      }
                                      runLinkExtractionMutation.mutate({ 
                                        sourceUrlId: source.id,
                                        targetMonth: selectedMonths[source.id]
                                      });
                                    }}
                                    disabled={!selectedMonths[source.id] || runLinkExtractionMutation.isPending}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-xs px-2 py-1 h-auto"
                                  >
                                    {runLinkExtractionMutation.isPending ? (
                                      <>
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        추출 중
                                      </>
                                    ) : (
                                      '링크 추출'
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectSourceUrl(source);
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-xs px-2 py-1 h-auto"
                                  >
                                    단일
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUseBatchSourceUrl(source);
                                    }}
                                    className="bg-purple-600 hover:bg-purple-700 text-xs px-2 py-1 h-auto"
                                  >
                                    일괄
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="links" className="mt-4 space-y-4">
            <Card className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 border-cyan-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-cyan-400" />
                수집된 링크 관리
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ URL 추출 탭에서 수집한 링크들을 관리합니다</li>
                <li>✓ "상세 추출" 버튼을 클릭하여 각 링크의 축제 정보를 추출합니다</li>
                <li>✓ 추출이 완료되면 "데이터 관리" 탭으로 이동합니다</li>
              </ul>
            </Card>

            {/* 통계 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-cyan-900/20 border-cyan-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-400">
                    {rawDataList.filter(r => !r.name_original || r.name_original === "").length}
                  </div>
                  <div className="text-xs text-gray-400">링크만 수집됨</div>
                </div>
              </Card>
              <Card className="bg-blue-900/20 border-blue-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 flex items-center justify-center gap-1">
                    {rawDataList.filter(r => r.processing_status === 'processing').length}
                    {rawDataList.filter(r => r.processing_status === 'processing').length > 0 && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                  </div>
                  <div className="text-xs text-gray-400">추출 중</div>
                </div>
              </Card>
              <Card className="bg-red-900/20 border-red-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {rawDataList.filter(r => r.processing_status === 'failed' && !r.name_original).length}
                  </div>
                  <div className="text-xs text-gray-400">추출 실패</div>
                </div>
              </Card>
            </div>

            {/* 일괄 추출 버튼 */}
            {rawDataList.filter(r => !r.name_original || r.name_original === "").length > 0 && (
              <Card className="bg-purple-900/20 border-purple-400/30 p-4">
                <h3 className="text-white font-bold mb-2">일괄 상세 추출</h3>
                <p className="text-gray-400 text-sm mb-3">
                  대기 중인 링크에서 축제 정보를 순차적으로 추출합니다 (최대 5개씩 처리)
                </p>
                <Button
                  onClick={() => runPendingProcessMutation.mutate(5)}
                  disabled={runPendingProcessMutation.isPending}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {runPendingProcessMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      일괄 추출 중...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2" />
                      대기열 일괄 추출 시작
                    </>
                  )}
                </Button>
              </Card>
            )}

            {/* 선택 및 삭제 버튼 */}
            {rawDataList.filter(r => !r.name_original || r.name_original === "").length > 0 && (
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={handleSelectAllLinks}
                    className="flex items-center gap-2 text-white hover:text-cyan-400"
                  >
                    {selectedLinkIds.size === rawDataList.filter(r => !r.name_original || r.name_original === "").length ? (
                      <CheckSquare className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="font-medium">전체 선택</span>
                  </button>
                  {selectedLinkIds.size > 0 && (
                    <span className="text-cyan-400 text-sm">{selectedLinkIds.size}개 선택됨</span>
                  )}
                </div>

                {selectedLinkIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDeleteSelectedLinks}
                      disabled={deleteRawDataMutation.isPending}
                      className="flex-1 bg-red-500 hover:bg-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      선택 삭제 ({selectedLinkIds.size}개)
                    </Button>
                    <Button
                      onClick={handleDeleteAllLinks}
                      disabled={deleteRawDataMutation.isPending}
                      className="flex-1 bg-red-700 hover:bg-red-800"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      전체 삭제
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* 링크 목록 */}
            <div className="space-y-3">
              {rawDataList.filter(r => !r.name_original || r.name_original === "").length > 0 ? (
                rawDataList.filter(r => !r.name_original || r.name_original === "").map((item) => (
                  <Card key={item.id} className={`border-2 ${
                    selectedLinkIds.has(item.id) 
                      ? 'bg-purple-900/30 border-purple-400' 
                      : 'bg-gray-900 border-gray-800'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => handleSelectLink(item.id)}
                          className="flex-shrink-0 mt-1"
                        >
                          {selectedLinkIds.has(item.id) ? (
                            <CheckSquare className="w-6 h-6 text-cyan-400" />
                          ) : (
                            <Square className="w-6 h-6 text-gray-600" />
                          )}
                        </button>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-white font-medium">링크 수집됨</h3>
                            {getStatusBadge(item.processing_status)}
                          </div>
                          <a 
                            href={item.source_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.source_url}
                          </a>
                          <p className="text-gray-500 text-xs">
                            {item.country} · {new Date(item.created_date).toLocaleDateString('ko-KR')}
                          </p>
                          {item.error_message && (
                            <p className="text-red-400 text-xs mt-2">❌ {item.error_message}</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            onClick={() => {
                              setExtractingLinkId(item.id);
                              extractDetailMutation.mutate({ rawDataId: item.id, url: item.source_url });
                            }}
                            disabled={extractingLinkId === item.id || item.processing_status === 'processing'}
                            size="sm"
                            className="bg-purple-500 hover:bg-purple-600 whitespace-nowrap"
                          >
                            {extractingLinkId === item.id || item.processing_status === 'processing' ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                추출 중
                              </>
                            ) : (
                              <>
                                <ExternalLink className="w-4 h-4 mr-1" />
                                상세 추출
                              </>
                              )}
                              </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <ExternalLink className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">수집된 링크가 없습니다</p>
                  <p className="text-gray-600 text-sm mt-2">"URL 추출" 탭에서 링크를 수집하세요</p>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-4">
            <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-400/30 p-4">
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-purple-400" />
                원본 데이터를 Festival로 변환
              </h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 선택한 원본 데이터를 Festival 엔티티로 변환합니다</li>
                <li>✓ 자동 번역 (한국어, 영어) 및 미디어 추가</li>
                <li>✓ Google 이미지 & YouTube Shorts 자동 검색</li>
                <li>✓ 재변환 시 기존 데이터를 업데이트합니다</li>
              </ul>
            </Card>

            {/* 처리 중 알림 */}
            {rawDataList.filter(r => r.processing_status === 'processing').length > 0 && (
              <Card className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border-blue-400/50 p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-blue-400 font-bold mb-1">변환 진행 중</h3>
                    <p className="text-gray-300 text-sm">
                      현재 {rawDataList.filter(r => r.processing_status === 'processing').length}개의 축제가 변환되고 있습니다.
                    </p>
                  </div>
                  <Button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] })}
                    size="sm"
                    variant="outline"
                    className="border-blue-400 text-blue-400 hover:bg-blue-900/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            )}

            {/* 통계 카드 */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-green-900/20 border-green-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {rawDataList.filter(r => r.name_original && r.name_original !== "").length}
                  </div>
                  <div className="text-xs text-gray-400">상세 정보 추출 완료</div>
                </div>
              </Card>
              <Card className="bg-blue-900/20 border-blue-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    {rawDataList.filter(r => r.festival_id).length}
                  </div>
                  <div className="text-xs text-gray-400">Festival 변환 완료</div>
                </div>
              </Card>
              <Card className="bg-red-900/20 border-red-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {rawDataList.filter(r => r.processing_status === 'failed' && r.name_original).length}
                  </div>
                  <div className="text-xs text-gray-400">변환 실패</div>
                </div>
              </Card>
            </div>

            {/* 전체 선택 및 버튼 */}
            {rawDataList.length > 0 && (
              <Card className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-white hover:text-cyan-400"
                  >
                    {selectedRawIds.size === rawDataList.length ? (
                      <CheckSquare className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="font-medium">전체 선택</span>
                  </button>
                  {selectedRawIds.size > 0 && (
                    <span className="text-cyan-400 text-sm">{selectedRawIds.size}개 선택됨</span>
                  )}
                </div>

                {selectedRawIds.size > 0 && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleTransform}
                      disabled={transformMutation.isPending}
                      className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                    >
                      {transformMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          변환 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          변환
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleRetransform}
                      disabled={transformMutation.isPending}
                      className="flex-1 bg-purple-500 hover:bg-purple-600"
                    >
                      {transformMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          재변환 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          재변환
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleDelete}
                      disabled={deleteRawDataMutation.isPending}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {/* 신규 변환 섹션 */}
            <div className="space-y-3 border border-purple-800/50 rounded-lg p-4 bg-purple-900/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-purple-400 font-bold flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    신규 축제 변환 ({rawDataList.filter(r => !r.festival_id && r.name_original && r.name_original !== "").length}개)
                  </h3>
                  <p className="text-gray-400 text-xs mt-1">상세 정보가 추출되었지만 Festival 엔티티에는 없는 데이터</p>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                {rawDataList.filter(r => !r.festival_id && r.name_original && r.name_original !== "").length > 0 ? (
                  rawDataList.filter(r => !r.festival_id && r.name_original && r.name_original !== "").map((item) => (
                    <Card key={item.id} className={`border-2 ${
                      selectedRawIds.has(item.id) 
                        ? 'bg-purple-900/30 border-purple-400' 
                        : 'bg-gray-900 border-gray-800'
                    }`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleSelectItem(item.id)}
                            className="flex-shrink-0 mt-1"
                          >
                            {selectedRawIds.has(item.id) ? (
                              <CheckSquare className="w-6 h-6 text-cyan-400" />
                            ) : (
                              <Square className="w-6 h-6 text-gray-600" />
                            )}
                          </button>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                              {getStatusBadge(item.processing_status)}
                              <Badge className="bg-purple-900/50 text-purple-400 border border-purple-400/50">
                                신규
                              </Badge>
                            </div>
                            <a 
                              href={item.source_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.source_url}
                            </a>
                            <p className="text-gray-500 text-xs">
                              {item.city}, {item.country} · {new Date(item.created_date).toLocaleDateString('ko-KR')}
                            </p>
                            {item.error_message && (
                              <p className="text-red-400 text-xs mt-2">❌ {item.error_message}</p>
                            )}
                          </div>

                          <Button
                            onClick={() => {
                              if (confirm('이 원본 데이터를 삭제하시겠습니까?')) {
                                deleteRawDataMutation.mutate([item.id]);
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
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">신규 축제 데이터가 없습니다.</p>
                )}
              </div>
            </div>

            {/* 재변환 섹션 */}
            {rawDataList.filter(r => r.festival_id && r.name_original && r.name_original !== "").length > 0 && (
              <div className="space-y-3 border border-orange-800/50 rounded-lg p-4 bg-orange-900/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-orange-400 font-bold flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      기존 축제 ({rawDataList.filter(r => r.festival_id && r.name_original && r.name_original !== "").length}개)
                    </h3>
                    <p className="text-gray-400 text-xs mt-1">Festival 엔티티에 이미 존재하는 축제 (재변환 가능)</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  {rawDataList.filter(r => r.festival_id && r.name_original && r.name_original !== "").map((item) => (
                    <Card key={item.id} className={`border-2 ${
                      selectedRawIds.has(item.id) 
                        ? 'bg-purple-900/30 border-purple-400' 
                        : 'bg-gray-900 border-gray-800'
                    }`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleSelectItem(item.id)}
                            className="flex-shrink-0 mt-1"
                          >
                            {selectedRawIds.has(item.id) ? (
                              <CheckSquare className="w-6 h-6 text-cyan-400" />
                            ) : (
                              <Square className="w-6 h-6 text-gray-600" />
                            )}
                          </button>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                              {getStatusBadge(item.processing_status)}
                              <Badge className="bg-blue-900/50 text-blue-400 border border-blue-400/50">
                                기존
                              </Badge>
                            </div>
                            <a 
                              href={item.source_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.source_url}
                            </a>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{item.city}, {item.country}</span>
                              <span>{new Date(item.created_date).toLocaleDateString('ko-KR')}</span>
                              {item.festival_id && (
                                <Badge variant="outline" className="text-green-400 border-green-400">
                                  Festival ID: {item.festival_id.substring(0, 8)}
                                </Badge>
                              )}
                            </div>
                            {item.error_message && (
                              <p className="text-red-400 text-xs mt-2">❌ {item.error_message}</p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={() => {
                                if (confirm(`"${item.name_original}" 데이터를 재변환하시겠습니까?`)) {
                                  handleRetransform();
                                  setSelectedRawIds(new Set([item.id]));
                                }
                              }}
                              size="sm"
                              className="bg-orange-500 hover:bg-orange-600 text-white"
                              title="재변환"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => {
                                if (confirm('이 원본 데이터를 삭제하시겠습니까?')) {
                                  deleteRawDataMutation.mutate([item.id]);
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
                  ))}
                </div>
              </div>
            )}

            {rawDataList.length === 0 && (
              <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500">추출된 데이터가 없습니다</p>
                <p className="text-gray-600 text-sm mt-2">"URL 추출" 탭에서 시작하세요</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="automation" className="mt-4 space-y-4">
            <Card className="bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border-cyan-400/30 p-4">
              <h3 className="text-white font-bold mb-2">자동화 관리</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ 소스 URL에서 축제 링크를 자동으로 추출합니다</li>
                <li>✓ 대기 중인 링크를 자동으로 처리합니다</li>
                <li>✓ 자동화 주기는 필요에 따라 조정하세요</li>
              </ul>
            </Card>

            {/* 링크 추출 자동화 */}
            <Card className="bg-gray-900 border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold">1. 소스 URL 링크 추출</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    저장된 소스 URL에서 축제 링크를 탐색하고 대기열에 추가
                  </p>
                </div>
                {automationsList.find(a => a.name === 'URL 링크 추출 자동화') && (
                  <Button
                    onClick={() => {
                      const automation = automationsList.find(a => a.name === 'URL 링크 추출 자동화');
                      toggleAutomationMutation.mutate(automation.id);
                    }}
                    className={automationsList.find(a => a.name === 'URL 링크 추출 자동화')?.is_active 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-gray-600 hover:bg-gray-700'}
                  >
                    {automationsList.find(a => a.name === 'URL 링크 추출 자동화')?.is_active ? '활성화됨' : '비활성화됨'}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-blue-900/20 border border-blue-400/30 rounded-lg">
                  <p className="text-blue-400 text-xs font-bold mb-1">📋 동작 방식</p>
                  <ul className="text-gray-300 text-xs space-y-1">
                    <li>• 저장된 소스 URL 목록을 순회합니다</li>
                    <li>• 각 소스 URL의 모든 페이지를 탐색하여 축제 링크를 추출합니다</li>
                    <li>• 추출된 링크를 JapantravelUrlExtractionRawData에 'pending' 상태로 저장합니다</li>
                    <li>• 기존 링크는 건너뛰고, 실패한 링크는 재시도 대기열에 추가합니다</li>
                  </ul>
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <h4 className="text-gray-300 text-sm font-bold mb-2">수동 실행 (소스 URL 선택)</h4>
                  <div className="space-y-2">
                    {sourceUrls.length === 0 ? (
                      <p className="text-gray-500 text-sm">저장된 소스 URL이 없습니다</p>
                    ) : (
                      sourceUrls.map((source) => (
                        <div key={source.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{source.name}</p>
                            <p className="text-gray-400 text-xs">{source.country}</p>
                            {source.use_date_parameters && (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-400/50 text-xs mt-1">
                                날짜 파라미터 사용
                              </Badge>
                            )}
                          </div>
                          {source.use_date_parameters ? (
                            <div className="flex gap-2 items-center">
                              <select
                                value={selectedMonths[source.id] || ''}
                                onChange={(e) => {
                                  setSelectedMonths({
                                    ...selectedMonths,
                                    [source.id]: e.target.value
                                  });
                                }}
                                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                              >
                                <option value="">월 선택</option>
                                {Array.from({ length: 12 }, (_, i) => {
                                  const month = String(i + 1).padStart(2, '0');
                                  return (
                                    <option key={month} value={`2026-${month}`}>
                                      2026년 {month}월
                                    </option>
                                  );
                                })}
                              </select>
                              <Button
                                onClick={() => {
                                  if (!selectedMonths[source.id]) {
                                    alert('월을 선택해주세요');
                                    return;
                                  }
                                  runLinkExtractionMutation.mutate({ 
                                    sourceUrlId: source.id,
                                    targetMonth: selectedMonths[source.id]
                                  });
                                }}
                                disabled={!selectedMonths[source.id] || runLinkExtractionMutation.isPending}
                                size="sm"
                                className="bg-cyan-500 hover:bg-cyan-600 whitespace-nowrap"
                              >
                                {runLinkExtractionMutation.isPending ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    추출 중
                                  </>
                                ) : (
                                  '링크 추출'
                                )}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={() => runLinkExtractionMutation.mutate({ sourceUrlId: source.id })}
                              disabled={runLinkExtractionMutation.isPending}
                              size="sm"
                              className="bg-cyan-500 hover:bg-cyan-600"
                            >
                              {runLinkExtractionMutation.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  추출 중
                                </>
                              ) : (
                                '링크 추출'
                              )}
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* 대기열 처리 자동화 */}
            <Card className="bg-gray-900 border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold">2. 대기열 처리</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    대기 중인 축제 링크에서 상세 정보를 추출
                  </p>
                </div>
                {automationsList.find(a => a.name === 'URL 대기열 처리 자동화') && (
                  <Button
                    onClick={() => {
                      const automation = automationsList.find(a => a.name === 'URL 대기열 처리 자동화');
                      toggleAutomationMutation.mutate(automation.id);
                    }}
                    className={automationsList.find(a => a.name === 'URL 대기열 처리 자동화')?.is_active 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-gray-600 hover:bg-gray-700'}
                  >
                    {automationsList.find(a => a.name === 'URL 대기열 처리 자동화')?.is_active ? '활성화됨' : '비활성화됨'}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-purple-900/20 border border-purple-400/30 rounded-lg">
                  <p className="text-purple-400 text-xs font-bold mb-1">📋 동작 방식</p>
                  <ul className="text-gray-300 text-xs space-y-1">
                    <li>• 'pending' 상태의 JapantravelUrlExtractionRawData를 조회합니다 (최대 5개)</li>
                    <li>• 각 링크에서 extractJapantravelFestivalFromUrl 함수를 호출하여 상세 정보를 추출합니다</li>
                    <li>• 성공 시 'processed' 상태로, 실패 시 'failed' 상태로 업데이트합니다</li>
                    <li>• 서버 부하를 방지하기 위해 각 처리 사이에 2초 대기합니다</li>
                  </ul>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-yellow-900/20 border border-yellow-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {rawDataList.filter(r => r.processing_status === 'pending').length}
                    </div>
                    <div className="text-xs text-gray-400">대기 중</div>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {rawDataList.filter(r => r.processing_status === 'processing').length}
                    </div>
                    <div className="text-xs text-gray-400">처리 중</div>
                  </div>
                  <div className="bg-red-900/20 border border-red-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {rawDataList.filter(r => r.processing_status === 'failed').length}
                    </div>
                    <div className="text-xs text-gray-400">실패</div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <h4 className="text-gray-300 text-sm font-bold mb-2">수동 실행</h4>
                  <Button
                    onClick={() => runPendingProcessMutation.mutate(5)}
                    disabled={runPendingProcessMutation.isPending || rawDataList.filter(r => r.processing_status === 'pending').length === 0}
                    className="w-full bg-purple-500 hover:bg-purple-600"
                  >
                    {runPendingProcessMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      `대기열 처리 (최대 5개)`
                    )}
                  </Button>
                </div>
              </div>
            </Card>

            {/* 자동화 상태 */}
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-bold mb-4">자동화 상태</h3>
              <div className="space-y-3">
                {automationsList.length === 0 ? (
                  <p className="text-gray-500 text-sm">자동화가 설정되지 않았습니다</p>
                ) : (
                  automationsList.map((automation) => (
                    <div key={automation.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{automation.name}</p>
                        <p className="text-gray-400 text-xs">
                          {automation.schedule_type === 'simple' 
                            ? `매 ${automation.repeat_interval} ${automation.repeat_unit}마다 실행`
                            : `Cron: ${automation.cron_expression}`}
                        </p>
                      </div>
                      <Badge className={automation.is_active ? 'bg-green-500' : 'bg-gray-600'}>
                        {automation.is_active ? '활성' : '비활성'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <div className="p-4 bg-yellow-900/20 border border-yellow-400/30 rounded-lg">
              <p className="text-yellow-400 text-xs font-bold mb-2">⚠️ 주의사항</p>
              <ul className="text-gray-300 text-xs space-y-1">
                <li>• 자동화는 현재 비활성화 상태로 설정되어 있습니다</li>
                <li>• 활성화하기 전에 충분히 테스트하세요</li>
                <li>• 자동화 주기는 서버 부하와 데이터 업데이트 주기를 고려하여 설정하세요</li>
                <li>• 링크 추출은 페이지 수에 따라 시간이 오래 걸릴 수 있습니다</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}