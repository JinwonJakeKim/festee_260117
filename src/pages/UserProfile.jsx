import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Youtube, Instagram, Facebook, Heart, MessageCircle, Star, Camera, Send, MapPin } from "lucide-react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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

export default function UserProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const profileUserEmail = urlParams.get('email');
  const [newPost, setNewPost] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [profileUserEmail]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: profileUser, isLoading: isLoadingUser, error: userError } = useQuery({
    queryKey: ['profileUser', profileUserEmail],
    queryFn: async () => {
      console.log('=== 프로필 유저 조회 ===');
      console.log('이메일:', profileUserEmail);
      
      const users = await base44.entities.User.filter({ email: profileUserEmail });
      console.log('조회된 유저:', users);
      
      if (!users || users.length === 0) {
        // 유저가 없으면 기본 정보 반환
        return {
          email: profileUserEmail,
          full_name: profileUserEmail.split('@')[0],
          profile_image: null,
          bio: null,
          catches_count: 0,
          recommended_festivals: [],
          city_verified: false, // Default for missing user
          home_city: null, // Default for missing user
        };
      }
      
      return users[0];
    },
    enabled: !!profileUserEmail,
    retry: 1,
  });

  const { data: ranker } = useQuery({
    queryKey: ['ranker', profileUserEmail],
    queryFn: async () => {
      const rankers = await base44.entities.Ranker.filter({ user_email: profileUserEmail });
      return rankers[0];
    },
    enabled: !!profileUserEmail,
  });

  const { data: recommendedFestivals } = useQuery({
    queryKey: ['recommendedFestivals', profileUser?.recommended_festivals],
    queryFn: async () => {
      if (!profileUser?.recommended_festivals || profileUser.recommended_festivals.length === 0) return [];
      const festivals = await base44.entities.Festival.list();
      return profileUser.recommended_festivals.map(rec => ({
        festival: festivals.find(f => f.id === rec.festival_id),
        comment: rec.comment
      })).filter(item => item.festival);
    },
    enabled: !!profileUser?.recommended_festivals,
    initialData: [],
  });

  const { data: userPosts } = useQuery({
    queryKey: ['userPosts', profileUserEmail],
    queryFn: () => base44.entities.Post.filter({ author_email: profileUserEmail }, '-created_date'),
    enabled: !!profileUserEmail,
    initialData: [],
  });

  const { data: rankerPosts } = useQuery({
    queryKey: ['rankerPosts', profileUserEmail],
    queryFn: () => base44.entities.RankerPost.filter({ ranker_email: profileUserEmail }, '-created_date'),
    enabled: !!profileUserEmail,
    initialData: [],
  });

  const { data: userCatches } = useQuery({
    queryKey: ['userCatches', profileUserEmail],
    queryFn: () => base44.entities.Catch.filter({ user_email: profileUserEmail }),
    enabled: !!profileUserEmail,
    initialData: [],
  });

  const { data: isFollowing } = useQuery({
    queryKey: ['isFollowing', currentUser?.email, profileUserEmail],
    queryFn: async () => {
      if (!currentUser) return false;
      const follows = await base44.entities.Follow.filter({
        follower_email: currentUser.email,
        following_email: profileUserEmail
      });
      return follows.length > 0;
    },
    enabled: !!currentUser && !!profileUserEmail,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({
          follower_email: currentUser.email,
          following_email: profileUserEmail
        });
        if (follows[0]) {
          await base44.entities.Follow.delete(follows[0].id);
        }
        if (ranker) {
          await base44.entities.Ranker.update(ranker.id, {
            followers_count: Math.max(0, (ranker.followers_count || 0) - 1)
          });
        }
      } else {
        await base44.entities.Follow.create({
          follower_email: currentUser.email,
          following_email: profileUserEmail
        });
        if (ranker) {
          await base44.entities.Ranker.update(ranker.id, {
            followers_count: (ranker.followers_count || 0) + 1
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranker'] });
      queryClient.invalidateQueries({ queryKey: ['isFollowing'] });
    },
  });

  const postMutation = useMutation({
    mutationFn: (content) => base44.entities.RankerPost.create({
      ranker_email: currentUser.email,
      content,
      media_type: "text"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankerPosts'] });
      setNewPost("");
    },
  });

  // 이메일이 없는 경우
  if (!profileUserEmail) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <p className="text-gray-400 mb-4">사용자를 찾을 수 없습니다</p>
        <Button onClick={() => navigate(-1)}>돌아가기</Button>
      </div>
    );
  }

  // 로딩 중
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4" />
          <p className="text-gray-400">프로필을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 발생
  if (userError) {
    console.error('프로필 로딩 에러:', userError);
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <p className="text-red-400 mb-4">프로필을 불러올 수 없습니다</p>
        <p className="text-gray-500 text-sm mb-4">{userError.message}</p>
        <Button onClick={() => navigate(-1)}>돌아가기</Button>
      </div>
    );
  }

  // 유저가 없는 경우 (필터가 실패한 경우)
  if (!profileUser) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <p className="text-gray-400 mb-4">사용자를 찾을 수 없습니다</p>
        <Button onClick={() => navigate(-1)}>돌아가기</Button>
      </div>
    );
  }

  const isOwnProfile = currentUser && currentUser.email === profileUserEmail;
  const displayName = profileUser.full_name || profileUserEmail.split('@')[0];
  const profileImage = profileUser.profile_image;
  const backgroundImage = ranker?.background_image;
  const bio = profileUser.bio || ranker?.bio;
  const catchesCount = profileUser.catches_count || 0;
  const followersCount = ranker?.followers_count || 0;
  const followingCount = ranker?.following_count || 0;
  const isCityVerified = profileUser.city_verified;
  const homeCity = profileUser.home_city;

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Background Image */}
      <div className="relative h-48 bg-gradient-to-br from-gray-900 via-black to-gray-900">
        {backgroundImage && (
        <img
          src={backgroundImage}
          alt="Background"
          className="w-full h-full object-cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
        
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {currentUser && !isOwnProfile && (
          <div className="absolute top-4 right-4 flex gap-2">
            <Link to={createPageUrl(`MessageDetail?user=${profileUserEmail}&name=${encodeURIComponent(displayName)}&image=${encodeURIComponent(profileImage || '')}`)}>
              <Button className="bg-gray-900/80 backdrop-blur-sm hover:bg-gray-800 rounded-full">
                <Send className="w-4 h-4 mr-2" />
                메시지
              </Button>
            </Link>
            <Button
              onClick={() => followMutation.mutate()}
              className="rounded-full"
              variant={isFollowing ? "outline" : "default"}
            >
              {isFollowing ? "팔로잉" : "팔로우"}
            </Button>
          </div>
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 -mt-16 relative">
        <div className="flex items-end gap-4 mb-4">
          <div className="w-24 h-24 rounded-full border-4 border-black overflow-hidden bg-gradient-to-r from-cyan-400 to-pink-500">
            {profileImage ? (
              <img src={profileImage} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                {displayName[0]}
              </div>
            )}
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-white text-2xl font-bold">{displayName}</h1>
              {isCityVerified && homeCity && (
                <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {homeCity} 인증
                </Badge>
              )}
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-white font-bold">{catchesCount}</span>
                <span className="text-gray-400 ml-1">캐치</span>
              </div>
              <div>
                <span className="text-white font-bold">{followersCount}</span>
                <span className="text-gray-400 ml-1">팔로워</span>
              </div>
              <div>
                <span className="text-white font-bold">{followingCount}</span>
                <span className="text-gray-400 ml-1">팔로잉</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bio */}
        {bio && (
          <p className="text-gray-300 mb-4">{bio}</p>
        )}

        {/* Social Links */}
        {ranker && (ranker.youtube_url || ranker.instagram_url || ranker.twitter_url || ranker.facebook_url) && (
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
        )}

        {/* Recommended Festivals */}
        {recommendedFestivals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-white font-bold text-lg mb-3">🏆 추천하고 싶은 축제 Top3</h2>
            <div className="space-y-3">
              {recommendedFestivals.map((item, idx) => (
                <Link key={item.festival.id} to={createPageUrl(`FestivalDetail?id=${item.festival.id}`)}>
                  <Card className="bg-gray-900 border-gray-800 p-3 hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl font-bold text-cyan-400">{idx + 1}</span>
                      <img
                        src={item.festival.thumbnail_url}
                        alt={item.festival.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="text-white font-bold text-sm">{item.festival.name}</h3>
                        <p className="text-gray-400 text-xs">{item.festival.city}, {item.festival.country}</p>
                      </div>
                    </div>
                    {item.comment && (
                      <p className="text-gray-300 text-sm pl-11 italic">"{item.comment}"</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Post Input (if own profile and is ranker) */}
        {isOwnProfile && ranker && (
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
      </div> {/* End of Profile Info section wrapper */}

      {/* Tabs for Catches & Posts */}
      <div className="px-4 py-6">
        <Tabs defaultValue="catches" className="w-full">
          <TabsList className="w-full bg-gray-900 mb-4">
            <TabsTrigger value="catches" className="flex-1 data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              캐치 ({userCatches.length})
            </TabsTrigger>
            <TabsTrigger value="posts" className="flex-1 data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
              게시글 ({userPosts.length})
            </TabsTrigger>
            {ranker && (
              <TabsTrigger value="feed" className="flex-1 data-[state=active]:bg-cyan-400 data-[state=active]:text-black">
                피드 ({rankerPosts.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* User's Catches Tab Content */}
          <TabsContent value="catches" className="pt-4">
            {userCatches.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {userCatches.map((catchItem) => (
                  <div key={catchItem.id} className="aspect-square rounded-lg overflow-hidden relative">
                    <img
                      src={catchItem.image_url}
                      alt={catchItem.festival_name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-white text-xs font-bold truncate">{catchItem.festival_name}</p>
                      <p className="text-gray-300 text-[10px]">{safeFormatDate(catchItem.created_date, 'yy.M.d')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="bg-gray-900 border-gray-800 p-12 text-center">
                <Camera className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500">아직 캐치가 없습니다</p>
              </Card>
            )}
          </TabsContent>

          {/* Community Posts Tab Content */}
          <TabsContent value="posts" className="pt-4">
            {userPosts.length > 0 ? (
              <div className="space-y-3">
                {userPosts.map((post) => (
                  <Link key={post.id} to={createPageUrl(`PostDetail?id=${post.id}`)}>
                    <Card className="bg-gray-900 border-gray-800 hover:border-cyan-400/50 transition-all p-4">
                      <Badge className="mb-2 bg-purple-500/20 text-purple-400">{post.type}</Badge>
                      <h3 className="text-white font-bold mb-2">{post.title}</h3>
                      <p className="text-gray-400 text-sm line-clamp-2 mb-2">{post.content}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{safeFormatDate(post.created_date, 'yy.M.d')}</span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {post.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {post.comments_count || 0}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">아직 게시글이 없습니다</p>
              </div>
            )}
          </TabsContent>

          {/* Ranker Feed Tab Content */}
          {ranker && (
            <TabsContent value="feed" className="pt-4">
              {rankerPosts.length > 0 ? (
                <div className="space-y-4">
                  {rankerPosts.map((post) => (
                    <Card key={post.id} className="bg-gray-900 border-gray-800">
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
                          className="w-full rounded-t-lg"
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
                          <span>{safeFormatDate(post.created_date, 'yy.M.d')}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">아직 피드가 없습니다</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}