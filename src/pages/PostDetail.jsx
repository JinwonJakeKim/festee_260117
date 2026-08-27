import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Heart, MessageCircle, Send, Flag, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { motion } from "framer-motion";
import LoginPromptModal from "../components/LoginPromptModal";
import ReportPostModal from "../components/ReportPostModal";
import CommentItem from "@/components/CommentItem";
import { useCommentActions } from "@/hooks/useCommentActions";
import { usePostLike } from "@/hooks/usePostLike";

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

export default function PostDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMessage, setLoginModalMessage] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // 작성자의 최신 닉네임을 가져오기 위해 searchUsers 함수 사용
  // (post.author_name은 생성 시점 스냅샷이므로 닉네임 변경 시 최신화되지 않음)
  const { data: authorInfo } = useQuery({
    queryKey: ['authorInfo', post?.author_email],
    queryFn: async () => {
      const res = await base44.functions.invoke('searchUsers', { emails: [post.author_email] });
      return res.data?.users?.[0] || null;
    },
    enabled: !!post?.author_email,
  });

  // 작성자 표시명: 최신 닉네임 우선, 없으면 저장된 author_name, 최종 fallback
  const authorDisplayName = authorInfo?.nickname || authorInfo?.full_name || post?.author_name || '사용자';

  // 공통 댓글 훅 (Optimistic UI + 작성자 닉네임 동기화 + 수정/삭제)
  const {
    comments,
    commentText,
    setCommentText,
    submitComment,
    isSubmitting,
    deleteComment,
    isDeleting,
    editingCommentId,
    editText,
    setEditText,
    startEdit,
    cancelEdit,
    submitEdit,
    isEditing,
  } = useCommentActions({
    entityId: postId,
    entityType: "Post",
    commentLinkField: "post_id",
    user,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [likeAnimating, setLikeAnimating] = useState(false);

  // 게시글 좋아요 (Optimistic UI)
  const { isLiked, likeCount, toggleLike, isLiking } = usePostLike({
    postId,
    user,
    onLoginRequired: () => {
      setLoginModalMessage("게시글에 좋아요를 누르려면 로그인이 필요합니다");
      setShowLoginModal(true);
    },
  });

  const handleLike = () => {
    if (!user) {
      setLoginModalMessage("게시글에 좋아요를 누르려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(30);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 400);
    toggleLike();
  };

  const handleComment = () => {
    if (!user) {
      setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    submitComment();
  };

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(window.location.pathname + window.location.search);
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

  if (isLoading || !post) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLoginRedirect}
        message={loginModalMessage}
      />

      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">게시글</h1>
          <div className="flex items-center gap-1">
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
            <button
              onClick={() => setShowReportModal(true)}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
              aria-label="게시글 신고"
            >
              <Flag className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>
      </div>

      <ReportPostModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        postId={postId}
        postType="post"
        postTitle={post?.title}
        postAuthorEmail={post?.author_email}
        postAuthorName={post?.author_name}
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

      <div className="px-4 py-6"> {/* Changed py-4 to py-6 to match original padding logic */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
          {/* Post Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl(`UserProfile?email=${post.author_email}`)}>
                {post.author_profile_image ? (
                  <img
                    src={post.author_profile_image}
                    alt={authorDisplayName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {authorDisplayName?.[0] || 'U'}
                  </div>
                )}
              </Link>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold">{authorDisplayName}</span>
                  <Badge className="bg-cyan-500 text-white text-xs">{post.type}</Badge>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {safeFormatDate(post.created_date, 'yy.MM.dd HH:mm')}
            </div>
          </div>

          <h2 className="text-white text-xl font-bold mb-3">{post.title}</h2>
          <p className="text-gray-300 mb-4 whitespace-pre-wrap">{post.content}</p>

          {post.image_urls && post.image_urls.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {post.image_urls.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt=""
                  className="w-full h-48 object-cover rounded-lg"
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 text-gray-400 text-sm">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className="flex items-center gap-1 transition-colors"
              aria-label="좋아요"
            >
              <motion.span
                animate={likeAnimating ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Heart className={`w-5 h-5 transition-colors ${isLiked ? 'fill-pink-500 text-pink-500' : 'text-gray-400 hover:text-pink-400'}`} />
              </motion.span>
              <span className={isLiked ? 'text-pink-500 font-medium' : ''}>{likeCount}</span>
            </button>
            <div className="flex items-center gap-1">
              <MessageCircle className="w-5 h-5" />
              {comments.length}
            </div>
          </div>
        </Card>

        <h3 className="text-white font-bold text-lg mb-4">댓글 ({comments.length})</h3>

        <div className="mb-6">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={user ? "댓글을 작성하세요..." : "로그인 후 댓글을 작성할 수 있습니다"}
            className="bg-gray-900 border-gray-800 text-white mb-2"
            rows={3}
            disabled={!user}
          />
          <Button
            onClick={handleComment}
            disabled={!commentText.trim() || isSubmitting || !user}
            className="bg-cyan-500 hover:bg-cyan-600 w-full"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                등록 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {user ? '댓글 작성' : '로그인이 필요합니다'}
              </>
            )}
          </Button>
        </div>

        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={user}
              editingCommentId={editingCommentId}
              editText={editText}
              setEditText={setEditText}
              startEdit={startEdit}
              cancelEdit={cancelEdit}
              submitEdit={submitEdit}
              deleteComment={deleteComment}
              isEditing={isEditing}
              isDeleting={isDeleting}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
            />
          ))}
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