import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminFestivalForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const festivalId = urlParams.get('id');
  const isEdit = !!festivalId;

  const [formData, setFormData] = useState({
    name: "",
    summary: "",
    description_original: "",
    country: "",
    city: "",
    category: "음악",
    start_date: "",
    end_date: "",
    latitude: 0,
    longitude: 0,
    thumbnail_url: "",
    video_url: "",
    youtube_shorts_urls: [],
    website: "",
    price: 0,
    highlights: [],
    lineup: [],
    tags: [],
  });

  const [newHighlight, setNewHighlight] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newLineupDate, setNewLineupDate] = useState("");
  const [newLineupArtists, setNewLineupArtists] = useState("");
  const [newShortUrl, setNewShortUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading: isUserLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: festival, isLoading: isFestivalLoading } = useQuery({
    queryKey: ['festival', festivalId],
    queryFn: () => base44.entities.Festival.filter({ id: festivalId }).then(res => res[0]),
    enabled: isEdit,
  });

  useEffect(() => {
    if (festival && isEdit) {
      setFormData({
        name: festival.name || "",
        summary: festival.summary || "",
        description: festival.description || "",
        country: festival.country || "",
        city: festival.city || "",
        category: festival.category || "음악",
        start_date: festival.start_date || "",
        end_date: festival.end_date || "",
        latitude: festival.latitude || 0,
        longitude: festival.longitude || 0,
        thumbnail_url: festival.thumbnail_url || "",
        video_url: festival.video_url || "",
        youtube_shorts_urls: festival.youtube_shorts_urls || [],
        website: festival.website || "",
        price: festival.price || 0,
        highlights: festival.highlights || [],
        lineup: festival.lineup || [],
        tags: festival.tags || [],
      });
    }
  }, [festival, isEdit]);

  // 권한 체크
  useEffect(() => {
    if (!isUserLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(createPageUrl("AdminDashboard"));
    }
  }, [user, isUserLoading, navigate]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) {
        await base44.entities.Festival.update(festivalId, data);
      } else {
        await base44.entities.Festival.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festivals'] });
      alert(isEdit ? '축제가 수정되었습니다' : '축제가 추가되었습니다');
      navigate(-1);
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, thumbnail_url: file_url });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      setFormData({
        ...formData,
        highlights: [...formData.highlights, newHighlight.trim()]
      });
      setNewHighlight("");
    }
  };

  const handleRemoveHighlight = (index) => {
    setFormData({
      ...formData,
      highlights: formData.highlights.filter((_, i) => i !== index)
    });
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag("");
    }
  };

  const handleRemoveTag = (index) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((_, i) => i !== index)
    });
  };

  const handleAddLineup = () => {
    if (newLineupDate.trim() && newLineupArtists.trim()) {
      const artists = newLineupArtists.split(',').map(a => a.trim()).filter(a => a);
      setFormData({
        ...formData,
        lineup: [...formData.lineup, { date: newLineupDate.trim(), artists }]
      });
      setNewLineupDate("");
      setNewLineupArtists("");
    }
  };

  const handleRemoveLineup = (index) => {
    setFormData({
      ...formData,
      lineup: formData.lineup.filter((_, i) => i !== index)
    });
  };

  const handleAddShortUrl = () => {
    if (newShortUrl.trim() && formData.youtube_shorts_urls.length < 5) {
      setFormData({
        ...formData,
        youtube_shorts_urls: [...formData.youtube_shorts_urls, newShortUrl.trim()]
      });
      setNewShortUrl("");
    } else if (formData.youtube_shorts_urls.length >= 5) {
      alert('최대 5개까지만 추가할 수 있습니다');
    }
  };

  const handleRemoveShortUrl = (index) => {
    setFormData({
      ...formData,
      youtube_shorts_urls: formData.youtube_shorts_urls.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.country || !formData.city || !formData.start_date || !formData.end_date) {
      alert('필수 항목을 모두 입력해주세요');
      return;
    }
    saveMutation.mutate(formData);
  };

  // 로딩 상태 처리
  if (isUserLoading || (isEdit && isFestivalLoading)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

  // 권한 없음
  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">
              {isEdit ? '축제 수정' : '축제 추가'}
            </h1>
          </div>
          <Button
            onClick={handleSubmit}
            className="bg-cyan-500 hover:bg-cyan-600"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-6">
        {/* 기본 정보 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">기본 정보</h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">축제 이름 *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="예: 코첼라 뮤직 페스티벌"
                required
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">축제 요약 (1-2줄)</label>
              <Textarea
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="축제를 간단히 요약해주세요 (1-2줄)"
                rows={2}
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">상세 설명</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="축제에 대한 상세한 설명을 입력하세요"
                rows={8} // Changed rows to 8
              />
              <p className="text-gray-500 text-xs mt-1">
                💡 단락 구분을 위해 빈 줄을 추가하세요
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">국가 *</label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="예: 미국"
                  required
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">도시 *</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="예: 인디오"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">카테고리</label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="음악" className="text-white">음악</SelectItem>
                  <SelectItem value="문화" className="text-white">문화</SelectItem>
                  <SelectItem value="예술" className="text-white">예술</SelectItem>
                  <SelectItem value="음식" className="text-white">음식</SelectItem>
                  <SelectItem value="스포츠" className="text-white">스포츠</SelectItem>
                  <SelectItem value="지역축제" className="text-white">지역축제</SelectItem>
                  <SelectItem value="기타" className="text-white">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* 날짜 및 가격 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">날짜 및 가격</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">시작일 *</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">종료일 *</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">가격 (원)</label>
              <Input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="0"
              />
              <p className="text-gray-500 text-xs mt-1">무료 입장인 경우 0을 입력하세요</p>
            </div>
          </div>
        </Card>

        {/* 위치 정보 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">위치 정보</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">위도</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="예: 33.6803"
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">경도</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="예: -116.2378"
                />
              </div>
            </div>
            <p className="text-gray-500 text-xs">
              💡 구글 맵에서 위치를 찾아 좌표를 입력하세요
            </p>
          </div>
        </Card>

        {/* 미디어 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">미디어</h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">썸네일 이미지</label>
              {formData.thumbnail_url && (
                <div className="mb-2">
                  <img
                    src={formData.thumbnail_url}
                    alt="Thumbnail"
                    className="w-full h-40 object-cover rounded-lg"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={formData.thumbnail_url}
                  onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white flex-1"
                  placeholder="이미지 URL을 입력하거나 업로드하세요"
                />
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment" 
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-700"
                    disabled={isUploadingImage}
                    asChild
                  >
                    <span>
                      {isUploadingImage ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-cyan-400" />
                      ) : (
                        <Upload className="w-5 h-5 text-gray-900" />
                      )}
                    </span>
                  </Button>
                </label>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                💡 업로드 버튼을 눌러 갤러리에서 이미지를 선택하세요
              </p>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">영상 URL (유튜브)</label>
              <Input
                value={formData.video_url}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">공식 웹사이트</label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="https://..."
              />
            </div>
          </div>
        </Card>

        {/* 유튜브 Shorts */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">유튜브 Shorts (최대 5개)</h2>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newShortUrl}
                onChange={(e) => setNewShortUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddShortUrl())}
                className="bg-gray-800 border-gray-700 text-white flex-1"
                placeholder="유튜브 Shorts URL 입력"
                disabled={formData.youtube_shorts_urls.length >= 5}
              />
              <Button
                type="button"
                onClick={handleAddShortUrl}
                variant="outline"
                className="border-gray-700"
                disabled={formData.youtube_shorts_urls.length >= 5}
              >
                <Plus className="w-5 h-5 text-gray-900" />
              </Button>
            </div>

            {formData.youtube_shorts_urls.length > 0 && (
              <div className="space-y-2">
                {formData.youtube_shorts_urls.map((url, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                    <span className="text-white text-sm truncate flex-1">{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveShortUrl(index)}
                      className="text-red-400 hover:text-red-300 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-gray-500 text-xs">
              💡 유튜브 Shorts URL을 입력하세요 (예: https://youtube.com/shorts/...)
            </p>
          </div>
        </Card>

        {/* 하이라이트 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">하이라이트</h2>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddHighlight())}
                className="bg-gray-800 border-gray-700 text-white flex-1"
                placeholder="하이라이트 입력 후 추가 버튼 클릭"
              />
              <Button
                type="button"
                onClick={handleAddHighlight}
                variant="outline"
                className="border-gray-700"
              >
                <Plus className="w-5 h-5 text-gray-900" />
              </Button>
            </div>

            {formData.highlights.length > 0 && (
              <div className="space-y-2">
                {formData.highlights.map((highlight, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                    <span className="text-white text-sm">• {highlight}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHighlight(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 태그 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">태그</h2>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="bg-gray-800 border-gray-700 text-white flex-1"
                placeholder="태그 입력 (예: 연인과, Kpop, 가족과)"
              />
              <Button
                type="button"
                onClick={handleAddTag}
                variant="outline"
                className="border-gray-700"
              >
                <Plus className="w-5 h-5 text-gray-900" />
              </Button>
            </div>

            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, index) => (
                  <Badge
                    key={index}
                    className="bg-cyan-500 text-white flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(index)}
                      className="hover:text-red-300"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 라인업 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">라인업</h2>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                value={newLineupDate}
                onChange={(e) => setNewLineupDate(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="날짜 (예: Day 1 - 4월 12일)"
              />
              <Input
                value={newLineupArtists}
                onChange={(e) => setNewLineupArtists(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="아티스트 (쉼표로 구분, 예: 블랙핑크, BTS, 아이유)"
              />
              <Button
                type="button"
                onClick={handleAddLineup}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                <Plus className="w-5 h-5 mr-2" />
                라인업 추가
              </Button>
            </div>

            {formData.lineup.length > 0 && (
              <div className="space-y-3">
                {formData.lineup.map((item, index) => (
                  <div key={index} className="bg-gray-800 p-3 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-cyan-400 font-bold text-sm">{item.date}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLineup(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-white text-sm">
                      {item.artists.map((artist, i) => (
                        <div key={i}>• {artist}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Submit Button (Mobile) */}
        <Button
          type="submit"
          className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? '저장 중...' : isEdit ? '수정 완료' : '축제 추가'}
        </Button>
      </form>
    </div>
  );
}