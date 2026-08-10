import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, MessageCircle, Share2, MapPin, Users, Plus, Flag, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import ReportPostModal from "../components/ReportPostModal";
import FestivalListItem from "@/components/FestivalListItem";
import UserSearchModal from "../components/UserSearchModal";
import { useLanguage } from "@/lib/useLanguage";

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const { language, getLocalizedContent } = useLanguage();

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

  const { data: myLikes = [] } = useQuery({
    queryKey: ['myLikes', user?.email],
    queryFn: () => user ? base44.entities.FestivalLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const participantEmails = post?.participant_emails || (post ? [post.author_email] : []);

  const { data: participantProfiles = [] } = useQuery({
    queryKey: ['participantProfiles', participantEmails.join(',')],
    queryFn: async () => {
      if (!participantEmails.length) return [];
      const res = await base44.functions.invoke('searchUsers', { emails: participantEmails });
      return res.data.users || [];
    },
    enabled: participantEmails.length > 0,
  });

  const addParticipantMutation = useMutation({
    mutationFn: async (selectedUser) => {
      const newEmails = [...new Set([...participantEmails, selectedUser.email])];
      await base44.entities.Post.update(postId, { participant_emails: newEmails });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (festivalId) => {
      if (!user) {
        navigate(createPageUrl('Home'));
        return;
      }
      const existing = myLikes.find(like => like.festival_id === festivalId);
      if (existing) {
        await base44.entities.FestivalLike.delete(existing.id);
        await base44.entities.Festival.update(festivalId, {
          likes_count: Math.max(0, (festival?.likes_count || 0) - 1)
        });
      } else {
        await base44.entities.FestivalLike.create({ festival_id: festivalId, user_email: user.email });
        await base44.entities.Festival.update(festivalId, {
          likes_count: (festival?.likes_count || 0) + 1
        });
      }
    },
    onMutate: async (festivalId) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: ['myLikes', user.email] });
      await queryClient.cancelQueries({ queryKey: ['festival', post?.festival_id] });

      const prevLikes = queryClient.getQueryData(['myLikes', user.email]);
      const prevFestival = queryClient.getQueryData(['festival', post?.festival_id]);

      const existing = prevLikes?.find(like => like.festival_id === festivalId);

      queryClient.setQueryData(['myLikes', user.email], (old = []) =>
        existing
          ? old.filter(l => l.festival_id !== festivalId)
          : [...old, { festival_id: festivalId, user_email: user.email, id: 'optimistic' }]
      );

      queryClient.setQueryData(['festival', post?.festival_id], (old) =>
        old ? { ...old, likes_count: existing ? Math.max(0, (old.likes_count || 0) - 1) : (old.likes_count || 0) + 1 } : old
      );

      return { prevLikes, prevFestival };
    },
    onError: (err, festivalId, context) => {
      if (context?.prevLikes) queryClient.setQueryData(['myLikes', user.email], context.prevLikes);
      if (context?.prevFestival) queryClient.setQueryData(['festival', post?.festival_id], context.prevFestival);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['festival', post?.festival_id] });
      queryClient.invalidateQueries({ queryKey: ['myLikes'] });
    },
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

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Post.delete(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(createPageUrl("Community"));
    },
  });

  const handleEdit = () => {
    navigate(createPageUrl(`EditPost?id=${postId}`));
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deletePostMutation.mutate();
  };

  const isAuthor = user && post && user.email === post.author_email;

  const getTemperatureColor = (temp) => {
    if (temp >= 90) return 'text-red-500';
    if (temp >= 70) return 'text-orange-500';
    if (temp >= 50) return 'text-yellow-500';
    return 'text-cyan-400';
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
        <div className="flex gap-1 items-center">
          {isAuthor && (
            <>
              <button
                onClick={handleEdit}
                className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
                aria-label="게시글 수정"
              >
                <Pencil className="w-5 h-5 text-cyan-400" />
              </button>
              <button
                onClick={handleDelete}
                className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
                aria-label="게시글 삭제"
              >
                <Trash2 className="w-5 h-5 text-red-400" />
              </button>
            </>
          )}
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

      <UserSearchModal
        isOpen={showUserSearch}
        onClose={() => setShowUserSearch(false)}
        onAdd={(selectedUser) => addParticipantMutation.mutate(selectedUser)}
        existingEmails={participants}
      />

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white text-lg font-bold mb-2">게시글 삭제</h3>
            <p className="text-gray-400 text-sm mb-6">정말로 이 게시글을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-gray-700 text-white hover:bg-gray-800"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletePostMutation.isLoading}
              >
                취소
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={confirmDelete}
                disabled={deletePostMutation.isLoading}
              >
                {deletePostMutation.isLoading ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
          <h3 className="text-white font-bold mb-3">멤버 ({participants.length})</h3>
          <div className="flex items-start gap-3 flex-wrap">
            {participantProfiles.map((profile) => (
              <Link
                key={profile.email}
                to={createPageUrl(`UserProfile?email=${profile.email}`)}
                className="flex flex-col items-center gap-1 w-16"
              >
                {profile.profile_image ? (
                  <img
                    src={profile.profile_image}
                    alt={profile.full_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {profile.full_name?.[0] || profile.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-xs text-gray-300 truncate w-full text-center">{profile.full_name || profile.email}</span>
              </Link>
            ))}
            {participantProfiles.length < participants.length &&
              participants.slice(participantProfiles.length).map((email, idx) => (
                <div key={`unknown-${idx}`} className="flex flex-col items-center gap-1 w-16">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs text-gray-500 truncate w-full text-center">{email}</span>
                </div>
              ))}
            {isAuthor && (!post.max_participants || participants.length < post.max_participants) && (
              <button
                onClick={() => setShowUserSearch(true)}
                className="flex flex-col items-center gap-1 w-16"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center hover:border-purple-400 transition-colors">
                  <Plus className="w-6 h-6 text-gray-400" />
                </div>
                <span className="text-xs text-gray-500">초대</span>
              </button>
            )}
          </div>
        </div>
        
        {/* Festival Card */}
        {(festival || post.festival_name) && (
          <div className="mb-6">
            <h3 className="text-white font-bold mb-3">축제</h3>
            {festival ? (
              <FestivalListItem
                festival={festival}
                index={0}
                isLiked={myLikes.some(like => like.festival_id === festival.id)}
                onLike={(id) => likeMutation.mutate(id)}
                getLocalizedContent={getLocalizedContent}
                language={language}
              />
            ) : (
              <Link to={post.festival_id ? createPageUrl(`FestivalDetail?id=${post.festival_id}`) : '#'}>
                <div className="flex items-center py-3 pr-3 rounded-2xl bg-gray-900/50 hover:bg-gray-900 transition-all">
                  <div className="flex-shrink-0 w-6 text-center">
                    <span className="text-gray-600 font-bold text-lg leading-none">1</span>
                  </div>
                  <div className="flex-shrink-0 ml-0.5">
                    <img
                      src={post.festival_image || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800'}
                      alt={post.festival_name}
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 ml-3">
                    <h3 className="text-white font-bold text-sm truncate mb-1">{post.festival_name}</h3>
                    <div className="text-gray-400 text-xs">{post.festival_location || ''}</div>
                    <div className="text-gray-500 text-xs">{post.festival_date || ''}</div>
                  </div>
                </div>
              </Link>
            )}
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