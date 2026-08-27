import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * 공통 댓글 CRUD 훅 - Optimistic UI 적용
 *
 * FestivalDetail, PostDetail, GoTogetherDetail에서 공통 사용.
 * 댓글 생성/수정/삭제 시 즉시 화면 반영(Optimistic UI) + DB 저장 + 실패 시 rollback.
 * 댓글 작성자의 최신 닉네임도 일괄 조회하여 반환.
 *
 * @param {Object} params
 * @param {string} params.entityId - 축제/게시글 ID
 * @param {"Festival"|"Post"} params.entityType - 부모 엔티티 타입
 * @param {string} params.commentLinkField - "festival_id" | "post_id"
 * @param {Object} params.user - 현재 로그인 사용자 (base44.auth.me())
 * @param {Function} [params.onCommentCreated] - 댓글 생성 성공 후 추가 사이드이펙트 (알림 등)
 */
export function useCommentActions({ entityId, entityType, commentLinkField, user, onCommentCreated }) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editText, setEditText] = useState("");

  const commentQueryKey = entityType === "Festival"
    ? ["comments", entityId]
    : ["postComments", entityId];
  const entityQueryKey = entityType === "Festival"
    ? ["festival", entityId]
    : ["post", entityId];

  // 댓글 목록 조회
  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: commentQueryKey,
    queryFn: () => base44.entities.Comment.filter({ [commentLinkField]: entityId }),
    enabled: !!entityId,
  });

  // 댓글 작성자 최신 프로필 일괄 조회 (닉네임 동기화)
  const uniqueEmails = [...new Set(comments.map((c) => c.user_email).filter(Boolean))];
  const { data: commentAuthors = [] } = useQuery({
    queryKey: ["commentAuthors", uniqueEmails.join(",")],
    queryFn: async () => {
      if (!uniqueEmails.length) return [];
      const res = await base44.functions.invoke("searchUsers", { emails: uniqueEmails });
      return res.data?.users || [];
    },
    enabled: uniqueEmails.length > 0,
  });

  // 작성자 최신 닉네임 반영된 댓글 목록
  const commentsWithAuthorInfo = comments.map((c) => {
    const author = commentAuthors.find((a) => a.email === c.user_email);
    return {
      ...c,
      user_name: author?.nickname || author?.full_name || c.user_name,
    };
  });

  // --- 댓글 생성 (Optimistic) ---
  const createMutation = useMutation({
    mutationFn: async (content) => {
      const newComment = await base44.entities.Comment.create({
        [commentLinkField]: entityId,
        user_email: user.email,
        user_name: user.nickname || user.full_name,
        content,
      });
      // 저장된 count 동기화 (실제 댓글 수 기준)
      const currentComments = queryClient.getQueryData(commentQueryKey) || [];
      await base44.entities[entityType].update(entityId, {
        comments_count: currentComments.length,
      });
      return newComment;
    },
    onMutate: async (content) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: commentQueryKey });
      await queryClient.cancelQueries({ queryKey: entityQueryKey });

      const prevComments = queryClient.getQueryData(commentQueryKey);
      const prevEntity = queryClient.getQueryData(entityQueryKey);

      const optimisticComment = {
        id: `optimistic-${Date.now()}`,
        [commentLinkField]: entityId,
        user_email: user.email,
        user_name: user.nickname || user.full_name,
        content,
        created_date: new Date().toISOString(),
      };
      queryClient.setQueryData(commentQueryKey, (old = []) => [...old, optimisticComment]);
      queryClient.setQueryData(entityQueryKey, (old) =>
        old ? { ...old, comments_count: (old.comments_count || 0) + 1 } : old
      );
      return { prevComments, prevEntity };
    },
    onError: (err, content, context) => {
      if (context?.prevComments) queryClient.setQueryData(commentQueryKey, context.prevComments);
      if (context?.prevEntity) queryClient.setQueryData(entityQueryKey, context.prevEntity);
    },
    onSuccess: (newComment) => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: commentQueryKey });
      queryClient.invalidateQueries({ queryKey: entityQueryKey });
      // 커뮤니티 목록의 comments_count도 갱신
      if (entityType === "Post") {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      }
      onCommentCreated?.(newComment);
    },
  });

  // --- 댓글 삭제 (Optimistic) ---
  const deleteMutation = useMutation({
    mutationFn: async (commentId) => {
      await base44.entities.Comment.delete(commentId);
      const currentComments = queryClient.getQueryData(commentQueryKey) || [];
      await base44.entities[entityType].update(entityId, {
        comments_count: Math.max(0, currentComments.length),
      });
    },
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: commentQueryKey });
      await queryClient.cancelQueries({ queryKey: entityQueryKey });

      const prevComments = queryClient.getQueryData(commentQueryKey);
      const prevEntity = queryClient.getQueryData(entityQueryKey);

      queryClient.setQueryData(commentQueryKey, (old = []) => old.filter((c) => c.id !== commentId));
      queryClient.setQueryData(entityQueryKey, (old) =>
        old ? { ...old, comments_count: Math.max(0, (old.comments_count || 0) - 1) } : old
      );
      return { prevComments, prevEntity };
    },
    onError: (err, commentId, context) => {
      if (context?.prevComments) queryClient.setQueryData(commentQueryKey, context.prevComments);
      if (context?.prevEntity) queryClient.setQueryData(entityQueryKey, context.prevEntity);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentQueryKey });
      queryClient.invalidateQueries({ queryKey: entityQueryKey });
      if (entityType === "Post") {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      }
    },
  });

  // --- 댓글 수정 (Optimistic) ---
  const editMutation = useMutation({
    mutationFn: async ({ commentId, content }) => {
      await base44.entities.Comment.update(commentId, { content });
    },
    onMutate: async ({ commentId, content }) => {
      await queryClient.cancelQueries({ queryKey: commentQueryKey });
      const prevComments = queryClient.getQueryData(commentQueryKey);
      queryClient.setQueryData(commentQueryKey, (old = []) =>
        old.map((c) => (c.id === commentId ? { ...c, content } : c))
      );
      return { prevComments };
    },
    onError: (err, vars, context) => {
      if (context?.prevComments) queryClient.setQueryData(commentQueryKey, context.prevComments);
    },
    onSuccess: () => {
      setEditingCommentId(null);
      setEditText("");
      queryClient.invalidateQueries({ queryKey: commentQueryKey });
    },
  });

  // --- Public API ---
  const submitComment = () => {
    if (!user || !commentText.trim() || createMutation.isLoading) return;
    createMutation.mutate(commentText.trim());
  };

  const deleteComment = (commentId) => {
    if (!user || deleteMutation.isLoading) return;
    deleteMutation.mutate(commentId);
  };

  const startEdit = (comment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditText("");
  };

  const submitEdit = () => {
    if (!editText.trim() || editMutation.isLoading) return;
    editMutation.mutate({ commentId: editingCommentId, content: editText.trim() });
  };

  return {
    comments: commentsWithAuthorInfo,
    commentsLoading,
    commentText,
    setCommentText,
    submitComment,
    isSubmitting: createMutation.isLoading,
    deleteComment,
    isDeleting: deleteMutation.isLoading,
    editingCommentId,
    editText,
    setEditText,
    startEdit,
    cancelEdit,
    submitEdit,
    isEditing: editMutation.isLoading,
  };
}