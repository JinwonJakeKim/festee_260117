import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * 게시글(Post/GoTogether) 좋아요 훅
 * - Optimistic UI로 즉시 반영
 * - 실패 시 rollback
 * - 중복 요청 방지
 * - likes_count를 실제 좋아요 수와 동기화
 *
 * @param {string} postId - 게시글 ID
 * @param {object} user - 현재 로그인한 사용자 (base44.auth.me() 결과)
 * @param {function} onLoginRequired - 로그인 필요 시 호출할 콜백
 */
export function usePostLike({ postId, user, onLoginRequired }) {
  const queryClient = useQueryClient();

  const { data: myPostLikes = [] } = useQuery({
    queryKey: ['myPostLikes', user?.email],
    queryFn: () => user ? base44.entities.PostLike.filter({ user_email: user.email }) : [],
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        onLoginRequired?.();
        return;
      }
      const existing = myPostLikes.find(like => like.post_id === postId);
      const currentCount = queryClient.getQueryData(['post', postId])?.likes_count || 0;
      if (existing) {
        await base44.entities.PostLike.delete(existing.id);
        await base44.entities.Post.update(postId, { likes_count: Math.max(0, currentCount - 1) });
      } else {
        await base44.entities.PostLike.create({ post_id: postId, user_email: user.email });
        await base44.entities.Post.update(postId, { likes_count: currentCount + 1 });
      }
    },
    onMutate: async () => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: ['myPostLikes', user.email] });
      await queryClient.cancelQueries({ queryKey: ['post', postId] });

      const prevLikes = queryClient.getQueryData(['myPostLikes', user.email]);
      const prevPost = queryClient.getQueryData(['post', postId]);

      const existing = prevLikes?.find(like => like.post_id === postId);

      queryClient.setQueryData(['myPostLikes', user.email], (old = []) =>
        existing
          ? old.filter(l => l.post_id !== postId)
          : [...old, { post_id: postId, user_email: user.email, id: 'optimistic' }]
      );

      queryClient.setQueryData(['post', postId], (old) =>
        old ? { ...old, likes_count: existing ? Math.max(0, (old.likes_count || 0) - 1) : (old.likes_count || 0) + 1 } : old
      );

      return { prevLikes, prevPost };
    },
    onError: (err, variables, context) => {
      if (context?.prevLikes) queryClient.setQueryData(['myPostLikes', user.email], context.prevLikes);
      if (context?.prevPost) queryClient.setQueryData(['post', postId], context.prevPost);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['myPostLikes'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  const isLiked = myPostLikes.some(like => like.post_id === postId);
  const likeCount = queryClient.getQueryData(['post', postId])?.likes_count || 0;

  return {
    isLiked,
    likeCount,
    toggleLike: () => likeMutation.mutate(),
    isLiking: likeMutation.isLoading,
  };
}