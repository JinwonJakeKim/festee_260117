import React, { useState } from "react";
import { RefreshCw, Trash2, CheckSquare, Square, Loader2, Calendar, MapPin, Database, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";

const months = Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}월` }));

const getStatusBadge = (status) => {
  switch (status) {
    case 'pending': return <Badge className="bg-gray-600">대기중</Badge>;
    case 'processing': return <Badge className="bg-blue-600">처리중</Badge>;
    case 'processed': return <Badge className="bg-green-600">완료</Badge>;
    case 'failed': return <Badge className="bg-red-600">실패</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

export default function JapantravelRawDataTab({
  filteredRawDataList,
  rawDataList,
  selectedRawIds,
  setSelectedRawIds,
  transformMutation,
  deleteRawDataMutation,
  autoTransformMutation,
  handleTransform,
  handleRetransform,
  handleDelete,
  handleAutoTransform,
  handleSelectItem,
  rawDataSearchQuery,
  setRawDataSearchQuery,
  rawDataFilterMonth,
  setRawDataFilterMonth,
  queryClient,
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      {/* 설명 카드 */}
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
          <li>✓ 재변환 시 기존 데이터를 업데이트합니다 <span className="text-yellow-300">(단, summary/description 번역은 스킵하여 API 비용 절약 — name/city/country만 재번역)</span></li>
        </ul>

        {/* 더보기 버튼 */}
        <button
          onClick={() => setShowDetails(prev => !prev)}
          className="mt-3 flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs font-medium transition-colors"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDetails ? '접기' : '상세 로직 더보기'}
        </button>

        {showDetails && (
          <>
            <div className="mt-3 bg-blue-900/20 border border-blue-400/30 rounded-lg p-3">
              <p className="text-blue-400 font-bold text-xs mb-2">🎬 YouTube 검색 쿼리 로직</p>
              <ul className="text-gray-300 text-xs space-y-1">
                <li>• <span className="text-yellow-300">원본 언어가 일본어(ja)</span>인 경우: <span className="text-cyan-300">1차 일본어명</span>으로만 검색</li>
                <li>• <span className="text-yellow-300">원본 언어가 영어 등(en)</span>인 경우: <span className="text-cyan-300">1차 영어 원본명</span>으로만 검색</li>
                <li>• <span className="text-red-400 font-bold">⚠️ 2차 언어 쿼리 현재 비활성화됨</span> <span className="text-gray-400">(숏츠 부족 시 반대 언어 재검색 기능 — 별도 지시 전까지 off)</span></li>
                <li>• 연도(20XX) 제거 후 검색, 축제 관련 키워드 없으면 자동 추가 (festival / 祭り)</li>
                <li>• <span className="text-green-300">축제명에 도시명이 없으면 쿼리 끝에 도시명 자동 추가</span> <span className="text-gray-400">(예: "THE MEAT festival Kanagawa")</span></li>
                <li>• 숏츠는 최대 20개 수집, 1차+2차 합산하여 중복 제거</li>
              </ul>
            </div>
            <div className="mt-2 bg-yellow-900/20 border border-yellow-400/30 rounded-lg p-3">
              <p className="text-yellow-400 font-bold text-xs mb-2">🎯 하이라이트 영상 관련성 점수 로직</p>
              <ul className="text-gray-300 text-xs space-y-1">
                <li>• 축제명에서 <span className="text-red-300">festival, matsuri, 연도(20XX), 일반 도시명</span> 등을 제거한 고유명사를 <span className="text-yellow-300">핵심 키워드</span>로 추출</li>
                <li>• 예: <span className="text-gray-400">"Shinagawa Kids Family Terrace festival Tokyo 2026"</span> → 핵심키워드: <span className="text-cyan-300">shinagawa, kids, family, terrace</span></li>
                <li>• 각 핵심 키워드가 영상 <span className="text-green-300">제목(title) 또는 설명(description)</span>에 포함되면 1점씩 부여</li>
                <li>• <span className="text-yellow-300">score ≥ 1인 영상만 하이라이트 후보로 채택</span> — 미달 시 하이라이트 영상 없음으로 처리 (기존 영상도 삭제)</li>
                <li>• 점수 높은 순 → 공공기관 채널 우선 → YouTube 관련성 순서로 최종 선택</li>
              </ul>
            </div>
            <div className="mt-2 bg-red-900/20 border border-red-400/30 rounded-lg p-3">
              <p className="text-red-400 font-bold text-xs mb-1">🚫 하이라이트 영상 블랙리스트 키워드</p>
              <p className="text-gray-400 text-xs">영상 제목에 아래 키워드가 포함된 경우 하이라이트 영상에서 자동 제외됩니다:</p>
              <p className="text-red-300 text-xs font-mono mt-1">Idol, dance, 아이돌, 공연, 춤</p>
            </div>
            <div className="mt-2 bg-green-900/20 border border-green-400/30 rounded-lg p-3">
              <p className="text-green-400 font-bold text-xs mb-1">📱 YouTube Shorts 수집 로직</p>
              <ul className="text-gray-300 text-xs space-y-1">
                <li>• <span className="text-yellow-300">score ≥ 1</span>인 숏츠만 채택 (하이라이트와 동일한 관련성 필터링)</li>
                <li>• 상위 5개 숏츠 중 score ≥ 1인 것의 조회수만 합산 → <code className="bg-gray-800 px-1 rounded">shorts_views_5_total</code> 저장</li>
                <li>• <span className="text-green-300">하이라이트 영상과 동일한 videoId는 숏츠 목록에서 자동 제외</span> (중복 방지)</li>
              </ul>
            </div>
          </>
        )}
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
          <p className="text-gray-400 text-sm mb-3">대기중인 RawData를 1개씩 자동 변환합니다 (5분 간격)</p>
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
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />자동화 시작 중...</>
            ) : (
              <><RefreshCw className="w-5 h-5 mr-2" />자동 일괄 변환 시작</>
            )}
          </Button>
        </Card>
      )}

      {/* 통계 카드 */}
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

      {/* 상태별 탭 */}
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

        {/* 대기중 */}
        <TabsContent value="pending" className="mt-4 space-y-3">
          {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").length > 0 && (
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    const items = filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "");
                    const ids = new Set(items.map(r => r.id));
                    const allSelected = items.every(item => selectedRawIds.has(item.id));
                    setSelectedRawIds(allSelected ? new Set([...selectedRawIds].filter(id => !ids.has(id))) : new Set([...selectedRawIds, ...ids]));
                  }}
                  className="flex items-center gap-2 text-white hover:text-cyan-400"
                >
                  {filteredRawDataList.filter(r => r.processing_status === 'pending' && r.name_original && r.name_original !== "").every(item => selectedRawIds.has(item.id))
                    ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
                  <span className="font-medium">전체 선택</span>
                </button>
                {selectedRawIds.size > 0 && <span className="text-cyan-400 text-sm">{selectedRawIds.size}개 선택됨</span>}
              </div>
              {selectedRawIds.size > 0 && (
                <div className="flex gap-2">
                  <Button onClick={handleTransform} disabled={transformMutation.isPending} className="flex-1 bg-cyan-500 hover:bg-cyan-600">
                    {transformMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />변환 중...</> : <><RefreshCw className="w-4 h-4 mr-2" />변환</>}
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
                    {item.thumbnail_url && <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                        {getStatusBadge(item.processing_status)}
                        {!item.festival_id && <Badge className="bg-purple-900/50 text-purple-400 border border-purple-400/50">신규</Badge>}
                      </div>
                      <div className="space-y-1 text-sm text-gray-400">
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-green-400 flex-shrink-0" /><span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span></div>
                        <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" /><span>{item.address || item.city || '주소 없음'}{item.city ? `, ${item.city}` : ''}</span></div>
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
          ) : <p className="text-gray-500 text-sm text-center py-8">대기중인 데이터가 없습니다.</p>}
        </TabsContent>

        {/* 완료 */}
        <TabsContent value="processed" className="mt-4 space-y-3">
          {filteredRawDataList.filter(r => r.processing_status === 'processed').length > 0 && (
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    const items = filteredRawDataList.filter(r => r.processing_status === 'processed');
                    const ids = new Set(items.map(r => r.id));
                    const allSelected = items.every(item => selectedRawIds.has(item.id));
                    setSelectedRawIds(allSelected ? new Set([...selectedRawIds].filter(id => !ids.has(id))) : new Set([...selectedRawIds, ...ids]));
                  }}
                  className="flex items-center gap-2 text-white hover:text-cyan-400"
                >
                  {filteredRawDataList.filter(r => r.processing_status === 'processed').every(item => selectedRawIds.has(item.id))
                    ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
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
                    {item.thumbnail_url && <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                        {getStatusBadge(item.processing_status)}
                        {item.festival_id && <Badge variant="outline" className="text-green-400 border-green-400 text-xs">✓ Festival ID: {item.festival_id}</Badge>}
                      </div>
                      <div className="space-y-1 text-sm text-gray-400">
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-green-400 flex-shrink-0" /><span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span></div>
                        <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" /><span>{item.address || item.city || '주소 없음'}{item.city && item.address ? `, ${item.city}` : ''}</span></div>
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
          ) : <p className="text-gray-500 text-sm text-center py-8">완료된 데이터가 없습니다.</p>}
        </TabsContent>

        {/* 실패 */}
        <TabsContent value="failed" className="mt-4 space-y-3">
          {filteredRawDataList.filter(r => r.processing_status === 'failed').length > 0 && (
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    const items = filteredRawDataList.filter(r => r.processing_status === 'failed');
                    const ids = new Set(items.map(r => r.id));
                    const allSelected = items.every(item => selectedRawIds.has(item.id));
                    setSelectedRawIds(allSelected ? new Set([...selectedRawIds].filter(id => !ids.has(id))) : new Set([...selectedRawIds, ...ids]));
                  }}
                  className="flex items-center gap-2 text-white hover:text-cyan-400"
                >
                  {filteredRawDataList.filter(r => r.processing_status === 'failed').every(item => selectedRawIds.has(item.id))
                    ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
                  <span className="font-medium">전체 선택</span>
                </button>
                {selectedRawIds.size > 0 && <span className="text-cyan-400 text-sm">{selectedRawIds.size}개 선택됨</span>}
              </div>
              {selectedRawIds.size > 0 && (
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      if (confirm(`선택한 ${selectedRawIds.size}개 항목을 대기 상태로 되돌리시겠습니까?`)) {
                        for (const id of selectedRawIds) {
                          await base44.entities.JapantravelRawData.update(id, { processing_status: 'pending', error_message: null });
                        }
                        setSelectedRawIds(new Set());
                        queryClient.invalidateQueries({ queryKey: ['japantravelRawData'] });
                        alert('대기 상태로 변경되었습니다.');
                      }
                    }}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />재시도
                  </Button>
                  <Button onClick={handleDelete} disabled={deleteRawDataMutation.isPending} className="bg-red-500 hover:bg-red-600">
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
                    {item.thumbnail_url && <img src={item.thumbnail_url} alt={item.name_original} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-white font-bold">{item.name_original || '이름 없음'}</h3>
                        {getStatusBadge(item.processing_status)}
                      </div>
                      <div className="space-y-1 text-sm text-gray-400">
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-green-400 flex-shrink-0" /><span>{item.start_date || '날짜 미정'} ~ {item.end_date || '날짜 미정'}</span></div>
                        <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" /><span>{item.address || item.city || '주소 없음'}{item.city && item.address ? `, ${item.city}` : ''}</span></div>
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
          ) : <p className="text-gray-500 text-sm text-center py-8">실패한 데이터가 없습니다.</p>}
        </TabsContent>
      </Tabs>

      {rawDataList.length === 0 && (
        <Card className="bg-gray-900 border-gray-800 p-12 text-center">
          <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">추출된 데이터가 없습니다</p>
          <p className="text-gray-600 text-sm mt-2">"URL 추출" 탭에서 시작하세요</p>
        </Card>
      )}
    </div>
  );
}