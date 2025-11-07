
import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, MessageCircle, Heart } from "lucide-react"; 
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

export default function MyComments() {
  const navigate = useNavigate();

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: myComments } = useQuery({
    queryKey: ['myComments', user?.email],
    queryFn: () => user ? base44.entities.Comment.filter({ user_email: user.email }, '-created_date') : [],
    enabled: !!user,
    initialData: [],
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    initialData: [],
  });

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
          <h1 className="text-xl font-bold text-white">내가 작성한 댓글</h1>
        </div>
      </div>

      <div className="px-4 py-4">
        {myComments.length > 0 ? (
          <div className="space-y-3">
            {myComments.map((comment) => (
              <Link 
                key={comment.id} 
                to={createPageUrl(`FestivalDetail?id=${comment.festival_id}`)}
              >
                <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4">
                  <div className="mb-2">
                    <p className="text-gray-400 text-sm mb-1">
                      {festivals.find(f => f.id === comment.festival_id)?.name || '축제'}
                    </p>
                    <p className="text-white">{comment.content}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{safeFormatDate(comment.created_date, 'yy.MM.dd HH:mm')}</span>
                    <div className="flex items-center gap-1 text-pink-500"> {/* Reverted to pink for likes */}
                      <Heart className="w-3 h-3" />
                      {comment.likes_count || 0}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">아직 작성한 댓글이 없습니다</p>
            <p className="text-gray-600 text-sm mb-4">축제에 댓글을 남겨보세요!</p>
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
