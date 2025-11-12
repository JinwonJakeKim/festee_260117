import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Users, UserPlus, UserMinus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

export default function MyFollowers() {
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

  // 나를 팔로우하는 사람들 (팔로워)
  const { data: myFollowers = [] } = useQuery({
    queryKey: ['myFollowers', user?.email],
    queryFn: () => user ? base44.entities.Follow.filter({ following_email: user.email }) : [],
    enabled: !!user,
    initialData: [],
  });

  // 내가 팔로우하는 사람들
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

  const followMutation = useMutation({
    mutationFn: async (targetEmail) => {
      await base44.entities.Follow.create({
        follower_email: user.email,
        following_email: targetEmail,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myFollowing'] });
    },
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

  const handleFollowToggle = (targetEmail) => {
    const isFollowing = myFollowing.some(
      f => f.follower_email === user.email && f.following_email === targetEmail
    );

    if (isFollowing) {
      unfollowMutation.mutate(targetEmail);
    } else {
      followMutation.mutate(targetEmail);
    }
  };

  const isFollowingUser = (targetEmail) => {
    return myFollowing.some(
      f => f.follower_email === user.email && f.following_email === targetEmail
    );
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

  // 팔로워 이메일 목록
  const followerEmails = myFollowers.map(f => f.follower_email);
  
  // 팔로워 유저 정보
  const followerUsers = allUsers.filter(u => followerEmails.includes(u.email));

  // 검색 필터링
  const filteredFollowers = followerUsers.filter(u =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
            <h1 className="text-xl font-bold text-white">팔로워</h1>
            <p className="text-gray-400 text-sm">{myFollowers.length}명이 나를 팔로우 중</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
          <Input
            type="text"
            placeholder="이름 또는 이메일 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Followers List */}
      <div className="px-4 py-6">
        {filteredFollowers.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredFollowers.map((follower) => {
                const isFollowingBack = isFollowingUser(follower.email);
                
                return (
                  <motion.div
                    key={follower.email}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-gray-900 border-gray-800 p-4 hover:border-cyan-400/50 transition-all">
                      <div className="flex items-center gap-3">
                        <Link to={createPageUrl(`UserProfile?email=${follower.email}`)} className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center overflow-hidden">
                            {follower.profile_image ? (
                              <img
                                src={follower.profile_image}
                                alt={follower.full_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-white font-bold text-lg">
                                {follower.full_name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </Link>

                        <Link to={createPageUrl(`UserProfile?email=${follower.email}`)} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white font-bold text-base truncate hover:text-cyan-400 transition-colors">
                              {follower.full_name}
                            </h3>
                            {follower.role === 'admin' && (
                              <Badge className="bg-purple-500 text-white text-xs">Admin</Badge>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm truncate">{follower.email}</p>
                          {follower.catches_count > 0 && (
                            <p className="text-gray-500 text-xs mt-1">
                              🎪 {follower.catches_count} catches
                            </p>
                          )}
                        </Link>

                        <Button
                          onClick={() => handleFollowToggle(follower.email)}
                          disabled={followMutation.isLoading || unfollowMutation.isLoading}
                          size="sm"
                          className={`flex-shrink-0 ${
                            isFollowingBack
                              ? 'bg-gray-700 hover:bg-gray-600 text-white'
                              : 'bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white'
                          }`}
                        >
                          {isFollowingBack ? (
                            <>
                              <UserMinus className="w-4 h-4 mr-1" />
                              팔로잉
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4 mr-1" />
                              팔로우
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : myFollowers.length > 0 && searchQuery ? (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">검색 결과가 없습니다</h3>
            <p className="text-gray-500 text-sm">다른 검색어를 입력해보세요</p>
          </Card>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">아직 팔로워가 없습니다</h3>
            <p className="text-gray-500 text-sm mb-6">
              커뮤니티 활동을 통해 다른 사용자들과 소통해보세요!
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
      {myFollowers.length > 0 && (
        <div className="px-4 py-6">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              💡 팔로워 관리 팁
            </h3>
            <ul className="text-gray-300 text-sm space-y-2">
              <li>• 팔로우 버튼을 눌러 팔로워를 맞팔로우 할 수 있어요</li>
              <li>• 사용자 이름을 클릭하면 프로필을 확인할 수 있어요</li>
              <li>• 커뮤니티 활동을 통해 더 많은 팔로워를 만나보세요</li>
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}