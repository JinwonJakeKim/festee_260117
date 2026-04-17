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
        <li>✓ YouTube 하이라이트 영상 & Shorts 자동 검색 <span className="text-yellow-300">(하이라이트·Shorts 공통: 관련성 순위 1위부터 순차 확인 → <strong>score ≥ 1</strong>인 첫 번째 영상 채택. score ≥ 1인 영상이 없으면 기존 영상도 삭제하여 빈 값으로 업데이트)</span></li>
        <li>✓ LLM 관련성 판단 기준: <span className="text-cyan-300 font-bold">한국 축제 score ≥ 1</span> / <span className="text-purple-300 font-bold">일본 축제 score ≥ 2</span> <span className="text-gray-400 text-xs">(한글은 공백 없이 붙여 쓰는 경우가 많아 키워드 1개 매칭도 유효하게 처리)</span></li>
        <li>✓ 재변환 시 기존 데이터를 업데이트합니다 <span className="text-yellow-300">(단, summary/description 번역은 스킵하여 API 비용 절약 — name/city/country만 재번역)</span></li>
      </ul>
      <div className="mt-3 bg-blue-900/20 border border-blue-400/30 rounded-lg p-3">
        <p className="text-blue-400 font-bold text-xs mb-1">🔍 YouTube 쿼리 자동 보정 로직 (explicitEventKeywords)</p>
        <p className="text-gray-400 text-xs mb-2">
          축제명에 <span className="text-white">이벤트 성격을 명확히 나타내는 단어</span>가 포함되어 있으면 <code className="bg-gray-800 px-1 rounded">festival</code>을 추가하지 않습니다.
          없으면 자동으로 <code className="bg-gray-800 px-1 rounded">festival</code> (영어) 또는 <code className="bg-gray-800 px-1 rounded">祭り</code> (일본어)를 추가합니다.
        </p>
        <p className="text-gray-500 text-xs mb-1 italic">
          예) "Raw Wine Tokyo" → wine 포함 → festival 추가 안 함 ✅<br/>
          예) "The Meat" → 해당 없음 → "The Meat festival" 로 검색 ✅
        </p>
        <p className="text-blue-300 text-xs font-bold mb-1">현재 설정된 explicitEventKeywords:</p>
        <div className="text-blue-200 text-xs font-mono space-y-1">
          <p><span className="text-gray-400">축제/이벤트:</span> festival, fest, fete, fair, parade, marathon, show, exhibition, expo, carnival</p>
          <p><span className="text-gray-400">음식/음료:</span> wine, beer, sake, whisky, whiskey, rum, spirits, cocktail, food, ramen, sushi, bbq, coffee, tea, chocolate, cheese</p>
          <p><span className="text-gray-400">음악 장르:</span> jazz, blues, rock, classical, opera, electronic, techno, reggae</p>
          <p><span className="text-gray-400">예술/문화:</span> art, arts, film, cinema, theater, dance, design, anime, comic, manga, gaming, esports</p>
          <p><span className="text-gray-400">자연/계절:</span> sakura, cherry blossom, autumn, lantern, fireworks, hanabi</p>
          <p><span className="text-gray-400">스포츠:</span> triathlon, cycling, surf, ski, snowboard</p>
          <p><span className="text-gray-400">일본어 추가:</span> 祭り, まつり, パレード, イベント, フェア, マラソン, ワイン, ビール, アート, ジャズ 등</p>
        </div>
      </div>
      <div className="mt-3 bg-orange-900/20 border border-orange-400/30 rounded-lg p-3">
        <p className="text-orange-400 font-bold text-xs mb-2">🎯 하이라이트 영상 관련성 점수 로직</p>
        <ul className="text-gray-400 text-xs space-y-1">
          <li>• 축제명에서 festival, matsuri, 연도(20XX), 일반 도시명 등을 제거한 고유명사를 핵심 키워드로 추출</li>
          <li>• 예: "Shinagawa Kids Family Terrace festival Tokyo 2026" → 핵심키워드: shinagawa, kids, family, terrace</li>
          <li>• 각 핵심 키워드가 영상 제목(title) 또는 설명(description)에 포함될 때마다 1점씩 부여</li>
          <li>• <span className="text-yellow-300 font-bold">score ≥ 1인 영상만 하이라이트 후보로 채택</span> — 미달 시 하이라이트 영상 없음으로 처리 (기존 영상도 삭제)</li>
          <li>• 점수 높은 순 → 공공기관 채널 우선 → YouTube 관련성 순서로 최종 선택</li>
          <li>• <span className="text-yellow-300 font-bold">Shorts:</span> 상위 5개 숏츠 중 score ≥ 1인 것의 조회수만 합산 → Festival <code className="bg-gray-800 px-1 rounded">shorts_views_5_total</code> 필드에 저장</li>
        </ul>
      </div>
      <div className="mt-3 bg-red-900/20 border border-red-400/30 rounded-lg p-3">
        <p className="text-red-400 font-bold text-xs mb-1">🚫 하이라이트 영상 블랙리스트 키워드</p>
        <p className="text-gray-400 text-xs">영상 제목에 아래 키워드가 포함된 경우 하이라이트 영상에서 자동 제외됩니다:</p>
        <p className="text-red-300 text-xs font-mono mt-1">Idol, dance, 아이돌, 공연, 춤, stage</p>
      </div>
      <div className="mt-3 bg-green-900/20 border border-green-400/30 rounded-lg p-3">
        <p className="text-green-400 font-bold text-xs mb-2">📱 YouTube Shorts 수집 로직</p>
        <ul className="text-gray-400 text-xs space-y-1">
          <li>• <span className="text-yellow-300 font-bold">score ≥ 1인 숏츠만 채택</span> (하이라이트와 동일한 관련성 필터링)</li>
          <li>• 상위 5개 숏츠 중 score ≥ 1인 것의 조회수만 합산 → <code className="bg-gray-800 px-1 rounded">shorts_views_5_total</code> 저장</li>
          <li>• 하이라이트 영상과 동일한 videoId는 숏츠 목록에서 자동 제외 (중복 방지)</li>
        </ul>
      </div>
    </Card>
  );
}