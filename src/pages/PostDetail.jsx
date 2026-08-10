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
import LoginPromptModal from "../components/LoginPromptModal";
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

export default function PostDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const [commentText, setCommentText] = useState("");
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

  const { data: comments } = useQuery({
    queryKey: ['postComments', postId],
    queryFn: () => base44.entities.Comment.filter({ post_id: postId }),
    enabled: !!postId,
    initialData: [],
  });

  const commentMutation = useMutation({
    mutationFn: async (content) => {
      if (!user) {
        setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
        setShowLoginModal(true);
        throw new Error("Not logged in");
      }

      await base44.entities.Comment.create({
        post_id: postId,
        user_email: user.email,
        user_name: user.full_name,
        content,
      });

      await base44.entities.Post.update(postId, {
        comments_count: (post?.comments_count || 0) + 1
      });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['postComments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const handleComment = () => {
    if (!user) {
      setLoginModalMessage("댓글을 작성하려면 로그인이 필요합니다");
      setShowLoginModal(true);
      return;
    }
    if (commentText.trim()) {
      commentMutation.mutate(commentText);
    }
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
                    alt={post.author_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {post.author_name?.[0] || 'U'}
                  </div>
                )}
              </Link>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold">{post.author_name}</span>
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
            <div className="flex items-center gap-1">
              <Heart className="w-5 h-5" />
              {post.likes_count || 0}
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="w-5 h-5" />
              {post.comments_count || 0}
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
            disabled={!commentText.trim() || commentMutation.isLoading || !user}
            className="bg-cyan-500 hover:bg-cyan-600 w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {user ? '댓글 작성' : '로그인이 필요합니다'}
          </Button>
        </div>

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

        {comments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            첫 댓글을 작성해보세요!
          </div>
        )}
      </div>
    </div>
  );
}