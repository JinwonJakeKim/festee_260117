import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Users, UserMinus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

export default function MyFollowing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  // 내가 팔로우하는 사람들 (팔로잉)
  const { data: myFollowing = [] } = useQuery({
    queryKey: ['myFollowing', user?.email],
    queryFn: () => user ? base44.entities.Follow.filter({ follower_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  // 전체 유저 목록 (프로필 정보용)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const unfollowMutation = useMutation({
    mutationFn: async (targetEmail) => {
      const followRecord = myFollowing.find(
        f => f.follower_email === user.email && f.following_email === targetEmail
      );
      if (followRecord) {
        await base44.entities.Follow.delete(followRecord.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myFollowing'] });
    },
  });

  const handleUnfollow = (targetEmail, targetName) => {
    if (confirm(`${targetName}님을 언팔로우 하시겠습니까?`)) {
      unfollowMutation.mutate(targetEmail);
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

  // 팔로잉 이메일 목록
  const followingEmails = myFollowing.map(f => f.following_email);
  
  // 팔로잉 유저 정보
  const followingUsers = allUsers.filter(u => followingEmails.includes(u.email));

  // 검색 필터링
  const filteredFollowing = followingUsers.filter(u =>
    (u.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">팔로잉</h1>
            <p className="text-gray-400 text-sm">{myFollowing.length}명을 팔로우 중</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Input
            type="text"
            placeholder="이름 또는 이메일 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Following List */}
      <div className="px-4 py-6">
        {filteredFollowing.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredFollowing.map((followingUser) => (
                <motion.div
                  key={followingUser.email}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="bg-gray-900 border-gray-800 p-4 hover:border-cyan-400/50 transition-all">
                    <div className="flex items-center gap-3">
                      <Link to={createPageUrl(`UserProfile?email=${followingUser.email}`)} className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center overflow-hidden">
                          {followingUser.profile_image ? (
                            <img
                              src={followingUser.profile_image}
                              alt={followingUser.nickname || followingUser.full_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-white font-bold text-lg">
                              {(followingUser.nickname || followingUser.full_name).charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </Link>

                      <Link to={createPageUrl(`UserProfile?email=${followingUser.email}`)} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-bold text-base truncate hover:text-cyan-400 transition-colors">
                            {followingUser.nickname || followingUser.full_name}
                          </h3>
                          {followingUser.role === 'admin' && (
                            <Badge className="bg-purple-500 text-white text-xs">Admin</Badge>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm truncate">{followingUser.email}</p>
                        {followingUser.catches_count > 0 && (
                          <p className="text-gray-500 text-xs mt-1">
                            🎪 {followingUser.catches_count} catches
                          </p>
                        )}
                      </Link>

                      <Button
                        onClick={() => handleUnfollow(followingUser.email, followingUser.nickname || followingUser.full_name)}
                        disabled={unfollowMutation.isLoading}
                        size="sm"
                        variant="outline"
                        className="flex-shrink-0 border-gray-700 text-gray-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-400"
                      >
                        <UserMinus className="w-4 h-4 mr-1" />
                        언팔로우
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : myFollowing.length > 0 && searchQuery ? (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">검색 결과가 없습니다</h3>
            <p className="text-gray-500 text-sm">다른 검색어를 입력해보세요</p>
          </Card>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">아직 팔로우 중인 사용자가 없습니다</h3>
            <p className="text-gray-500 text-sm mb-6">
              관심있는 축제 랭커나 친구들을 팔로우해보세요!
            </p>
            <Link to={createPageUrl("Community")}>
              <Button className="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600">
                커뮤니티 가기
              </Button>
            </Link>
          </Card>
        )}
      </div>

      {/* Info Card */}
      {myFollowing.length > 0 && (
        <div className="px-4 py-6">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              💡 팔로잉 관리 팁
            </h3>
            <ul className="text-gray-300 text-sm space-y-2">
              <li>• 언팔로우 버튼을 눌러 팔로우를 취소할 수 있어요</li>
              <li>• 사용자 이름을 클릭하면 프로필을 확인할 수 있어요</li>
              <li>• 팔로우한 사용자의 게시물을 우선적으로 볼 수 있어요</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}