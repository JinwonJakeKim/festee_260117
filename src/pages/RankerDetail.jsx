
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, Youtube, Instagram, Facebook, Heart, MessageCircle } from "lucide-react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export default function RankerDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const rankerEmail = urlParams.get('email');
  const [newPost, setNewPost] = useState("");

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [rankerEmail]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: ranker } = useQuery({
    queryKey: ['ranker', rankerEmail],
    queryFn: async () => {
      const rankers = await base44.entities.Ranker.filter({ user_email: rankerEmail });
      return rankers[0];
    },
    enabled: !!rankerEmail,
  });

  const { data: topFestivals } = useQuery({
    queryKey: ['topFestivals', ranker?.top_festivals],
    queryFn: async () => {
      if (!ranker?.top_festivals) return [];
      const festivals = await base44.entities.Festival.list();
      return festivals.filter(f => ranker.top_festivals.includes(f.id)).slice(0, 3);
    },
    enabled: !!ranker?.top_festivals,
    initialData: [],
  });

  const { data: posts } = useQuery({
    queryKey: ['rankerPosts', rankerEmail],
    queryFn: () => base44.entities.RankerPost.filter({ ranker_email: rankerEmail }, '-created_date'),
    enabled: !!rankerEmail,
    initialData: [],
  });

  const { data: isFollowing } = useQuery({
    queryKey: ['isFollowing', user?.email, rankerEmail],
    queryFn: async () => {
      if (!user) return false;
      const follows = await base44.entities.Follow.filter({
        follower_email: user.email,
        following_email: rankerEmail
      });
      return follows.length > 0;
    },
    enabled: !!user && !!rankerEmail,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({
          follower_email: user.email,
          following_email: rankerEmail
        });
        if (follows[0]) {
          await base44.entities.Follow.delete(follows[0].id);
        }
        await base44.entities.Ranker.update(ranker.id, {
          followers_count: Math.max(0, (ranker.followers_count || 0) - 1)
        });
      } else {
        await base44.entities.Follow.create({
          follower_email: user.email,
          following_email: rankerEmail
        });
        await base44.entities.Ranker.update(ranker.id, {
          followers_count: (ranker.followers_count || 0) + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranker'] });
      queryClient.invalidateQueries({ queryKey: ['isFollowing'] });
    },
  });

  const postMutation = useMutation({
    mutationFn: (content) => base44.entities.RankerPost.create({
      ranker_email: user.email,
      content,
      media_type: "text"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankerPosts'] });
      setNewPost("");
    },
  });

  if (!ranker) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Background Image */}
      <div className="relative h-48">
        <img
          src={ranker.background_image || "https://images.unsplash.com/photo-1470229722913?w=800"}
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
        
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {user && user.email !== rankerEmail && (
          <Button
            onClick={() => followMutation.mutate()}
            className="absolute top-4 right-4 rounded-full"
            variant={isFollowing ? "outline" : "default"}
          >
            {isFollowing ? "팔로잉" : "팔로우"}
          </Button>
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 -mt-16 relative">
        <div className="flex items-end gap-4 mb-4">
          <div className="w-24 h-24 rounded-full border-4 border-black overflow-hidden bg-gradient-to-r from-cyan-400 to-pink-500">
            {ranker.profile_image ? (
              <img src={ranker.profile_image} alt={ranker.nickname} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                {ranker.nickname[0]}
              </div>
            )}
          </div>
          <div className="flex-1 pb-2">
            <h1 className="text-white text-2xl font-bold mb-1">{ranker.nickname}</h1>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-white font-bold">{ranker.catches_count || 0}</span>
                <span className="text-gray-400 ml-1">캐치</span>
              </div>
              <div>
                <span className="text-white font-bold">{ranker.followers_count || 0}</span>
                <span className="text-gray-400 ml-1">팔로워</span>
              </div>
              <div>
                <span className="text-white font-bold">{ranker.following_count || 0}</span>
                <span className="text-gray-400 ml-1">팔로잉</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        {ranker.bio && (
          <p className="text-gray-300 mb-4">{ranker.bio}</p>
        )}

        {/* Social Links */}
        <div className="flex gap-3 mb-6">
          {ranker.youtube_url && (
            <a href={ranker.youtube_url} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
            </a>
          )}
          {ranker.instagram_url && (
            <a href={ranker.instagram_url} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
            </a>
          )}
          {ranker.twitter_url && (
            <a href={ranker.twitter_url} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-black border border-white flex items-center justify-center">
                <XIcon className="w-5 h-5 text-white" />
              </div>
            </a>
          )}
          {ranker.facebook_url && (
            <a href={ranker.facebook_url} target="_blank" rel="noopener noreferrer">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-white" />
              </div>
            </a>
          )}
        </div>

        {/* Top 3 Festivals */}
        {topFestivals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">🏆 추천하고 싶은 축제 Top3</h2>
            <div className="space-y-3">
              {topFestivals.map((festival, idx) => (
                <Link key={festival.id} to={createPageUrl(`FestivalDetail?id=${festival.id}`)}>
                  <Card className="bg-gray-900 border-gray-800 p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors">
                    <span className="text-2xl font-bold text-cyan-400">{idx + 1}</span>
                    <img
                      src={festival.thumbnail_url}
                      alt={festival.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="text-white font-bold text-sm">{festival.name}</h3>
                      <p className="text-gray-400 text-xs">{festival.city}, {festival.country}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Post Input (if own profile) */}
        {user && user.email === rankerEmail && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
            <Textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="무엇을 공유하고 싶나요?"
              className="bg-gray-800 border-gray-700 text-white mb-3"
            />
            <Button
              onClick={() => newPost.trim() && postMutation.mutate(newPost)}
              disabled={!newPost.trim()}
              className="w-full bg-cyan-500 hover:bg-cyan-600"
            >
              게시
            </Button>
          </Card>
        )}
      </div>

      {/* Feed - Updated as per outline */}
      <div className="px-4 py-6">
        <h2 className="text-white text-xl font-bold mb-4">피드</h2>
        {posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => (
              <Card key={post.id} className="bg-gray-900 border-gray-800">
                {/* Media content */}
                {post.media_type === "youtube" && post.media_url && (
                  <div className="rounded-t-lg overflow-hidden">
                    <a href={post.media_url} target="_blank" rel="noopener noreferrer">
                      <div className="bg-gray-800 p-4 flex items-center gap-3 hover:bg-gray-700 transition-colors">
                        <Youtube className="w-8 h-8 text-red-600" />
                        <span className="text-white">YouTube 영상 보기</span>
                      </div>
                    </a>
                  </div>
                )}
                
                {post.media_type === "image" && post.media_url && (
                  <img
                    src={post.media_url}
                    alt="Post media"
                    className="w-full rounded-t-lg object-cover"
                  />
                )}

                <div className="p-4">
                  <p className="text-white mb-2 whitespace-pre-wrap">{post.content}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <div className="flex items-center gap-4">
                      <button className="flex items-center gap-1 hover:text-pink-500">
                        <Heart className="w-4 h-4" />
                        {post.likes_count || 0}
                      </button>
                      <button className="flex items-center gap-1 hover:text-cyan-400">
                        <MessageCircle className="w-4 h-4" />
                        {post.comments_count || 0}
                      </button>
                    </div>
                    <span>{safeFormatDate(post.created_date, 'yyyy.MM.dd')}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-gray-900 border-gray-800 p-12 text-center">
            <p className="text-gray-500">아직 게시물이 없습니다</p>
          </Card>
        )}
      </div>
    </div>
  );
}
