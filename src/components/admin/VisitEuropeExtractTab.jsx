import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ExternalLink, CheckSquare, Square, Trash2, RefreshCw, Calendar, MapPin,
} from "lucide-react";

export default function VisitEuropeExtractTab({
  urlInput,
  setUrlInput,
  handleExtract,
  isExtracting,
  rawDataList,
  queryClient,
  deleteRawDataMutation,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentlyExtractingIds, setCurrentlyExtractingIds] = useState(new Set());
  const [batchProgress, setBatchProgress] = useState({ isRunning: false, current: 0, total: 0, succeeded: 0, failed: 0 });

  const pendingList = rawDataList.filter(r => r.extract_status === 'pending' && !currentlyExtractingIds.has(r.id));
  const extractingList = rawDataList.filter(r => currentlyExtractingIds.has(r.id));
  const processedList = rawDataList.filter(r => r.extract_status === 'processed');
  const failedList = rawDataList.filter(r => r.extract_status === 'failed');

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = (list) => {
    const ids = new Set(list.map(r => r.id));
    const allSelected = list.every(item => selectedIds.has(item.id));
    setSelectedIds(allSelected
      ? new Set([...selectedIds].filter(id => !ids.has(id)))
      : new Set([...selectedIds, ...ids]));
  };

  const runBatchExtract = async (ids) => {
    if (ids.length === 0) { alert('추출할 항목을 선택해주세요'); return; }
    setBatchProgress({ isRunning: true, current: 0, total: ids.length, succeeded: 0, failed: 0 });
    let succeeded = 0, failed = 0;
    for (let i = 0; i < ids.length; i++) {
      const item = rawDataList.find(r => r.id === ids[i]);
      if (!item) continue;
      setCurrentlyExtractingIds(prev => new Set([...prev, item.id]));
      try {
        const { data } = await base44.functions.invoke('extractVisitEuropeFestivalFromUrl', { url: item.source_url });
        if (data?.success) succeeded++; else failed++;
      } catch (e) {
        failed++;
      }
      setCurrentlyExtractingIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
      setBatchProgress(prev => ({ ...prev, current: i + 1, succeeded, failed }));
      queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
    }
    setBatchProgress(prev => ({ ...prev, isRunning: false }));
    setSelectedIds(new Set());
    alert(`일괄 추출 완료: 성공 ${succeeded}개, 실패 ${failed}개`);
  };

  const handleRetry = async (id) => {
    await base44.entities.VisitEuropeRawData.update(id, { extract_status: 'pending', error_message: null });
    queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] });
  };

  const ItemCard = ({ item, isExtractingNow }) => (
    <Card key={item.id} className={`border-2 ${selectedIds.has(item.id) ? 'bg-cyan-900/30 border-cyan-400' : 'bg-gray-900 border-gray-800'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {!isExtractingNow && (
            <button onClick={() => toggleSelect(item.id)} className="flex-shrink-0 mt-1">
              {selectedIds.has(item.id) ? <CheckSquare className="w-6 h-6 text-cyan-400" /> : <Square className="w-6 h-6 text-gray-600" />}
            </button>
          )}
          {item.source_image_url && (
            <img src={item.source_image_url} alt={item.source_title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-white font-bold truncate">{item.source_title || '이름 없음'}</h3>
              {isExtractingNow && (
                <Badge className="bg-blue-600 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 추출 중
                </Badge>
              )}
            </div>
            <div className="space-y-0.5 text-xs text-gray-400">
              {(item.source_city || item.source_country) && (
                <p className="flex items-center gap-1"><MapPin className="w-3 h-3 text-pink-400" />{item.source_city}{item.source_country ? `, ${item.source_country}` : ''}</p>
              )}
              {item.source_start_date && (
                <p className="flex items-center gap-1"><Calendar className="w-3 h-3 text-green-400" />{item.source_start_date} ~ {item.source_end_date}</p>
              )}
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 truncate underline">
                <ExternalLink className="w-3 h-3 flex-shrink-0" />{item.source_url}
              </a>
            </div>
            {item.error_message && <p className="text-red-400 text-xs mt-2 bg-red-900/20 p-2 rounded">❌ {item.error_message}</p>}
          </div>
          {item.extract_status === 'failed' && (
            <div className="flex flex-col gap-2">
              <Button onClick={() => handleRetry(item.id)} size="sm" className="bg-yellow-500 hover:bg-yellow-600" title="재시도">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button onClick={() => { if (confirm('삭제하시겠습니까?')) deleteRawDataMutation.mutate([item.id]); }} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
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

      {batchProgress.isRunning && (
        <Card className="bg-gray-900 border-purple-500/50 p-4">
          <div className="flex justify-between text-sm text-gray-300 mb-2">
            <span>일괄 추출 진행 중...</span>
            <span>{batchProgress.current} / {batchProgress.total}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 h-full transition-all duration-300"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        </Card>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full bg-gray-900 grid grid-cols-4">
          <TabsTrigger value="pending" className="data-[state=active]:bg-cyan-500">대기중 ({pendingList.length})</TabsTrigger>
          <TabsTrigger value="extracting" className="data-[state=active]:bg-blue-500">추출중 ({extractingList.length})</TabsTrigger>
          <TabsTrigger value="processed" className="data-[state=active]:bg-green-500">완료 ({processedList.length})</TabsTrigger>
          <TabsTrigger value="failed" className="data-[state=active]:bg-red-500">실패 ({failedList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {pendingList.length > 0 && (
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => toggleSelectAll(pendingList)} className="flex items-center gap-2 text-white hover:text-cyan-400">
                  {pendingList.every(item => selectedIds.has(item.id)) ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
                  <span className="font-medium">전체 선택</span>
                </button>
                {selectedIds.size > 0 && <span className="text-cyan-400 text-sm">{selectedIds.size}개 선택됨</span>}
              </div>
              <Button
                onClick={() => runBatchExtract(selectedIds.size > 0 ? Array.from(selectedIds) : pendingList.map(r => r.id))}
                disabled={batchProgress.isRunning}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 font-bold"
              >
                {batchProgress.isRunning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />일괄 추출 중...</>
                ) : (
                  <><ExternalLink className="w-4 h-4 mr-2" />
                    {selectedIds.size > 0 ? `선택한 ${selectedIds.size}개 일괄 추출` : `대기중인 ${pendingList.length}개 전체 일괄 추출`}
                  </>
                )}
              </Button>
            </Card>
          )}
          {pendingList.length > 0 ? (
            pendingList.map(item => <ItemCard key={item.id} item={item} isExtractingNow={false} />)
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">대기중인 항목이 없습니다.</p>
          )}
        </TabsContent>

        <TabsContent value="extracting" className="mt-4 space-y-3">
          {extractingList.length > 0 ? (
            extractingList.map(item => <ItemCard key={item.id} item={item} isExtractingNow={true} />)
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">추출 중인 항목이 없습니다.</p>
          )}
        </TabsContent>

        <TabsContent value="processed" className="mt-4 space-y-3">
          {processedList.length > 0 ? (
            processedList.map(item => <ItemCard key={item.id} item={item} isExtractingNow={false} />)
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">완료된 항목이 없습니다.</p>
          )}
        </TabsContent>

        <TabsContent value="failed" className="mt-4 space-y-3">
          {failedList.length > 0 ? (
            failedList.map(item => <ItemCard key={item.id} item={item} isExtractingNow={false} />)
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">실패한 항목이 없습니다.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}