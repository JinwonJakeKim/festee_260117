import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Image as ImageIcon, X, MapPin, Calendar as CalendarIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import LoginPromptModal from "../components/LoginPromptModal";
import FestivalPickerModal from "../components/FestivalPickerModal";

const getFestivalDisplayName = (festival) => {
  return festival?.name_ko || festival?.name_en || festival?.name_original || festival?.name_jp || festival?.name_zh || '이름 없음';
};

export default function EditPost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get('id');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showFestivalPicker, setShowFestivalPicker] = useState(false);

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

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => base44.entities.Post.filter({ id: postId }).then(res => res[0]),
    enabled: !!postId,
  });

  // 게시글 데이터로 폼 초기화
  useEffect(() => {
    if (post) {
      setFormData({
        type: post.type || "같이가기",
        title: post.title || "",
        content: post.content || "",
        festival_id: post.festival_id || "",
        festival_name: post.festival_name || "",
        festival_location: post.festival_location || "",
        festival_category: post.festival_category || "",
        festival_date: post.festival_date || null,
        image_urls: post.image_urls || [],
        max_participants: post.max_participants || 4,
      });
    }
  }, [post]);

  // 비로그인 상태면 로그인 모달 표시
  useEffect(() => {
    if (!userLoading && !user) {
      setShowLoginModal(true);
    }
  }, [user, userLoading]);

  // 작성자가 아닌 경우 접근 차단
  useEffect(() => {
    if (!userLoading && !postLoading && user && post && post.author_email !== user.email) {
      alert('본인이 작성한 게시글만 수정할 수 있습니다.');
      navigate(-1);
    }
  }, [user, post, userLoading, postLoading, navigate]);

  const updatePostMutation = useMutation({
    mutationFn: async (postData) => {
      await base44.entities.Post.update(postId, postData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      // 같이가기 게시글인 경우 GoTogetherDetail로, 일반 게시글인 경우 PostDetail로 이동
      if (formData.type === '같이가기') {
        navigate(createPageUrl(`GoTogetherDetail?id=${postId}`));
      } else {
        navigate(createPageUrl(`PostDetail?id=${postId}`));
      }
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

  const handleFestivalSelect = (festival) => {
    if (festival) {
      setFormData(prev => ({
        ...prev,
        festival_id: festival.id,
        festival_name: getFestivalDisplayName(festival),
        festival_location: `${festival.city || ''}, ${festival.country || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || '-',
        festival_category: festival.category,
        festival_date: festival.start_date,
      }));
    }
  };

  const handleFestivalClear = () => {
    setFormData(prev => ({
      ...prev,
      festival_id: "",
      festival_name: "",
      festival_location: "",
      festival_category: "",
      festival_date: null,
    }));
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
      type: formData.type,
      title: formData.title,
      content: formData.content,
      festival_id: formData.festival_id,
      festival_name: formData.festival_name,
      festival_location: formData.festival_location,
      festival_category: formData.festival_category,
      festival_date: formData.festival_date,
      image_urls: formData.image_urls,
      max_participants: formData.type === "같이가기" ? formData.max_participants : null,
    };

    await updatePostMutation.mutateAsync(postData);
  };

  const handleLoginRedirect = () => {
    base44.auth.redirectToLogin(createPageUrl(`EditPost?id=${postId}`));
  };

  if (userLoading || postLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-400">
        게시글을 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          navigate(-1);
        }}
        onLogin={handleLoginRedirect}
        message="게시글을 수정하려면 로그인이 필요합니다"
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
          <h1 className="text-xl font-bold text-white">게시글 수정</h1>
          <Button
            onClick={handleSubmit}
            disabled={updatePostMutation.isLoading || !user}
            className="bg-cyan-500 hover:bg-cyan-600"
          >
            {updatePostMutation.isLoading ? "수정 중..." : "완료"}
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
            {formData.festival_name ? (
              <Card className="bg-gray-900 border-gray-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{formData.festival_name}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="truncate">{formData.festival_location}</span>
                    </div>
                    {formData.festival_date && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <CalendarIcon className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />
                        <span>{format(new Date(formData.festival_date), 'yy.M.d', { locale: ko })}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowFestivalPicker(true)}
                      className="text-xs text-cyan-400 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
                    >
                      변경
                    </button>
                    <button
                      onClick={handleFestivalClear}
                      className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => setShowFestivalPicker(true)}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between text-sm hover:bg-gray-800/60 transition-colors"
              >
                <span className="text-gray-500 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  축제 선택하기
                </span>
                <span className="text-gray-600 text-xs">선택</span>
              </button>
            )}
          </div>

          <FestivalPickerModal
            isOpen={showFestivalPicker}
            onClose={() => setShowFestivalPicker(false)}
            onSelect={handleFestivalSelect}
            selectedFestivalId={formData.festival_id}
          />

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