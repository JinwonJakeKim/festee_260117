import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Image as ImageIcon, X, MapPin, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";

export default function CreatePost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [formData, setFormData] = useState({
    type: "같이가기",
    title: "",
    content: "",
    festival_id: "",
    festival_name: "",
    festival_location: "",
    festival_category: "",
    festival_date: null,
    image_urls: [],
    max_participants: 4,
  });

  const [uploadingImages, setUploadingImages] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festivals } = useQuery({
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list(),
    initialData: [],
  });

  // 비로그인 상태면 로그인 모달 표시
  useEffect(() => {
    if (!userLoading && !user) {
      setShowLoginModal(true);
    }
  }, [user, userLoading]);

  const createPostMutation = useMutation({
    mutationFn: async (postData) => {
      await base44.entities.Post.create(postData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(createPageUrl("Community"));
    },
  });

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImages(true);
    try {
      const uploadPromises = files.map(file => 
        base44.integrations.Core.UploadFile({ file })
      );
      const results = await Promise.all(uploadPromises);
      const urls = results.map(result => result.file_url);
      
      setFormData(prev => ({
        ...prev,
        image_urls: [...prev.image_urls, ...urls]
      }));
    } catch (error) {
      console.error("Image upload failed:", error);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemoveImage = (indexToRemove) => {
    setFormData(prev => ({
      ...prev,
      image_urls: prev.image_urls.filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleFestivalSelect = (festivalId) => {
    const festival = festivals.find(f => f.id === festivalId);
    if (festival) {
      setFormData(prev => ({
        ...prev,
        festival_id: festival.id,
        festival_name: festival.name,
        festival_location: `${festival.city}, ${festival.country}`,
        festival_category: festival.category,
        festival_date: festival.start_date,
      }));
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    if (!formData.title.trim() || !formData.content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    const postData = {
      ...formData,
      author_email: user.email,
      author_name: user.full_name,
      author_profile_image: user.profile_image,
      temperature: user.temperature || 36.5,
    };

    await createPostMutation.mutateAsync(postData);
  };

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(createPageUrl("CreatePost"));
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Login Prompt Modal */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          navigate(createPageUrl("Community"));
        }}
        onLogin={handleLoginRedirect}
        message="게시글을 작성하려면 로그인이 필요합니다"
      />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">글쓰기</h1>
          <Button
            onClick={handleSubmit}
            disabled={createPostMutation.isLoading || !user}
            className="bg-cyan-500 hover:bg-cyan-600"
          >
            {createPostMutation.isLoading ? "작성 중..." : "완료"}
          </Button>
        </div>
      </div>

      {user && (
        <div className="px-4 py-6 space-y-4">
          {/* Post Type */}
          <div>
            <label className="text-white text-sm font-bold mb-2 block">게시글 유형</label>
            <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value})}>
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <SelectItem value="같이가기" className="text-white">같이가기</SelectItem>
                <SelectItem value="후기" className="text-white">후기</SelectItem>
                <SelectItem value="질문" className="text-white">질문</SelectItem>
                <SelectItem value="정보공유" className="text-white">정보공유</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Festival Selection */}
          <div>
            <label className="text-white text-sm font-bold mb-2 block">관련 축제 (선택)</label>
            <Select value={formData.festival_id} onValueChange={handleFestivalSelect}>
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                <SelectValue placeholder="축제를 선택하세요" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 max-h-60">
                {festivals.map(festival => (
                  <SelectItem key={festival.id} value={festival.id} className="text-white">
                    {festival.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.festival_name && (
              <Card className="bg-gray-900 border-gray-800 p-3 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span className="text-gray-400">{formData.festival_location}</span>
                </div>
                {formData.festival_date && (
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <CalendarIcon className="w-4 h-4 text-pink-500" />
                    <span className="text-gray-400">
                      {format(new Date(formData.festival_date), 'yy.M.d', { locale: ko })}
                    </span>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-white text-sm font-bold mb-2 block">제목</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="제목을 입력하세요"
              className="bg-gray-900 border-gray-800 text-white"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-white text-sm font-bold mb-2 block">내용</label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({...formData, content: e.target.value})}
              placeholder="내용을 입력하세요"
              rows={10}
              className="bg-gray-900 border-gray-800 text-white"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="text-white text-sm font-bold mb-2 block">이미지 (선택)</label>
            <div className="flex gap-2 flex-wrap">
              {formData.image_urls.map((url, idx) => (
                <div key={idx} className="relative w-24 h-24">
                  <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                  <button
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
              {formData.image_urls.length < 4 && (
                <label className="w-24 h-24 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-cyan-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploadingImages}
                  />
                  {uploadingImages ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-cyan-400" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-600" />
                  )}
                </label>
              )}
            </div>
          </div>

          {/* Max Participants (for 같이가기 type) */}
          {formData.type === "같이가기" && (
            <div>
              <label className="text-white text-sm font-bold mb-2 block">최대 참가 인원</label>
              <Input
                type="number"
                value={formData.max_participants}
                onChange={(e) => setFormData({...formData, max_participants: parseInt(e.target.value) || 4})}
                min="2"
                max="20"
                className="bg-gray-900 border-gray-800 text-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}