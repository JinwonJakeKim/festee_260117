import React from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RawDataTransformInfoCard({ onRefresh }) {
  return (
    <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-400/30 p-4">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-white font-bold flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-purple-400" />
          RawData를 Festival로 변환
        </h3>
        <Button
          onClick={onRefresh}
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
      <div className="mt-3 bg-red-900/20 border border-red-400/30 rounded-lg p-3">
        <p className="text-red-400 font-bold text-xs mb-1">🚫 하이라이트 영상 블랙리스트 키워드</p>
        <p className="text-gray-400 text-xs">영상 제목에 아래 키워드가 포함된 경우 하이라이트 영상에서 자동 제외됩니다:</p>
        <p className="text-red-300 text-xs font-mono mt-1">Idol, dance, 아이돌, 공연, 춤</p>
      </div>
    </Card>
  );
}