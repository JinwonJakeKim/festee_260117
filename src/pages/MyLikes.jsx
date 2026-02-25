import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 안전한 날짜 포맷팅 함수
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

export default function MyLikes() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: async () => {
      if (!user) return [];
      
      console.log('[MyLikes] 좋아요 데이터 가져오기 시작...');
      const likes = await base44.entities.FestivalLike.filter({ user_email: user.email });
      console.log('[MyLikes] 전체 좋아요 레코드:', likes.length, '개');
      
      // 1단계: festival_id 기준 중복 제거
      const uniqueFestivalIds = new Set();
      const uniqueLikes = [];
      
      for (const like of likes) {
        if (!uniqueFestivalIds.has(like.festival_id)) {
          uniqueFestivalIds.add(like.festival_id);
          uniqueLikes.push(like);
        }
      }
      
      console.log('[MyLikes] 중복 제거 후:', uniqueLikes.length, '개');
      
      // 2단계: 실제 Festival이 존재하는 like만 필터링
      const validLikes = [];
      for (const like of uniqueLikes) {
        try {
          const festival = await base44.entities.Festival.filter({ id: like.festival_id });
          if (festival && festival.length > 0) {
            validLikes.push(like);
          }
        } catch (error) {
          // Festival이 삭제된 경우 무시
          console.log(`[MyLikes] Festival ${like.festival_id} not found`);
        }
      }
      
      console.log('[MyLikes] Festival 존재 여부 확인 후:', validLikes.length, '개');
      
      return validLikes;
    },
    enabled: !!user,
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // 🔥 실제로 존재하는 축제만 필터링 (중복 제거 + 삭제된 축제 제외)
  const likedFestivals = (festivals || []).filter(f =>
    myLikes.some(like => like.festival_id === f.id)
  );

  console.log('[MyLikes] 최종 표시할 축제:', likedFestivals.length, '개');

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">내가 좋아하는 축제</h1>
        </div>
      </div>

      <div className="px-4 py-4">
        {likedFestivals.length > 0 ? (
          <div className="space-y-3">
            {likedFestivals.map((festival) => (
              <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    <img
                      src={festival.thumbnail_url}
                      alt={festival.name_ko || festival.name_original || festival.name}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="text-white font-bold mb-1">{festival.name_ko || festival.name_original || festival.name}</h3>
                      <p className="text-gray-400 text-sm mb-1">
                        {festival.city}, {festival.country}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {safeFormatDate(festival.start_date, 'yyyy.MM.dd')} - {safeFormatDate(festival.end_date, 'MM.dd')}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">아직 좋아요한 축제가 없습니다</p>
            <p className="text-gray-600 text-sm mb-4">마음에 드는 축제를 찾아보세요!</p>
            <Link to={createPageUrl("FestivalMore")}>
              <Button className="bg-cyan-500 hover:bg-cyan-600">
                축제 둘러보기
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}