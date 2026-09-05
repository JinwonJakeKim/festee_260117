import React from "react";
import { RefreshCw, Trash2, CheckSquare, Square, Loader2, Calendar, MapPin, Database, ExternalLink, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";

const getStatusBadge = (status) => {
  switch (status) {
    case 'pending': return <Badge className="bg-gray-600">대기중</Badge>;
    case 'processing': return <Badge className="bg-blue-600">처리중</Badge>;
    case 'processed': return <Badge className="bg-green-600">완료</Badge>;
    case 'failed': return <Badge className="bg-red-600">실패</Badge>;
    case 'duplicate': return <Badge className="bg-yellow-600">중복</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

export default function VisitEuropeRawDataTab({
  rawDataList,
  selectedRawIds,
  setSelectedRawIds,
  transformMutation,
  deleteRawDataMutation,
  handleTransform,
  handleDelete,
  handleSelectItem,
  queryClient,
}) {
  const pendingList = rawDataList.filter(r => r.processing_status === 'pending' && r.extract_status === 'processed');
  const discoveredOnlyList = rawDataList.filter(r => r.extract_status === 'pending');
  const processedList = rawDataList.filter(r => r.processing_status === 'processed');
  const duplicateList = rawDataList.filter(r => r.processing_status === 'duplicate');
  const failedList = rawDataList.filter(r => r.processing_status === 'failed' || r.extract_status === 'failed');

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-400/30 p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-white font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            RawData를 Festival로 변환
          </h3>
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['visitEuropeRawData'] })}
            size="sm"
            variant="outline"
            className="border-blue-400 text-blue-400 hover:bg-blue-900/20"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            새로고침
          </Button>
        </div>
        <ul className="text-gray-300 text-sm space-y-1">
          <li>✓ 상세 추출이 완료된 데이터만 변환 가능합니다 ("발견만 됨" 상태는 상세 추출 탭에서 먼저 처리하세요)</li>
          <li>✓ 이름+국가+도시+시작일 기준으로 기존 Festival과 중복 여부를 검사합니다</li>
          <li>✓ 자동 번역(한/영/일/중) 및 카테고리 분류가 적용됩니다</li>
          <li>✓ 좌표(위도/경도) 정보가 없으면 도시 중심좌표로 임의 대체하지 않고 "위치정보 확인 필요" 상태로 남습니다</li>
        </ul>
      </Card>

      {discoveredOnlyList.length > 0 && (
        <Card className="bg-yellow-900/10 border-yellow-400/30 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-yellow-300 text-xs">
            {discoveredOnlyList.length}개 항목은 목록에서 발견만 되었고 상세 추출이 되지 않았습니다. "상세 추출" 탭에서 먼저 처리해주세요.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-yellow-900/20 border-yellow-400/30 p-3 text-center">
          <div className="text-2xl font-bold text-yellow-400">{pendingList.length}</div>
          <div className="text-xs text-gray-400">변환 대기</div>
        </Card>
        <Card className="bg-green-900/20 border-green-400/30 p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{processedList.length}</div>
          <div className="text-xs text-gray-400">완료</div>
        </Card>
        <Card className="bg-blue-900/20 border-blue-400/30 p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">{duplicateList.length}</div>
          <div className="text-xs text-gray-400">중복</div>
        </Card>
        <Card className="bg-red-900/20 border-red-400/30 p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{failedList.length}</div>
          <div className="text-xs text-gray-400">실패</div>
        </Card>
      </div>

      {pendingList.length > 0 && (
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => {
                const ids = new Set(pendingList.map(r => r.id));
                const allSelected = pendingList.every(item => selectedRawIds.has(item.id));
                setSelectedRawIds(allSelected ? new Set([...selectedRawIds].filter(id => !ids.has(id))) : new Set([...selectedRawIds, ...ids]));
              }}
              className="flex items-center gap-2 text-white hover:text-cyan-400"
            >
              {pendingList.every(item => selectedRawIds.has(item.id)) ? <CheckSquare className="w-5 h-5 text-cyan-400" /> : <Square className="w-5 h-5" />}
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

      <div className="space-y-3">
        {rawDataList.map((item) => (
          <Card key={item.id} className={`border-2 ${selectedRawIds.has(item.id) ? 'bg-cyan-900/30 border-cyan-400' : 'bg-gray-900 border-gray-800'}`}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => handleSelectItem(item.id)} className="flex-shrink-0 mt-1">
                  {selectedRawIds.has(item.id) ? <CheckSquare className="w-6 h-6 text-cyan-400" /> : <Square className="w-6 h-6 text-gray-600" />}
                </button>
                {item.source_image_url && (
                  <img src={item.source_image_url} alt={item.source_title} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-white font-bold">{item.source_title || '이름 없음'}</h3>
                    {getStatusBadge(item.processing_status)}
                    <Badge variant="outline" className={item.extract_status === 'processed' ? 'text-green-400 border-green-400 text-xs' : 'text-gray-500 border-gray-600 text-xs'}>
                      상세추출: {item.extract_status === 'processed' ? '완료' : item.extract_status === 'failed' ? '실패' : '발견만됨'}
                    </Badge>
                    {item.location_status === 'needs_verification' && (
                      <Badge variant="outline" className="text-orange-400 border-orange-400 text-xs">위치정보 확인 필요</Badge>
                    )}
                    {item.festival_id && <Badge variant="outline" className="text-green-400 border-green-400 text-xs">Festival 연결됨</Badge>}
                  </div>
                  <div className="space-y-1 text-sm text-gray-400">
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-green-400 flex-shrink-0" /><span>{item.source_start_date || '날짜 미정'} ~ {item.source_end_date || '날짜 미정'}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-400 flex-shrink-0" /><span>{item.source_city || '도시 없음'}{item.source_country ? `, ${item.source_country}` : ''}</span></div>
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-1 truncate">
                      <ExternalLink className="w-3 h-3 flex-shrink-0" /> {item.source_url}
                    </a>
                  </div>
                  {item.error_message && <p className="text-red-400 text-xs mt-2 bg-red-900/20 p-2 rounded">❌ {item.error_message}</p>}
                </div>
                <Button onClick={() => { if (confirm('이 원본 데이터를 삭제하시겠습니까?')) deleteRawDataMutation.mutate([item.id]); }} size="sm" variant="outline" className="border-gray-700 text-red-400 hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {rawDataList.length === 0 && (
        <Card className="bg-gray-900 border-gray-800 p-12 text-center">
          <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">수집된 데이터가 없습니다</p>
          <p className="text-gray-600 text-sm mt-2">"이벤트 발견" 또는 "상세 추출" 탭에서 시작하세요</p>
        </Card>
      )}
    </div>
  );
}