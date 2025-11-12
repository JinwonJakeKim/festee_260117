import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Target, MapPin, Calendar, Trash2, Heart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

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

export default function MyCatches() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: myCatches = [], refetch: refetchCatches } = useQuery({
    queryKey: ['myCatches', user?.email],
    queryFn: () => user ? base44.entities.Catch.filter({ user_email: user.email }, '-created_date') : [],
    enabled: !!user,
    initialData: [],
  });

  const deleteCatchMutation = useMutation({
    mutationFn: async (catchId) => {
      const catchItem = myCatches.find(c => c.id === catchId);
      if (!catchItem) return;

      // Catch 삭제
      await base44.entities.Catch.delete(catchId);

      // Festival의 catches_count 감소
      if (catchItem.festival_id) {
        const festivals = await base44.entities.Festival.filter({ id: catchItem.festival_id });
        if (festivals.length > 0) {
          const festival = festivals[0];
          await base44.entities.Festival.update(festival.id, {
            catches_count: Math.max(0, (festival.catches_count || 0) - 1)
          });
        }
      }

      // User의 catches_count 감소
      await base44.auth.updateMe({
        catches_count: Math.max(0, (user.catches_count || 0) - 1)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myCatches'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      refetchCatches();
    },
  });

  const handleDelete = (catchId, festivalName) => {
    if (confirm(`"${festivalName}" 캐치를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      deleteCatchMutation.mutate(catchId);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!user) {
    navigate(createPageUrl("MyFestee"));
    return null;
  }

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
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">내 Catch</h1>
            <p className="text-gray-400 text-sm">총 {myCatches.length}개의 축제 인증</p>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="px-4 py-6">
        <Card className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border-cyan-400/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-pink-500 flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white text-2xl font-bold">{myCatches.length}</h2>
                <p className="text-gray-400 text-sm">Catches</p>
              </div>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            축제 현장에서 인증한 기록입니다. 더 많은 축제에 참여하고 랭커가 되어보세요! 🎉
          </p>
        </Card>
      </div>

      {/* Catch List */}
      <div className="px-4 space-y-4">
        {myCatches.length > 0 ? (
          <AnimatePresence>
            {myCatches.map((catchItem) => (
              <motion.div
                key={catchItem.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-gray-900 border-gray-800 overflow-hidden hover:border-cyan-400/50 transition-all">
                  <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)} className="block">
                    <img
                      src={catchItem.image_url}
                      alt={catchItem.festival_name}
                      className="w-full h-48 object-cover"
                    />
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <Link to={createPageUrl(`FestivalDetail?id=${catchItem.festival_id}`)}>
                          <h3 className="text-white font-bold text-lg mb-2 hover:text-cyan-400 transition-colors">
                            {catchItem.festival_name}
                          </h3>
                        </Link>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <MapPin className="w-4 h-4 text-cyan-400" />
                            {catchItem.location}
                          </div>
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Calendar className="w-4 h-4 text-pink-500" />
                            {safeFormatDate(catchItem.created_date, 'yyyy년 M월 d일 HH:mm')}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDelete(catchItem.id, catchItem.festival_name)}
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        disabled={deleteCatchMutation.isLoading}
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-cyan-500 text-white">
                        <Target className="w-3 h-3 mr-1" />
                        Catched
                      </Badge>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">아직 인증한 축제가 없습니다</h3>
            <p className="text-gray-500 text-sm mb-6">
              축제 현장에서 500m 이내에 접근하면 Catch 할 수 있어요!
            </p>
            <Link to={createPageUrl("Catch")}>
              <Button className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600">
                <Target className="w-5 h-5 mr-2" />
                지금 Catch 하러 가기
              </Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Tips */}
      {myCatches.length > 0 && (
        <div className="px-4 py-6">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              💡 Catch 팁
            </h3>
            <ul className="text-gray-300 text-sm space-y-2">
              <li>• 더 많은 축제를 Catch하면 랭커로 등록될 수 있어요</li>
              <li>• 삭제한 Catch는 복구할 수 없으니 신중하게 결정하세요</li>
              <li>• SNS에 공유하여 친구들에게 자랑해보세요!</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}