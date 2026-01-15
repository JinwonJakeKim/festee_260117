import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, CheckSquare, Square, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createPageUrl } from "@/utils";

export default function AdminUrlExtraction() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("extract");
  const [urlInput, setUrlInput] = useState("");
  const [selectedRawIds, setSelectedRawIds] = useState(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [showAddUrlForm, setShowAddUrlForm] = useState(false);
  const [newSourceUrl, setNewSourceUrl] = useState({ name: "", url: "", country: "", description: "" });

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: rawDataList } = useQuery({
    queryKey: ['urlExtractionRawData'],
    queryFn: () => base44.entities.UrlExtractionRawData.list('-created_date'),
    initialData: [],
  });

  const { data: sourceUrls } = useQuery({
    queryKey: ['festivalSourceUrls'],
    queryFn: () => base44.entities.FestivalSourceUrl.list('-created_date'),
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
      const { data } = await base44.functions.invoke('extractFestivalFromUrl', { url });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setUrlInput("");
        setActiveTab("data");
        queryClient.invalidateQueries({ queryKey: ['urlExtractionRawData'] });
      } else {
        alert(`추출 실패: ${data.error}\n${data.message || ''}`);
      }
    },
    onError: (error) => {
      alert('추출 중 오류가 발생했습니다: ' + error.message);
    }
  });

  const transformMutation = useMutation({
    mutationFn: async ({ rawDataIds, retransform = false }) => {
      const { data } = await base44.functions.invoke('transformUrlExtractionData', { 
        rawDataIds,
        retransform 
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        alert(data.message);
        setSelectedRawIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['urlExtractionRawData'] });
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
        await base44.entities.UrlExtractionRawData.delete(id);
      }
    },
    onSuccess: () => {
      setSelectedRawIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['urlExtractionRawData'] });
      alert('선택한 데이터가 삭제되었습니다');
    }
  });

  const addSourceUrlMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.FestivalSourceUrl.create(data);
    },
    onSuccess: () => {
      setShowAddUrlForm(false);
      setNewSourceUrl({ name: "", url: "", country: "", description: "" });
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

  const handleAddSourceUrl = () => {
    if (!newSourceUrl.name || !newSourceUrl.url || !newSourceUrl.country) {
      alert('이름, URL, 국가를 모두 입력해주세요');
      return;
    }
    addSourceUrlMutation.mutate(newSourceUrl);
  };

  const handleDeleteSourceUrl = (id) => {
    if (confirm('이 소스 URL을 삭제하시겠습니까?')) {
      deleteSourceUrlMutation.mutate(id);
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
            <h1 className="text-xl font-bold text-white">URL 축제 정보 추출</h1>
            <p className="text-gray-400 text-sm">웹페이지에서 축제 정보 자동 추출</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-gray-900 grid grid-cols-2">
            <TabsTrigger value="extract" className="data-[state=active]:bg-pink-500">
              URL 추출
            </TabsTrigger>
            <TabsTrigger value="data" className="data-[state=active]:bg-pink-500">
              데이터 관리
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
                </ul>
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
                      <input
                        type="text"
                        placeholder="설명 (선택)"
                        value={newSourceUrl.description}
                        onChange={(e) => setNewSourceUrl({ ...newSourceUrl, description: e.target.value })}
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

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sourceUrls.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">저장된 URL이 없습니다</p>
                  ) : (
                    sourceUrls.map((source) => (
                      <Card
                        key={source.id}
                        className="bg-gray-800 border-gray-700 p-3 hover:bg-gray-750 transition-colors cursor-pointer"
                        onClick={() => handleSelectSourceUrl(source)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-white font-medium text-sm truncate">{source.name}</h5>
                              <Badge className="bg-pink-500/20 text-pink-400 border-pink-400/50 text-xs">
                                {source.country}
                              </Badge>
                            </div>
                            <p className="text-gray-400 text-xs truncate mb-1">{source.url}</p>
                            {source.description && (
                              <p className="text-gray-500 text-xs">{source.description}</p>
                            )}
                            {source.last_used_date && (
                              <p className="text-gray-600 text-xs mt-1">
                                마지막 사용: {new Date(source.last_used_date).toLocaleDateString('ko-KR')}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSourceUrl(source.id);
                            }}
                            className="flex-shrink-0 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="mt-4">
            {rawDataList.length > 0 && (
              <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
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
                      <RefreshCw className="w-4 h-4 mr-2" />
                      변환
                    </Button>
                    <Button
                      onClick={handleRetransform}
                      disabled={transformMutation.isPending}
                      className="flex-1 bg-purple-500 hover:bg-purple-600"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      재변환
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

            <div className="space-y-3">
              {rawDataList.map((item) => (
                <Card key={item.id} className={`border p-4 ${
                  selectedRawIds.has(item.id) 
                    ? 'bg-cyan-900/20 border-cyan-400' 
                    : 'bg-gray-900 border-gray-800'
                }`}>
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
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(item.processing_status)}
                        <h3 className="text-white font-bold">
                          {item.extracted_data?.name_ko || item.extracted_data?.name_original || '이름 없음'}
                        </h3>
                      </div>
                      <p className="text-gray-400 text-sm mb-2 truncate">
                        {item.source_url}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
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
                  </div>
                </Card>
              ))}

              {rawDataList.length === 0 && (
                <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                  <p className="text-gray-500">추출된 데이터가 없습니다</p>
                  <p className="text-gray-600 text-sm mt-2">"URL 추출" 탭에서 시작하세요</p>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}