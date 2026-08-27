import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, MessageCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

export default function FeedbackDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const feedbackId = urlParams.get('id');
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [feedbackId]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['feedback', feedbackId],
    queryFn: () => base44.entities.Feedback.filter({ id: feedbackId }).then(res => res[0]),
    enabled: !!feedbackId,
  });

  const { data: comments } = useQuery({
    queryKey: ['feedbackComments', feedbackId],
    queryFn: () => base44.entities.FeedbackComment.filter({ feedback_id: feedbackId }, '-created_date'),
    enabled: !!feedbackId,
    initialData: [],
  });

  const { data: myLikes } = useQuery({
    queryKey: ['myFeedbackLikes', user?.email],
    queryFn: () => user ? base44.entities.FeedbackLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const existing = myLikes.find(like => like.feedback_id === feedbackId);
      if (existing) {
        await base44.entities.FeedbackLike.delete(existing.id);
        await base44.entities.Feedback.update(feedbackId, {
          likes_count: Math.max(0, (feedback?.likes_count || 0) - 1)
        });
      } else {
        await base44.entities.FeedbackLike.create({
          feedback_id: feedbackId,
          user_email: user.email
        });
        await base44.entities.Feedback.update(feedbackId, {
          likes_count: (feedback?.likes_count || 0) + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['myFeedbackLikes'] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      await base44.entities.FeedbackComment.create({
        feedback_id: feedbackId,
        user_email: user.email,
        user_name: user.nickname || user.full_name,
        content,
      });
      await base44.entities.Feedback.update(feedbackId, {
        comments_count: (feedback?.comments_count || 0) + 1
      });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['feedbackComments'] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });

  const handleComment = () => {
    if (commentText.trim() && user) {
      commentMutation.mutate(commentText);
    }
  };

  if (isLoading || !feedback) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  const isLiked = myLikes.some(like => like.feedback_id === feedbackId);

  // The categoryColors map was used for the old layout, but the new outline hardcodes the category badge color.
  // It is no longer needed.
  // const categoryColors = {
  //   "버그 보고": "bg-red-500",
  //   "기능 제안": "bg-blue-500",
  //   "일반 의견": "bg-green-500",
  //   "기타": "bg-gray-500"
  // };

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <button 
          onClick={() => user && likeMutation.mutate()}
          className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-white'}`} />
        </button>
      </div>

      <div className="px-4 py-6">
        {/* Feedback Info */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-cyan-500 text-white">{feedback.category}</Badge>
              {feedback.status && (
                <Badge 
                  className={`${
                    feedback.status === "완료" ? "bg-green-500" :
                    feedback.status === "처리 중" ? "bg-yellow-500 text-black" :
                    "bg-gray-600"
                  } text-white`}
                >
                  {feedback.status}
                </Badge>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {safeFormatDate(feedback.created_date, 'yyyy.MM.dd HH:mm')}
            </span>
          </div>

          <h1 className="text-white text-2xl font-bold mb-2">{feedback.subject}</h1>
          <div className="text-sm text-gray-400 mb-4">{feedback.user_name}</div>
          <p className="text-gray-300 leading-relaxed mb-6 whitespace-pre-wrap">{feedback.content}</p>

          {/* Screenshot */}
          {feedback.screenshot_url && (
            <img
              src={feedback.screenshot_url}
              alt="Screenshot"
              className="w-full rounded-lg mb-6"
            />
          )}
        </Card>

        {/* Interaction */}
        <div className="flex items-center gap-6 py-4 border-y border-gray-800 mb-6">
          <button 
            onClick={() => user && likeMutation.mutate()}
            className={`flex items-center gap-2 ${isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'}`}
          >
            <Heart className={`w-6 h-6 ${isLiked ? 'fill-pink-500' : ''}`} />
            <span>{feedback.likes_count || 0}</span>
          </button>
          <div className="flex items-center gap-2 text-gray-400">
            <MessageCircle className="w-6 h-6" />
            <span>{comments.length}</span>
          </div>
        </div>

        {/* Comments Section */}
        <div>
          <h3 className="text-white font-bold mb-4">댓글 ({comments.length})</h3>
          
          {user && (
            <div className="mb-6">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="댓글을 작성하세요..."
                className="bg-gray-900 border-gray-800 text-white mb-2"
                rows={3}
              />
              <Button
                onClick={handleComment}
                disabled={!commentText.trim()}
                className="bg-cyan-500 hover:bg-cyan-600"
              >
                댓글 작성
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {comments.map((comment) => (
              <Card key={comment.id} className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-white text-sm">{comment.user_name}</div>
                    <div className="text-xs text-gray-500">
                      {safeFormatDate(comment.created_date, 'yyyy.MM.dd HH:mm')}
                    </div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm">{comment.content}</p>
              </Card>
            ))}
          </div>
        </div>

        {comments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            첫 댓글을 작성해보세요!
          </div>
        )}
      </div>
    </div>
  );
}