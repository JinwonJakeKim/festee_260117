import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, CheckSquare, Square, ExternalLink, Loader2, Pencil, Database, XCircle, Search, Calendar, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    link_selector: "div.recommended-event-wrapper a",
    use_date_parameters: false,
    date_parameter_template: ""
  });
  const [imageSelectors, setImageSelectors] = useState({
    thumbnail_selector: "div.coverphoto figure.coverImgWrapper img",
    thumbnail_attribute: "src",
    content_image_selector: "div.article__content figure.shortcode-photo img",
    content_image_attribute: "data-src"
  });
  const [showBatchExtract, setShowBatchExtract] = useState(false);
  const [batchConfig, setBatchConfig] = useState({
    list_page_url: "",
    container_selector: "div.row.small-event-gutter",
    link_selector: "a"
  });
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState({});
  const [selectedMaxPages, setSelectedMaxPages] = useState({});
  const [rawDataSearchQuery, setRawDataSearchQuery] = useState("");
  const [rawDataFilterMonth, setRawDataFilterMonth] = useState("all");
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [deletionProgress, setDeletionProgress] = useState({ isDeleting: false, current: 0, total: 0 });
  
  // Link extraction progress state variables
  const [extractionProgress, setExtractionProgress] = useState({
    isExtracting: false,
    currentPage: 0,
    totalPages: 'auto',
    linksFound: 0,
    elapsedSeconds: 0
  });
  const [extractionAbortController, setExtractionAbortController] = useState(null);

  // Batch extraction progress state
  const [batchExtractionProgress, setBatchExtractionProgress] = useState({
    isExtracting: false,
    currentIndex: 0,
    total: 0,
    currentFestivalName: '',
    succeeded: 0,
    failed: 0,
    isComplete: false
  });
  const [batchExtractionAborted, setBatchExtractionAborted] = useState(false);
  const [isProcessingAutomation, setIsProcessingAutomation] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: rawDataList } = useQuery({
    queryKey: ['japantravelRawData'],
    queryFn: () => base44.entities.JapantravelRawData.list('-created_date'),
    initialData: [],
  });

  const { data: linksList } = useQuery({
    queryKey: ['japantravelLinks'],
    queryFn: () => base44.entities.JapantravelLinks.list('-created_date'),
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

  // 진행 상황 타이머 for link extraction
  React.useEffect(() => {
    if (!extractionProgress.isExtracting) return;

    const timer = setInterval(() => {
      setExtractionProgress(prev => ({
        ...prev,
        elapsedSeconds: prev.elapsedSeconds + 1
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [extractionProgress.isExtracting]);

  const extractMutation = useMutation({
    mutationFn: async ({ url, imageSelectors }) => {
      const { data } = await base44.functions.invoke('extractJapantravelFestivalFromUrl', { 
        url,
        imageSelectors 
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setUrlInput("");
        setActiveTab("rawdataTransform");
        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
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
        setActiveTab("rawdataTransform");
        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
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
      const { data } = await base44.functions.invoke('transformJapantravelRawData', { 
        rawDataIds,
        retransform 
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setSelectedRawIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
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
        await base44.entities.JapantravelRawData.delete(id);
      }
    },
    onSuccess: () => {
      setSelectedRawIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
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
        link_selector: "div.recommended-event-wrapper a",
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
    mutationFn: async ({ sourceUrlId, targetMonth, maxPages, abortSignal }) => {
      const { data } = await base44.functions.invoke('extractJapanLinks', { 
        sourceUrlId,
        targetMonth,
        maxPages
      }, { signal: abortSignal });
      return data;
    },
    onMutate: ({ maxPages }) => {
      setExtractionProgress(prev => ({
        ...prev,
        isExtracting: true,
        currentPage: 0,
        totalPages: maxPages === 'auto' ? 'auto' : maxPages,
        linksFound: 0,
        elapsedSeconds: 0
      }));
    },
    onSuccess: (data) => {
      setExtractionProgress({ isExtracting: false, currentPage: 0, totalPages: 'auto', linksFound: 0, elapsedSeconds: 0 });
      setExtractionAbortController(null);
      
      if (data.success) {
        alert(`✅ 링크 추출 완료!\n\n${data.message}`);
        queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
        setActiveTab("festivalExtraction");
      } else {
        alert(`❌ 링크 추출 실패\n\n${data.error || data.message}`);
      }
    },
    onError: (error) => {
      setExtractionProgress({ isExtracting: false, currentPage: 0, totalPages: 'auto', linksFound: 0, elapsedSeconds: 0 });
      setExtractionAbortController(null);
      
      if (error.name === 'AbortError') {
        alert('링크 추출이 사용자에 의해 중단되었습니다.');
      } else {
        alert(`❌ 링크 추출 중 오류 발생\n\n${error.message}`);
      }
    }
  });

  const processBatchMutation = useMutation({
    mutationFn: async ({ linkIds }) => {
      const { data } = await base44.functions.invoke('startJapantravelBatchExtraction', { 
        linkIds
      });
      return data;
    },
    onSuccess: (data) => {
      setBatchExtractionProgress(prev => ({
        ...prev,
        succeeded: data.succeeded || 0,
        failed: data.failed || 0,
        currentIndex: data.processed || 0,
        total: (data.processed || 0) + (data.remaining || 0),
        isExtracting: false,
        isComplete: data.remaining === 0
      }));

      if (data.success) {
        alert(data.message);
      } else {
        alert(`❌ 일괄 추출 실패\n\n${data.error || data.message}`);
      }

      queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
      queryClient.invalidateQueries({ queryKey: ['japantravelUrlExtractionRawData'] });
    },
    onError: (error) => {
      setBatchExtractionProgress(prev => ({
        ...prev,
        isExtracting: false,
        isComplete: true
      }));
      alert(`❌ 일괄 추출 중 오류 발생\n\n${error.message}`);
      queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
      queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
    }
  });

  const autoTransformMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('autoTransformPendingRawData');
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
        queryClient.invalidateQueries({ queryKey: ['automations'] });
      } else {
        alert(`❌ 자동 변환 실패\n\n${data.error || data.message}`);
      }
    },
    onError: (error) => {
      alert(`❌ 자동 변환 중 오류 발생\n\n${error.message}`);
    }
  });

  const handleBatchExtraction = async () => {
    // 선택된 링크가 있으면 선택된 것만, 없으면 모든 pending/failed 링크 처리
    const targetLinkIds = selectedLinkIds.size > 0 
      ? Array.from(selectedLinkIds)
      : linksList.filter(r => r.processing_status === 'pending' || r.processing_status === 'failed').map(r => r.id);

    if (targetLinkIds.length === 0) {
      alert('처리할 링크가 없습니다');
      return;
    }

    // Japantravel_Extract_Auto 자동화 활성화 및 종료 날짜 설정
    const extractAutoAutomation = automationsList.find(a => a.name === 'Japantravel_Extract_Auto');
    if (extractAutoAutomation) {
      try {
        const { data } = await base44.functions.invoke('enableAutomationWithEndDate', {
          automationId: extractAutoAutomation.id
        });
        console.log('Automation enabled:', data);
      } catch (error) {
        console.error('Failed to enable automation:', error);
      }
    }

    setBatchExtractionAborted(false);
    setBatchExtractionProgress({
      isExtracting: true,
      currentIndex: 0,
      total: targetLinkIds.length,
      currentFestivalName: `자동화 체인 시작 중... (총 ${targetLinkIds.length}개)`,
      succeeded: 0,
      failed: 0,
      isComplete: false
    });

    processBatchMutation.mutate({ linkIds: targetLinkIds });
  };

  const extractDetailMutation = useMutation({
    mutationFn: async ({ linkId, url }) => {
      await base44.entities.JapantravelLinks.update(linkId, {
        processing_status: 'processing'
      });

      const { data } = await base44.functions.invoke('extractJapantravelFestivalFromUrl', { 
        url,
        imageSelectors 
      });
      return { data, linkId };
    },
    onSuccess: async ({ data, linkId }) => {
      if (data.success && data.records_saved > 0) {
        const rawDataRecords = await base44.entities.JapantravelRawData.filter({
          source_url: data.url || linksList.find(l => l.id === linkId)?.url
        }, '-created_date', 1);

        await base44.entities.JapantravelLinks.update(linkId, {
          processing_status: 'processed',
          raw_data_id: rawDataRecords.length > 0 ? rawDataRecords[0].id : null,
          error_message: null
        });
        alert(data.message);
        setExtractingLinkId(null);
        queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
      } else {
        await base44.entities.JapantravelLinks.update(linkId, {
          processing_status: 'failed',
          error_message: data.error || 'No data extracted'
        });
        alert(`상세 추출 실패: ${data.error || 'No data extracted'}`);
        setExtractingLinkId(null);
        queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
      }
    },
    onError: async (error, { linkId }) => {
      await base44.entities.JapantravelLinks.update(linkId, {
        processing_status: 'failed',
        error_message: error.message || 'Unknown error'
      });
      alert('상세 추출 중 오류가 발생했습니다: ' + error.message);
      setExtractingLinkId(null);
      queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
    }
  });

  const handleExtract = async () => {
    if (!urlInput.trim()) {
      alert('URL을 입력해주세요');
      return;
    }
    setIsExtracting(true);
    try {
      await extractMutation.mutateAsync({ url: urlInput, imageSelectors });
      
      const matchingSource = sourceUrls.find(s => s.url === urlInput);
      if (matchingSource) {
        updateSourceUrlMutation.mutate({ id: matchingSource.id, url: urlInput });
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRunLinkExtraction = ({ sourceUrlId, targetMonth, maxPages }) => {
    const controller = new AbortController();
    setExtractionAbortController(controller);
    runLinkExtractionMutation.mutate({ 
      sourceUrlId, 
      targetMonth,
      maxPages,
      abortSignal: controller.signal
    });
  };

  const handleAbortExtraction = () => {
    if (extractionAbortController) {
      extractionAbortController.abort();
      setExtractionAbortController(null);
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
      link_selector: source.link_selector || "div.recommended-event-wrapper a",
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

  const handleAutoTransform = async () => {
    const pendingCount = rawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length;
    
    if (pendingCount === 0) {
      alert('변환할 대기중인 데이터가 없습니다');
      return;
    }

    autoTransformMutation.mutate();
  };

  const handleSelectAllLinks = () => {
    if (selectedLinkIds.size === linksList.length) {
      setSelectedLinkIds(new Set());
    } else {
      setSelectedLinkIds(new Set(linksList.map(r => r.id)));
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

  const handleDeleteSelectedLinks = async () => {
    if (selectedLinkIds.size === 0) {
      alert('삭제할 링크를 선택해주세요');
      return;
    }
    if (!confirm(`선택한 ${selectedLinkIds.size}개의 링크를 삭제하시겠습니까?`)) {
      return;
    }

    const idsToDelete = Array.from(selectedLinkIds);
    setDeletionProgress({ isDeleting: true, current: 0, total: idsToDelete.length });

    try {
      for (let i = 0; i < idsToDelete.length; i++) {
        await base44.entities.JapantravelLinks.delete(idsToDelete[i]);
        setDeletionProgress({ isDeleting: true, current: i + 1, total: idsToDelete.length });
      }
      
      setSelectedLinkIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
      alert('선택한 링크가 모두 삭제되었습니다');
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setDeletionProgress({ isDeleting: false, current: 0, total: 0 });
    }
  };

  const handleDeleteAllLinks = async () => {
    if (linksList.length === 0) {
      alert('삭제할 링크가 없습니다');
      return;
    }
    if (!confirm(`모든 링크 ${linksList.length}개를 삭제하시겠습니까?`)) {
      return;
    }

    const idsToDelete = linksList.map(r => r.id);
    setDeletionProgress({ isDeleting: true, current: 0, total: idsToDelete.length });

    try {
      for (let i = 0; i < idsToDelete.length; i++) {
        await base44.entities.JapantravelLinks.delete(idsToDelete[i]);
        setDeletionProgress({ isDeleting: true, current: i + 1, total: idsToDelete.length });
      }
      
      setSelectedLinkIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
      alert('모든 링크가 삭제되었습니다');
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setDeletionProgress({ isDeleting: false, current: 0, total: 0 });
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `${i + 1}월`
  }));

  // RawData 필터링 (축제정보추출, rawdata변환 탭용)
  const filteredRawDataList = rawDataList.filter(item => {
    if (rawDataSearchQuery.trim()) {
      const q = rawDataSearchQuery.toLowerCase();
      const matches = (
        item.name_original?.toLowerCase().includes(q) ||
        item.address?.toLowerCase().includes(q) ||
        item.city?.toLowerCase().includes(q)
      );
      if (!matches) return false;
    }
    if (rawDataFilterMonth !== "all") {
      const sd = item.start_date;
      if (!sd) return false;
      const month = new Date(sd).getMonth() + 1;
      if (month.toString() !== rawDataFilterMonth) return false;
    }
    return true;
  });

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
      {/* 링크 추출 진행 상황 팝업 */}
      {extractionProgress.isExtracting && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center">
          <Card className="bg-gray-900 border-purple-500/50 p-8 w-96">
            <h3 className="text-white font-bold mb-6 text-center text-xl">링크 추출 진행 중...</h3>
            <div className="space-y-6">
              {/* 진행 상황 바 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-300">
                  <span>예상 진행률</span>
                  <span>
                    {extractionProgress.totalPages === 'auto' 
                      ? '자동 감지 중...' 
                      : `${Math.min(Math.round((extractionProgress.elapsedSeconds / (extractionProgress.totalPages * 2)) * 100), 99)}%`
                    }
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 h-full transition-all duration-1000 animate-pulse"
                    style={{ 
                      width: extractionProgress.totalPages === 'auto' 
                        ? '99%' 
                        : `${Math.min((extractionProgress.elapsedSeconds / (extractionProgress.totalPages * 2)) * 100, 99)}%` 
                    }}
                  />
                </div>
              </div>

              {/* 통계 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-purple-900/30 border border-purple-400/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-purple-400 mb-1">
                    {extractionProgress.totalPages === 'auto' ? '자동' : extractionProgress.totalPages}
                  </div>
                  <div className="text-xs text-gray-400">
                    {extractionProgress.totalPages === 'auto' ? '마지막 페이지 감지' : '최대 페이지'}
                  </div>
                </div>
                <div className="bg-cyan-900/30 border border-cyan-400/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-cyan-400 mb-1">
                    {extractionProgress.elapsedSeconds}초
                  </div>
                  <div className="text-xs text-gray-400">경과 시간</div>
                </div>
              </div>

              {/* 예상 시간 */}
              <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-4">
                <p className="text-blue-400 text-sm text-center">
                  ⏱️ {extractionProgress.totalPages === 'auto' 
                    ? '마지막 페이지를 자동으로 감지합니다' 
                    : `예상 소요 시간: 약 ${extractionProgress.totalPages * 2}초`
                  }
                </p>
                <p className="text-gray-400 text-xs text-center mt-2">
                  페이지당 약 2초가 소요됩니다
                </p>
              </div>

              {/* 로딩 애니메이션 */}
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full bg-cyan-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>

              {/* 중단 버튼 */}
              <Button
                onClick={handleAbortExtraction}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold h-12"
              >
                <XCircle className="w-5 h-5 mr-2" />
                추출 중단
              </Button>
            </div>
          </Card>
        </div>
      )}



      {/* 삭제 진행 상황 팝업 */}
      {deletionProgress.isDeleting && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center">
          <Card className="bg-gray-900 border-gray-700 p-6 w-80">
            <h3 className="text-white font-bold mb-4 text-center">링크 삭제 중...</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-300">
                <span>진행 상황</span>
                <span>{deletionProgress.current} / {deletionProgress.total}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300"
                  style={{ width: `${(deletionProgress.current / deletionProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-center text-gray-400 text-sm">
                {Math.round((deletionProgress.current / deletionProgress.total) * 100)}% 완료
              </p>
            </div>
          </Card>
        </div>
      )}

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
            <TabsTrigger value="festivalExtraction" className="data-[state=active]:bg-pink-500">
              축제정보추출
            </TabsTrigger>
            <TabsTrigger value="rawdataTransform" className="data-[state=active]:bg-pink-500">
              RawData 변환
            </TabsTrigger>
            <TabsTrigger value="automation" className="data-[state=active]:bg-pink-500">
              자동화
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="mt-4 space-y-6">
            <Card className="bg-gray-900 border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-white font-bold text-lg">멀티 URL 추출</h3>
                    <p className="text-gray-400 text-sm mt-0.5">
                      월별로 여러 축제 링크를 한 번에 추출 (자동 또는 수동 페이지 지정)
                    </p>
                  </div>
                </div>
                    <Button
                      onClick={() => setShowAddUrlForm(!showAddUrlForm)}
                      size="sm"
                      className="bg-cyan-500 hover:bg-cyan-600"
                    >
                      {showAddUrlForm ? '취소' : '+ 소스 추가'}
                    </Button>
                  </div>

                {showAddUrlForm && (
                  <Card className="bg-gray-800 border-gray-700 p-4 mb-4">
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
                        placeholder="URL 템플릿"
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
                      <input
                        type="text"
                        placeholder="컨테이너 CSS 선택자 (예: div.row.small-event-gutter)"
                        value={newSourceUrl.container_selector}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, container_selector: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <input
                        type="text"
                        placeholder="링크 CSS 선택자 (예: div.recommended-event-wrapper a)"
                        value={newSourceUrl.link_selector}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, link_selector: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
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

                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {sourceUrls.filter(s => s.use_date_parameters).length === 0 ? (
                      <Card className="bg-gray-800 border-gray-700 p-8 text-center">
                        <p className="text-gray-500 text-sm">등록된 멀티 URL 소스가 없습니다</p>
                        <p className="text-gray-600 text-xs mt-2">상단의 "+ 소스 추가" 버튼으로 날짜 파라미터를 사용하는 소스를 추가하세요</p>
                      </Card>
                    ) : (
                      sourceUrls.filter(s => s.use_date_parameters).map((source) => (
                        <Card
                          key={source.id}
                          className="bg-gray-800 border-gray-700 p-4 hover:bg-gray-750 transition-colors"
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
                                type="text"
                                placeholder="날짜 템플릿"
                                value={editingSourceData.date_parameter_template || ''}
                                onChange={(e) => setEditingSourceData({ ...editingSourceData, date_parameter_template: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs"
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
                            <div>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h5 className="text-white font-bold text-base">{source.name}</h5>
                                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-400/50 text-xs">
                                      {source.country}
                                    </Badge>
                                  </div>
                                  {source.description && (
                                    <p className="text-gray-400 text-sm mb-2">{source.description}</p>
                                  )}
                                  {source.last_used_date && (
                                    <p className="text-gray-600 text-xs">
                                      마지막 사용: {new Date(source.last_used_date).toLocaleDateString('ko-KR')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditSourceUrl(source)}
                                    className="text-yellow-400 hover:text-yellow-300"
                                    title="수정"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSourceUrl(source.id)}
                                    className="text-red-400 hover:text-red-300"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* 월 선택 및 URL 미리보기 */}
                              <div className="space-y-3 bg-gray-900 rounded-lg p-4">
                                <div className="flex items-center gap-3">
                                  <label className="text-gray-400 text-sm font-medium flex-shrink-0">추출 월:</label>
                                  <select
                                    value={selectedMonths[source.id] || ''}
                                    onChange={(e) => {
                                      setSelectedMonths({
                                        ...selectedMonths,
                                        [source.id]: e.target.value
                                      });
                                    }}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                                  >
                                    <option value="">월을 선택하세요</option>
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const month = String(i + 1).padStart(2, '0');
                                      return (
                                        <option key={month} value={`2026-${month}`}>
                                          2026년 {i + 1}월
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>

                                <div className="flex items-center gap-3">
                                  <label className="text-gray-400 text-sm font-medium flex-shrink-0">최대 페이지:</label>
                                  <select
                                    value={selectedMaxPages[source.id] || 'auto'}
                                    onChange={(e) => {
                                      setSelectedMaxPages({
                                        ...selectedMaxPages,
                                        [source.id]: e.target.value
                                      });
                                    }}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                                  >
                                    <option value="auto">자동 (마지막 페이지 감지)</option>
                                    {[1, 2, 3, 5, 10, 15, 20, 25, 30].map((num) => (
                                      <option key={num} value={num}>
                                        {num}페이지
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* 완성된 URL 미리보기 */}
                                {selectedMonths[source.id] && (
                                  <div className="space-y-2">
                                    <label className="text-gray-400 text-xs font-medium">대상 URL:</label>
                                    <div className="bg-black/50 border border-cyan-400/30 rounded-lg p-3">
                                      <p className="text-cyan-400 text-sm font-mono break-all">
                                        {(() => {
                                          const [year, month] = selectedMonths[source.id].split('-');
                                          const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                                          const paddedLastDay = lastDay.toString().padStart(2, '0');
                                          
                                          if (source.date_parameter_template) {
                                            return source.date_parameter_template
                                              .replaceAll('{YYYY}', year)
                                              .replaceAll('{MM}', month)
                                              .replaceAll('{LAST_DAY}', paddedLastDay);
                                          } else {
                                            const url = new URL(source.url);
                                            url.searchParams.set('from', `${year}-${month}-01`);
                                            url.searchParams.set('to', `${year}-${month}-${paddedLastDay}`);
                                            return url.toString();
                                          }
                                        })()}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                <Button
                                  onClick={() => {
                                    if (!selectedMonths[source.id]) {
                                      alert('월을 선택해주세요');
                                      return;
                                    }
                                    handleRunLinkExtraction({
                                      sourceUrlId: source.id,
                                      targetMonth: selectedMonths[source.id],
                                      maxPages: selectedMaxPages[source.id] || 'auto'
                                    });
                                  }}
                                  disabled={!selectedMonths[source.id] || runLinkExtractionMutation.isPending}
                                  className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-base font-bold"
                                >
                                  {runLinkExtractionMutation.isPending ? (
                                    <>
                                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                      링크 추출 중...
                                    </>
                                  ) : (
                                    <>
                                      <ExternalLink className="w-5 h-5 mr-2" />
                                      링크 정보 추출 시작
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      ))
                    )}
                  </div>

              <div className="mt-6 p-4 bg-purple-900/20 border border-purple-400/30 rounded-lg">
                <h4 className="text-purple-400 font-bold mb-2 text-sm">💡 멀티 URL 추출이란?</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• 월별로 여러 축제가 나열된 목록 페이지에서 모든 링크를 한 번에 추출합니다</li>
                  <li>• 월을 선택하면 날짜 파라미터가 적용된 URL이 생성됩니다</li>
                  <li>• <strong className="text-cyan-400">"자동"</strong>을 선택하면 마지막 페이지를 자동으로 감지하여 모든 링크를 추출합니다</li>
                  <li>• 특정 페이지 수를 선택하면 그 페이지까지만 추출하고 중단합니다</li>
                  <li>• 추출된 링크는 "축제정보추출" 탭에서 확인 후 상세 정보를 추출할 수 있습니다</li>
                </ul>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="festivalExtraction" className="mt-4 space-y-4">
            {/* 단일 URL 축제정보추출 */}
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-bold text-lg mb-4">단일 URL 축제정보추출</h3>
              <div className="space-y-4">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://en.japantravel.com/tokyo/festival/..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white"
                  disabled={isExtracting}
                />

                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || !urlInput.trim()}
                  className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-base font-bold"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      축제 정보 추출 중...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-5 h-5 mr-2" />
                      축제 정보 추출 시작
                    </>
                  )}
                </Button>
              </div>
            </Card>

            <Card className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 border-cyan-400/30 p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-cyan-400" />
                  수집된 링크 관리
                </h3>
                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] })}
                  size="sm"
                  variant="outline"
                  className="border-cyan-400 text-cyan-400 hover:bg-cyan-900/20"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  새로고침
                </Button>
              </div>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ URL 추출 탭에서 수집한 링크들을 관리합니다</li>
                <li>✓ 링크를 선택한 후 "축제정보 일괄 추출 시작" 버튼을 클릭하세요</li>
                <li>✓ 선택하지 않으면 모든 대기중인 링크를 처리합니다 (최대 5개)</li>
              </ul>
            </Card>

            {/* 링크 검색 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="URL로 검색..."
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                className="flex-1 h-9 rounded-md border border-gray-800 bg-gray-900 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600 px-3"
              />
              <Button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] })}
                variant="outline"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/20"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* 통계 카드 */}
            <div className="grid grid-cols-4 gap-3">
              <Card className="bg-cyan-900/20 border-cyan-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-400">
                    {linksList.filter(r => r.processing_status === 'pending').length}
                  </div>
                  <div className="text-xs text-gray-400">대기 중</div>
                </div>
              </Card>
              <Card className="bg-blue-900/20 border-blue-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 flex items-center justify-center gap-1">
                    {linksList.filter(r => r.processing_status === 'processing').length}
                    {linksList.filter(r => r.processing_status === 'processing').length > 0 && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                  </div>
                  <div className="text-xs text-gray-400">추출 중</div>
                </div>
              </Card>
              <Card className="bg-green-900/20 border-green-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {linksList.filter(r => r.processing_status === 'processed').length}
                  </div>
                  <div className="text-xs text-gray-400">완료</div>
                </div>
              </Card>
              <Card className="bg-red-900/20 border-red-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {linksList.filter(r => r.processing_status === 'failed').length}
                  </div>
                  <div className="text-xs text-gray-400">실패</div>
                </div>
              </Card>
            </div>



            {/* 일괄 추출 버튼 */}
            {(linksList.filter(r => r.processing_status === 'pending').length > 0 || 
              linksList.filter(r => r.processing_status === 'failed').length > 0) && (
              <Card className="bg-purple-900/20 border-purple-400/30 p-4">
                <h3 className="text-white font-bold mb-2">🤖 축제정보 자동 일괄 추출</h3>
                <p className="text-gray-400 text-sm mb-3">
                  {selectedLinkIds.size > 0 
                    ? `선택한 ${selectedLinkIds.size}개의 링크를 3개씩 자동 처리합니다 (5분 간격)`
                    : `모든 대기중/실패 링크를 3개씩 자동 처리합니다 (5분 간격)`
                  }
                </p>
                <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-3 mb-3">
                  <p className="text-blue-400 text-xs font-bold mb-1">⚡ 자동화 방식</p>
                  <ul className="text-gray-300 text-xs space-y-1">
                    <li>• 첫 3개 즉시 추출 시작</li>
                    <li>• 남은 링크들은 5분마다 3개씩 자동 추출</li>
                    <li>• 브라우저를 닫아도 백엔드에서 계속 진행</li>
                    <li>• 페이지를 새로고침하여 진행 상황 확인</li>
                  </ul>
                </div>
                <Button
                  onClick={handleBatchExtraction}
                  disabled={batchExtractionProgress.isExtracting}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 font-bold"
                >
                  {batchExtractionProgress.isExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      자동화 시작 중...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2" />
                      자동 일괄 추출 시작
                    </>
                  )}
                </Button>
              </Card>
            )}

            {/* 일괄 추출 진행 상황 */}
            {batchExtractionProgress.isExtracting && (
              <Card className="bg-gray-900 border-purple-500/50 p-6">
                <h3 className="text-white font-bold mb-4 text-center text-lg">
                  축제 정보 추출 중...
                </h3>
                
                <div className="space-y-4">
                  {/* 진행 상황 바 */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-300">
                      <span>진행 상황</span>
                      <span>{batchExtractionProgress.currentIndex} / {batchExtractionProgress.total}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 h-full transition-all duration-500"
                        style={{ width: `${(batchExtractionProgress.currentIndex / batchExtractionProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* 현재 처리 중인 축제 */}
                  {batchExtractionProgress.currentFestivalName && (
                    <div className="bg-purple-900/30 border border-purple-400/30 rounded-lg p-3">
                      <p className="text-purple-400 text-xs font-bold mb-1">🎯 현재 처리 중</p>
                      <p className="text-white text-sm break-all">{batchExtractionProgress.currentFestivalName}</p>
                    </div>
                  )}

                  {/* 통계 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-900/30 border border-green-400/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {batchExtractionProgress.succeeded}
                      </div>
                      <div className="text-xs text-gray-400">성공</div>
                    </div>
                    <div className="bg-red-900/30 border border-red-400/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">
                        {batchExtractionProgress.failed}
                      </div>
                      <div className="text-xs text-gray-400">실패</div>
                    </div>
                  </div>

                  {/* 로딩 애니메이션 */}
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* 추출 완료 메시지 */}
            {batchExtractionProgress.isComplete && (
              <Card className={`${
                batchExtractionProgress.failed === 0 ? 'bg-green-900/20 border-green-400/30' : 'bg-yellow-900/20 border-yellow-400/30'
              } border p-4`}>
                <p className={`${
                  batchExtractionProgress.failed === 0 ? 'text-green-400' : 'text-yellow-400'
                } text-center font-bold mb-3`}>
                  {batchExtractionProgress.failed === 0 
                    ? `✅ ${batchExtractionProgress.total}개의 축제 정보를 모두 추출했습니다!`
                    : `⚠️ ${batchExtractionProgress.succeeded}개 성공, ${batchExtractionProgress.failed}개 실패`
                  }
                </p>
                <Button
                  onClick={() => {
                    setBatchExtractionProgress({
                      isExtracting: false,
                      currentIndex: 0,
                      total: 0,
                      currentFestivalName: '',
                      succeeded: 0,
                      failed: 0,
                      isComplete: false
                    });
                    setSelectedLinkIds(new Set());
                  }}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold"
                >
                  확인
                </Button>
              </Card>
            )}

            {/* 상태별 탭 섹션 */}
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="w-full bg-gray-900 grid grid-cols-3">
                <TabsTrigger value="pending" className="data-[state=active]:bg-cyan-500">
                  대기중 ({linksList.filter(r => r.processing_status === 'pending').length})
                </TabsTrigger>
                <TabsTrigger value="processed" className="data-[state=active]:bg-green-500">
                  완료 ({linksList.filter(r => r.processing_status === 'processed').length})
                </TabsTrigger>
                <TabsTrigger value="failed" className="data-[state=active]:bg-red-500">
                  실패 ({linksList.filter(r => r.processing_status === 'failed').length})
                </TabsTrigger>
              </TabsList>

              {/* 대기중 탭 */}
              <TabsContent value="pending" className="mt-4 space-y-3">
                {linksList.filter(r => r.processing_status === 'pending').length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const pendingItems = linksList.filter(r => r.processing_status === 'pending');
                          const pendingIds = new Set(pendingItems.map(r => r.id));
                          const allSelected = pendingItems.every(item => selectedLinkIds.has(item.id));
                          if (allSelected) {
                            setSelectedLinkIds(new Set([...selectedLinkIds].filter(id => !pendingIds.has(id))));
                          } else {
                            setSelectedLinkIds(new Set([...selectedLinkIds, ...pendingIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const pendingItems = linksList.filter(r => r.processing_status === 'pending');
                          const allSelected = pendingItems.every(item => selectedLinkIds.has(item.id));
                          return allSelected ? (
                            <CheckSquare className="w-5 h-5 text-cyan-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          );
                        })()}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedLinkIds.size > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedLinkIds.size}개 선택됨</span>
                      )}
                    </div>

                    {selectedLinkIds.size > 0 && (
                      <Button
                        onClick={handleDeleteSelectedLinks}
                        disabled={deletionProgress.isDeleting}
                        className="w-full bg-red-500 hover:bg-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        선택 삭제 ({selectedLinkIds.size}개)
                      </Button>
                    )}
                  </Card>
                )}

                {linksList.filter(r => r.processing_status === 'pending').length > 0 ? (
                  linksList.filter(r => r.processing_status === 'pending').map((item) => (
                    <Card key={item.id} className={`border-2 ${
                      selectedLinkIds.has(item.id) 
                        ? 'bg-cyan-900/30 border-cyan-400' 
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
                              <h3 className="text-white font-medium">수집된 링크</h3>
                              {getStatusBadge(item.processing_status)}
                            </div>
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.url}
                            </a>
                            <p className="text-gray-500 text-xs">
                              {item.country} · {new Date(item.created_date).toLocaleDateString('ko-KR')}
                            </p>
                          </div>

                          <Button
                            onClick={() => {
                              setExtractingLinkId(item.id);
                              extractDetailMutation.mutate({ linkId: item.id, url: item.url });
                            }}
                            disabled={extractingLinkId === item.id}
                            size="sm"
                            className="bg-purple-500 hover:bg-purple-600 whitespace-nowrap"
                          >
                            {extractingLinkId === item.id ? (
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
                    </Card>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">대기중인 링크가 없습니다.</p>
                )}
              </TabsContent>

              {/* 완료 탭 */}
              <TabsContent value="processed" className="mt-4 space-y-3">
                {linksList.filter(r => r.processing_status === 'processed').length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const processedItems = linksList.filter(r => r.processing_status === 'processed');
                          const processedIds = new Set(processedItems.map(r => r.id));
                          const allSelected = processedItems.every(item => selectedLinkIds.has(item.id));
                          if (allSelected) {
                            setSelectedLinkIds(new Set([...selectedLinkIds].filter(id => !processedIds.has(id))));
                          } else {
                            setSelectedLinkIds(new Set([...selectedLinkIds, ...processedIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const processedItems = linksList.filter(r => r.processing_status === 'processed');
                          const allSelected = processedItems.every(item => selectedLinkIds.has(item.id));
                          return allSelected ? (
                            <CheckSquare className="w-5 h-5 text-cyan-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          );
                        })()}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedLinkIds.size > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedLinkIds.size}개 선택됨</span>
                      )}
                    </div>

                    {selectedLinkIds.size > 0 && (
                      <Button
                        onClick={handleDeleteSelectedLinks}
                        disabled={deletionProgress.isDeleting}
                        className="w-full bg-red-500 hover:bg-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        선택 삭제 ({selectedLinkIds.size}개)
                      </Button>
                    )}
                  </Card>
                )}

                {linksList.filter(r => r.processing_status === 'processed').length > 0 ? (
                  linksList.filter(r => r.processing_status === 'processed').map((item) => (
                    <Card key={item.id} className={`border-2 ${
                      selectedLinkIds.has(item.id) 
                        ? 'bg-green-900/30 border-green-400' 
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
                              <h3 className="text-white font-medium">수집된 링크</h3>
                              {getStatusBadge(item.processing_status)}
                              {item.raw_data_id && (
                                <Badge variant="outline" className="text-green-400 border-green-400">
                                  RawData 생성 완료
                                </Badge>
                              )}
                            </div>
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.url}
                            </a>
                            <p className="text-gray-500 text-xs">
                              {item.country} · {new Date(item.created_date).toLocaleDateString('ko-KR')}
                            </p>
                          </div>

                          <Button
                            onClick={() => {
                              if (confirm('이 링크를 삭제하시겠습니까?')) {
                                base44.entities.JapantravelLinks.delete(item.id);
                                queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
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
                  <p className="text-gray-500 text-sm text-center py-8">완료된 링크가 없습니다.</p>
                )}
              </TabsContent>

              {/* 실패 탭 */}
              <TabsContent value="failed" className="mt-4 space-y-3">
                {linksList.filter(r => r.processing_status === 'failed').length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const failedItems = linksList.filter(r => r.processing_status === 'failed');
                          const failedIds = new Set(failedItems.map(r => r.id));
                          const allSelected = failedItems.every(item => selectedLinkIds.has(item.id));
                          if (allSelected) {
                            setSelectedLinkIds(new Set([...selectedLinkIds].filter(id => !failedIds.has(id))));
                          } else {
                            setSelectedLinkIds(new Set([...selectedLinkIds, ...failedIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const failedItems = linksList.filter(r => r.processing_status === 'failed');
                          const allSelected = failedItems.every(item => selectedLinkIds.has(item.id));
                          return allSelected ? (
                            <CheckSquare className="w-5 h-5 text-cyan-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          );
                        })()}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedLinkIds.size > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedLinkIds.size}개 선택됨</span>
                      )}
                    </div>

                    {selectedLinkIds.size > 0 && (
                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            if (confirm(`선택한 ${selectedLinkIds.size}개 항목을 대기 상태로 되돌리시겠습니까?`)) {
                              for (const id of selectedLinkIds) {
                                await base44.entities.JapantravelLinks.update(id, {
                                  processing_status: 'pending',
                                  error_message: null
                                });
                              }
                              setSelectedLinkIds(new Set());
                              queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
                              alert('대기 상태로 변경되었습니다.');
                            }
                          }}
                          className="flex-1 bg-yellow-500 hover:bg-yellow-600"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          재시도
                        </Button>
                        <Button
                          onClick={handleDeleteSelectedLinks}
                          disabled={deletionProgress.isDeleting}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {linksList.filter(r => r.processing_status === 'failed').length > 0 ? (
                  linksList.filter(r => r.processing_status === 'failed').map((item) => (
                    <Card key={item.id} className={`border-2 ${
                      selectedLinkIds.has(item.id) 
                        ? 'bg-red-900/30 border-red-400' 
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
                              <h3 className="text-white font-medium">수집된 링크</h3>
                              {getStatusBadge(item.processing_status)}
                            </div>
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 text-sm mb-1 block truncate underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.url}
                            </a>
                            <p className="text-gray-500 text-xs">
                              {item.country} · {new Date(item.created_date).toLocaleDateString('ko-KR')}
                            </p>
                            {item.error_message && (
                              <p className="text-red-400 text-xs mt-2 bg-red-900/20 p-2 rounded">❌ {item.error_message}</p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={async () => {
                                if (confirm('이 링크를 다시 추출하시겠습니까?')) {
                                  await base44.entities.JapantravelLinks.update(item.id, {
                                    processing_status: 'pending',
                                    error_message: null
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
                                  alert('대기열에 추가되었습니다.');
                                }
                              }}
                              size="sm"
                              className="bg-yellow-500 hover:bg-yellow-600 text-white"
                              title="재시도"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => {
                                if (confirm('이 링크를 삭제하시겠습니까?')) {
                                  base44.entities.JapantravelLinks.delete(item.id);
                                  queryClient.invalidateQueries({ queryKey: ['japantravelLinks'] });
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
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">실패한 링크가 없습니다.</p>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="rawdataTransform" className="mt-4 space-y-4">
            <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-400/30 p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-purple-400" />
                  RawData를 Festival로 변환
                </h3>
                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] })}
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
                <li>✓ YouTube 하이라이트 영상 & Shorts 자동 검색</li>
                <li>✓ 재변환 시 기존 데이터를 업데이트합니다</li>
              </ul>
            </Card>

            {/* 검색 및 월 필터 */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="축제명, 주소, 도시로 검색..."
                  value={rawDataSearchQuery}
                  onChange={(e) => setRawDataSearchQuery(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-800 bg-gray-900 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-600 px-3"
                />
              </div>
              <Select value={rawDataFilterMonth} onValueChange={setRawDataFilterMonth}>
                <SelectTrigger className="w-28 bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="전체 월" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">전체 월</SelectItem>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-white hover:bg-gray-800 focus:bg-gray-800">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] })}
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-900/20"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* 자동 일괄 변환 버튼 */}
            {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length > 0 && (
              <Card className="bg-purple-900/20 border-purple-400/30 p-4">
                <h3 className="text-white font-bold mb-2">🤖 RawData 자동 일괄 변환</h3>
                <p className="text-gray-400 text-sm mb-3">
                  대기중인 RawData를 1개씩 자동 변환합니다 (5분 간격)
                </p>
                <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-3 mb-3">
                  <p className="text-blue-400 text-xs font-bold mb-1">⚡ 자동화 방식</p>
                  <ul className="text-gray-300 text-xs space-y-1">
                    <li>• 첫 1개 즉시 변환 시작</li>
                    <li>• 남은 RawData는 5분마다 1개씩 자동 변환</li>
                    <li>• 브라우저를 닫아도 백엔드에서 계속 진행</li>
                    <li>• 페이지를 새로고침하여 진행 상황 확인</li>
                  </ul>
                </div>
                <Button
                  onClick={handleAutoTransform}
                  disabled={autoTransformMutation.isPending}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 font-bold"
                >
                  {autoTransformMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      자동화 시작 중...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2" />
                      자동 일괄 변환 시작
                    </>
                  )}
                </Button>
              </Card>
            )}



            {/* 통계 카드 - 3개 (대기중, 완료, 실패) */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-yellow-900/20 border-yellow-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length}
                  </div>
                  <div className="text-xs text-gray-400">대기중</div>
                </div>
              </Card>
              <Card className="bg-green-900/20 border-green-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {filteredRawDataList.filter(r => r.processing_status === 'processed').length}
                  </div>
                  <div className="text-xs text-gray-400">완료</div>
                </div>
              </Card>
              <Card className="bg-red-900/20 border-red-400/30 p-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {filteredRawDataList.filter(r => r.processing_status === 'failed').length}
                  </div>
                  <div className="text-xs text-gray-400">실패</div>
                </div>
              </Card>
            </div>



            {/* 상태별 탭 섹션 */}
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="w-full bg-gray-900 grid grid-cols-3">
                <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-500">
                  대기중 ({filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length})
                </TabsTrigger>
                <TabsTrigger value="processed" className="data-[state=active]:bg-green-500">
                  완료 ({filteredRawDataList.filter(r => r.processing_status === 'processed').length})
                </TabsTrigger>
                <TabsTrigger value="failed" className="data-[state=active]:bg-red-500">
                  실패 ({filteredRawDataList.filter(r => r.processing_status === 'failed').length})
                </TabsTrigger>
              </TabsList>

              {/* 대기중 탭 */}
              <TabsContent value="pending" className="mt-4 space-y-3">
                {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const pendingItems = filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "");
                          const pendingIds = new Set(pendingItems.map(r => r.id));
                          const allSelected = pendingItems.every(item => selectedRawIds.has(item.id));
                          if (allSelected) {
                            setSelectedRawIds(new Set([...selectedRawIds].filter(id => !pendingIds.has(id))));
                          } else {
                            setSelectedRawIds(new Set([...selectedRawIds, ...pendingIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const pendingItems = filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "");
                          const allSelected = pendingItems.every(item => selectedRawIds.has(item.id));
                          return allSelected ? (
                            <CheckSquare className="w-5 h-5 text-cyan-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          );
                        })()}
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
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />변환 중...</>
                          ) : (
                            <><RefreshCw className="w-4 h-4 mr-2" />변환</>
                          )}
                        </Button>
                        <Button onClick={handleDelete} disabled={deleteRawDataMutation.isPending} className="bg-red-500 hover:bg-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length > 0 ? (
                  filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").map((item) => (
                    <Card key={item.id} className={`border-2 ${selectedRawIds.has(item.id) ? 'bg-yellow-900/30 border-yellow-400' : 'bg-gray-900 border-gray-800'}`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button onClick={() => handleSelectItem(item.id)} className="flex-shrink-0 mt-1">
                            {selectedRawIds.has(item.id) ? <CheckSquare className="w-6 h-6 text-cyan-400" /> : <Square className="w-6 h-6 text-gray-600" />}
                          </button>
                          {item.thumbnail_url && (
                            <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                              {getStatusBadge(item.processing_status)}
                              {!item.festival_id && <Badge className="bg-purple-900/50 text-purple-400 border border-purple-400/50">신규</Badge>}
                            </div>
                            <div className="space-y-1 text-sm text-gray-400">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" />
                                <span>{item.address || item.city || '주소 없음'}{item.city ? `, ${item.city}` : ''}</span>
                              </div>
                              <p className="text-xs text-gray-500">수집: {new Date(item.created_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            {item.error_message && <p className="text-yellow-400 text-xs mt-2">⚠️ {item.error_message}</p>}
                          </div>
                          <Button onClick={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate([item.id]); }} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">대기중인 데이터가 없습니다.</p>
                )}
              </TabsContent>


              {/* 완료 탭 */}
              <TabsContent value="processed" className="mt-4 space-y-3">
                {filteredRawDataList.filter(r => r.processing_status === 'processed').length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const processedItems = filteredRawDataList.filter(r => r.processing_status === 'processed');
                          const processedIds = new Set(processedItems.map(r => r.id));
                          const allSelected = processedItems.every(item => selectedRawIds.has(item.id));
                          if (allSelected) {
                            setSelectedRawIds(new Set([...selectedRawIds].filter(id => !processedIds.has(id))));
                          } else {
                            setSelectedRawIds(new Set([...selectedRawIds, ...processedIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const processedItems = filteredRawDataList.filter(r => r.processing_status === 'processed');
                          const allSelected = processedItems.every(item => selectedRawIds.has(item.id));
                          return allSelected ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />;
                        })()}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedRawIds.size > 0 && <span className="text-cyan-400 text-sm">{selectedRawIds.size}개 선택됨</span>}
                    </div>
                    {selectedRawIds.size > 0 && (
                      <div className="flex gap-2">
                        <Button onClick={handleRetransform} disabled={transformMutation.isPending} className="flex-1 bg-purple-500 hover:bg-purple-600">
                          {transformMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />재변환 중...</> : <><RefreshCw className="w-4 h-4 mr-2" />재변환</>}
                        </Button>
                        <Button onClick={handleDelete} disabled={deleteRawDataMutation.isPending} className="bg-red-500 hover:bg-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                )}
                {filteredRawDataList.filter(r => r.processing_status === 'processed').length > 0 ? (
                  filteredRawDataList.filter(r => r.processing_status === 'processed').map((item) => (
                    <Card key={item.id} className={`border-2 ${selectedRawIds.has(item.id) ? 'bg-green-900/30 border-green-400' : 'bg-gray-900 border-gray-800'}`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button onClick={() => handleSelectItem(item.id)} className="flex-shrink-0 mt-1">
                            {selectedRawIds.has(item.id) ? <CheckSquare className="w-6 h-6 text-cyan-400" /> : <Square className="w-6 h-6 text-gray-600" />}
                          </button>
                          {item.thumbnail_url && (
                            <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                              {getStatusBadge(item.processing_status)}
                              {item.festival_id && <Badge variant="outline" className="text-green-400 border-green-400 text-xs">✓ Festival ID: {item.festival_id}</Badge>}
                            </div>
                            <div className="space-y-1 text-sm text-gray-400">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" />
                                <span>{item.address || item.city || '주소 없음'}{item.city && item.address ? `, ${item.city}` : ''}</span>
                              </div>
                              <p className="text-xs text-gray-500">수집: {new Date(item.updated_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button onClick={() => { setSelectedRawIds(new Set([item.id])); handleRetransform(); }} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" title="재변환">
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button onClick={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate([item.id]); }} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">완료된 데이터가 없습니다.</p>
                )}
              </TabsContent>

                {/* 실패 탭 */}
                <TabsContent value="failed" className="mt-4 space-y-3">
                {filteredRawDataList.filter(r => r.processing_status === 'failed').length > 0 && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          const failedItems = filteredRawDataList.filter(r => r.processing_status === 'failed');
                          const failedIds = new Set(failedItems.map(r => r.id));
                          const allSelected = failedItems.every(item => selectedRawIds.has(item.id));
                          if (allSelected) {
                            setSelectedRawIds(new Set([...selectedRawIds].filter(id => !failedIds.has(id))));
                          } else {
                            setSelectedRawIds(new Set([...selectedRawIds, ...failedIds]));
                          }
                        }}
                        className="flex items-center gap-2 text-white hover:text-cyan-400"
                      >
                        {(() => {
                          const failedItems = filteredRawDataList.filter(r => r.processing_status === 'failed');
                          const allSelected = failedItems.every(item => selectedRawIds.has(item.id));
                          return allSelected ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />;
                        })()}
                        <span className="font-medium">전체 선택</span>
                      </button>
                      {selectedRawIds.size > 0 && (
                        <span className="text-cyan-400 text-sm">{selectedRawIds.size}개 선택됨</span>
                      )}
                    </div>

                    {selectedRawIds.size > 0 && (
                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            if (confirm(`선택한 ${selectedRawIds.size}개 항목을 대기 상태로 되돌리시겠습니까?`)) {
                              for (const id of selectedRawIds) {
                                await base44.entities.JapantravelRawData.update(id, {
                                  processing_status: 'pending',
                                  error_message: null
                                });
                              }
                              setSelectedRawIds(new Set());
                              queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
                              alert('대기 상태로 변경되었습니다.');
                            }
                          }}
                          className="flex-1 bg-yellow-500 hover:bg-yellow-600"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          재시도
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

                {filteredRawDataList.filter(r => r.processing_status === 'failed').length > 0 ? (
                  filteredRawDataList.filter(r => r.processing_status === 'failed').map((item) => (
                    <Card key={item.id} className={`border-2 ${selectedRawIds.has(item.id) ? 'bg-red-900/30 border-red-400' : 'bg-gray-900 border-gray-800'}`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <button onClick={() => handleSelectItem(item.id)} className="flex-shrink-0 mt-1">
                            {selectedRawIds.has(item.id) ? <CheckSquare className="w-6 h-6 text-cyan-400" /> : <Square className="w-6 h-6 text-gray-600" />}
                          </button>
                          {item.thumbnail_url && (
                            <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                              {getStatusBadge(item.processing_status)}
                            </div>
                            <div className="space-y-1 text-sm text-gray-400">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" />
                                <span>{item.address || item.city || '주소 없음'}{item.city && item.address ? `, ${item.city}` : ''}</span>
                              </div>
                              <p className="text-xs text-gray-500">수집: {new Date(item.updated_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            {item.error_message && <p className="text-red-400 text-xs mt-2 bg-red-900/20 p-2 rounded">❌ {item.error_message}</p>}
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={async () => {
                                if (confirm('이 데이터를 다시 변환하시겠습니까?')) {
                                  await base44.entities.JapantravelRawData.update(item.id, { processing_status: 'pending', error_message: null });
                                  queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
                                  alert('대기열에 추가되었습니다.');
                                }
                              }}
                              size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white" title="재시도"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button onClick={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate([item.id]); }} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">실패한 데이터가 없습니다.</p>
                )}
                </TabsContent>
                </Tabs>

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
                    <li>• 각 소스 URL의 최대 5페이지를 탐색하여 축제 링크를 추출합니다</li>
                    <li>• 추출된 링크를 JapantravelLinks에 'pending' 상태로 저장합니다</li>
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
                              <select
                                value={selectedMaxPages[source.id] || 'auto'}
                                onChange={(e) => {
                                  setSelectedMaxPages({
                                    ...selectedMaxPages,
                                    [source.id]: e.target.value
                                  });
                                }}
                                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs w-20"
                              >
                                <option value="auto">자동</option>
                                {[1, 2, 3, 5, 10, 15, 20, 25, 30].map((num) => (
                                  <option key={num} value={num}>
                                    {num}p
                                  </option>
                                ))}
                              </select>
                              <Button
                                onClick={() => {
                                  if (!selectedMonths[source.id]) {
                                    alert('월을 선택해주세요');
                                    return;
                                  }
                                  handleRunLinkExtraction({
                                    sourceUrlId: source.id,
                                    targetMonth: selectedMonths[source.id],
                                    maxPages: selectedMaxPages[source.id] || 'auto'
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
                              onClick={() => handleRunLinkExtraction({ sourceUrlId: source.id, maxPages: 'auto' })}
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
                  <h3 className="text-white font-bold">2. 대기열 처리 자동화</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    5분마다 자동으로 대기 중인 링크 5개씩 처리
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
                    <li>• 매 5분마다 자동으로 실행됩니다 (1:00, 1:05, 1:10...)</li>
                    <li>• 'pending' 상태의 JapantravelLinks를 조회합니다 (최대 5개)</li>
                    <li>• 각 링크에서 extractJapantravelFestivalFromUrl 함수를 호출하여 상세 정보를 추출합니다</li>
                    <li>• 성공 시 'processed' 상태로, 실패 시 'failed' 상태로 업데이트합니다</li>
                  </ul>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-cyan-900/20 border border-cyan-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-cyan-400">
                      {linksList.filter(r => r.processing_status === 'pending').length}
                    </div>
                    <div className="text-xs text-gray-400">대기 중</div>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {linksList.filter(r => r.processing_status === 'processing').length}
                    </div>
                    <div className="text-xs text-gray-400">처리 중</div>
                  </div>
                  <div className="bg-red-900/20 border border-red-400/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {linksList.filter(r => r.processing_status === 'failed').length}
                    </div>
                    <div className="text-xs text-gray-400">실패</div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-3">
                  <h4 className="text-gray-300 text-sm font-bold mb-2">수동 실행</h4>
                  <p className="text-gray-400 text-xs mb-3">
                    {selectedLinkIds.size > 0 
                      ? `선택한 ${selectedLinkIds.size}개의 링크를 처리합니다`
                      : '모든 대기 중인 링크를 처리합니다 (최대 5개)'
                    }
                  </p>
                  <Button
                    onClick={handleBatchExtraction}
                    disabled={batchExtractionProgress.isExtracting || linksList.filter(r => r.processing_status === 'pending').length === 0}
                    className="w-full bg-purple-500 hover:bg-purple-600"
                  >
                    {batchExtractionProgress.isExtracting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      `축제정보 일괄 추출 시작`
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
                <li>• 링크 추출은 최대 5페이지까지만 진행됩니다</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}