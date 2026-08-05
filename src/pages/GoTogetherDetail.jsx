import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, MessageCircle, Share2, MapPin, Users, Plus, Star, Calendar, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import ReportPostModal from "../components/ReportPostModal";

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

export default function GoTogetherDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const [commentText, setCommentText] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [postId]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => base44.entities.Post.filter({ id: postId }).then(res => res[0]),
    enabled: !!postId,
  });

  // 작성자의 최신 프로필 정보 가져오기
  const { data: author } = useQuery({
    queryKey: ['author', post?.author_email],
    queryFn: async () => {
      if (!post?.author_email) return null;
      const users = await base44.entities.User.filter({ email: post.author_email });
      return users[0];
    },
    enabled: !!post?.author_email,
  });

  const { data: festival } = useQuery({
    queryKey: ['festival', post?.festival_id],
    queryFn: () => post?.festival_id ? base44.entities.Festival.filter({ id: post.festival_id }).then(res => res[0]) : null,
    enabled: !!post?.festival_id,
  });

  const { data: comments } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => base44.entities.Comment.filter({ festival_id: postId }), // Assuming festival_id field is used to link comments to GoTogether posts
    enabled: !!postId,
    initialData: [],
  });

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      await base44.entities.Comment.create({
        festival_id: postId,
        user_email: user.email,
        user_name: user.full_name,
        content,
      });
      await base44.entities.Post.update(postId, {
        comments_count: (post?.comments_count || 0) + 1
      });

      // 알림 생성 (자신의 게시글에 댓글 달 경우 제외)
      if (post && user && author && post.author_email !== user.email) {
        const authorSettings = author?.notification_settings || {};
        if (authorSettings.gotogether_comment !== false) {
          await base44.entities.Notification.create({
            user_email: post.author_email,
            type: 'gotogether_comment',
            title: '새 댓글',
            content: `${user.full_name}님이 "${post.title}" 같이가기 게시글에 댓글을 남겼습니다.`,
            sender_email: user.email,
            sender_name: user.full_name,
            sender_profile_image: user.profile_image,
            link_url: createPageUrl(`GoTogetherDetail?id=${postId}`),
            related_id: postId,
          });
        }
      }
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['comments', postId] }); // Invalidate specific comments query
      queryClient.invalidateQueries({ queryKey: ['post', postId] });     // Invalidate specific post query
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
    },
  });

  const handleComment = () => {
    if (commentText.trim() && user) {
      commentMutation.mutate(commentText);
    }
  };

  const getTemperatureColor = (temp) => {
    if (temp >= 90) return 'text-red-500';
    if (temp >= 70) return 'text-orange-500';
    if (temp >= 50) return 'text-yellow-500';
    return 'text-cyan-400';
  };

  // 모든 축제 별점을 1~5로 변경
  const getStarRating = (festival) => {
    if (festival?.star_rating) {
      return Math.min(5, Math.max(1, festival.star_rating));
    }
    
    // Fallback to a hash-based rating if star_rating is not available
    let hash = 0;
    const id = festival?.id || festival?.name || '0';
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return Math.abs(hash % 5) + 1; // Returns a number between 1 and 5
  };

  if (isLoading || !post) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  const participants = post.participant_emails || [post.author_email];
  const authorProfileImage = author?.profile_image || post.author_profile_image;
  const authorName = author?.full_name || post.author_name;

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
            aria-label="게시글 신고"
          >
            <Flag className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      <ReportPostModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        postId={postId}
        postType="gotogether"
        postTitle={post?.title}
        postAuthorEmail={post?.author_email}
        postAuthorName={post?.author_name}
      />

      {/* Post Content */}
      <div className="px-4 py-6">
        {/* Post Header (Author, Temperature, Created Date) */}
        <div className="flex items-center justify-between mb-4">
          <Link to={createPageUrl(`UserProfile?email=${post.author_email}`)} className="flex items-center gap-3">
            {authorProfileImage ? (
              <img
                src={authorProfileImage}
                alt={authorName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                {authorName?.[0] || 'U'}
              </div>
            )}
            <div>
              <p className="text-white font-bold">{authorName}</p>
              <p className="text-gray-500 text-sm">{post.author_location || '대한민국 서울'}</p>
            </div>
          </Link>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3">
              <button className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </button>
              <Badge className={`${getTemperatureColor(post.temperature)} border-current font-bold`} variant="outline">
                {post.temperature}°C
              </Badge>
            </div>
            <div className="text-sm text-gray-500">
              {safeFormatDate(post.created_date, 'yy.MM.dd HH:mm')}
            </div>
          </div>
        </div>

        {/* Title & Content */}
        <h1 className="text-white text-2xl font-bold mb-4">{post.title}</h1>
        <p className="text-gray-300 leading-relaxed mb-6 whitespace-pre-wrap">{post.content}</p>

        {/* Members Section */}
        <div className="mb-6">
          <h3 className="text-white font-bold mb-3">멤버</h3>
          <div className="flex items-center gap-3">
            {participants.map((email, idx) => (
              <div key={idx} className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                {email?.[0]?.toUpperCase() || 'U'}
              </div>
            ))}
            {(!post.max_participants || participants.length < post.max_participants) && (
              <button className="w-12 h-12 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center hover:border-purple-400 transition-colors">
                <Plus className="w-6 h-6 text-gray-600" />
              </button>
            )}
          </div>
        </div>
        
        {/* Festival Info (from post object - if denormalized) */}
        {post.festival_name && (
          <div className="mb-6">
            <h3 className="text-white font-bold mb-3">관련 축제 정보</h3>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <h4 className="text-white font-bold mb-2">{post.festival_name}</h4>
              {post.festival_date && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Calendar className="w-4 h-4 text-pink-500" />
                  <span>{safeFormatDate(post.festival_date, 'yy.M.d')}</span>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Festival Card (from linked festival entity) */}
        {festival && (
          <div className="mb-6">
            <h3 className="text-white font-bold mb-3">축제</h3>
            <Link to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
              <Card className="bg-gray-900 border-gray-800 hover:border-purple-400/50 transition-all overflow-hidden">
                <div className="flex gap-3 p-3">
                  <img
                    src={festival.thumbnail_url}
                    alt={festival.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-cyan-400 text-xs font-bold">
                        {getStarRating(festival)}
                      </span>
                    </div>
                    <h4 className="text-white font-bold mb-1 line-clamp-1">{festival.name}</h4>
                    <p className="text-gray-400 text-xs">{festival.country} {festival.city}</p>
                    <p className="text-gray-500 text-xs">
                      {safeFormatDate(festival.start_date, 'yy.M.d')}-{safeFormatDate(festival.end_date, 'M.d')}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <Heart className="w-5 h-5 text-pink-500 fill-pink-500 mb-1" />
                    <span className="text-xs text-gray-400">{festival.likes_count || 0}</span>
                  </div>
                </div>
              </Card>
            </Link>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-6">
          <h3 className="text-white font-bold mb-4">댓글 ({comments.length})</h3>
          
          {/* Comment Form */}
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
                className="bg-purple-600 hover:bg-purple-700"
              >
                댓글 작성
              </Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-3">
            {comments.map((comment) => (
              <Card key={comment.id} className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-white text-sm">{comment.user_name}</div>
                    <div className="text-xs text-gray-500">{safeFormatDate(comment.created_date, 'yy.MM.dd HH:mm')}</div>
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