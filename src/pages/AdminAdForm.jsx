
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function AdminAdForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const adId = urlParams.get('id');
  const isEdit = !!adId;

  const [formData, setFormData] = useState({
    name: "",
    type: "image",
    image_url: "",
    video_url: "",
    link_url: "",
    order: 1,
    is_active: true,
    start_date: "",
    end_date: "",
  });

  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user, isLoading: isUserLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
  });

  const { data: advertisement, isLoading: isAdLoading } = useQuery({
    queryKey: ['advertisement', adId],
    queryFn: () => base44.entities.Advertisement.filter({ id: adId }).then(res => res[0]),
    enabled: isEdit,
  });

  useEffect(() => {
    if (advertisement && isEdit) {
      setFormData({
        name: advertisement.name || "",
        type: advertisement.type || "image",
        image_url: advertisement.image_url || "",
        video_url: advertisement.video_url || "",
        link_url: advertisement.link_url || "",
        order: advertisement.order || 1,
        is_active: advertisement.is_active !== undefined ? advertisement.is_active : true,
        start_date: advertisement.start_date || "",
        end_date: advertisement.end_date || "",
      });
    }
  }, [advertisement, isEdit]);

  useEffect(() => {
    if (!isUserLoading && (!user || user.role !== 'admin')) {
      alert('관리자 권한이 필요합니다');
      navigate(createPageUrl("AdminDashboard"));
    }
  }, [user, isUserLoading, navigate]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) {
        await base44.entities.Advertisement.update(adId, data);
      } else {
        await base44.entities.Advertisement.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      alert(isEdit ? '광고가 수정되었습니다' : '광고가 추가되었습니다');
      navigate(createPageUrl("AdminDashboard"));
    },
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, image_url: file_url });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.image_url || !formData.type) {
      alert('필수 항목을 모두 입력해주세요');
      return;
    }
    saveMutation.mutate(formData);
  };

  if (isUserLoading || (isEdit && isAdLoading)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400" />
      </div>
    );
  }

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
              onClick={() => navigate(createPageUrl("AdminDashboard"))}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">
              {isEdit ? '광고 수정' : '광고 추가'}
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
              <label className="text-gray-400 text-sm mb-2 block">광고 이름 *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="예: Coca-Cola Summer Campaign"
                required
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">광고 타입 *</label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="image" className="text-white">이미지 (클릭 시 이동 안함)</SelectItem>
                  <SelectItem value="video" className="text-white">비디오 (유튜브)</SelectItem>
                  <SelectItem value="link" className="text-white">링크 (외부 사이트)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">순서 *</label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                className="bg-gray-800 border-gray-700 text-white"
                min="1"
                required
              />
              <p className="text-gray-500 text-xs mt-1">작은 숫자가 먼저 표시됩니다</p>
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 flex items-center gap-2">
                <span>활성화</span>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </label>
              <p className="text-gray-500 text-xs mt-1">
                {formData.is_active ? '광고가 표시됩니다' : '광고가 숨겨집니다'}
              </p>
            </div>
          </div>
        </Card>

        {/* 이미지 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">배너 이미지 *</h2>
          
          <div className="space-y-4">
            {formData.image_url && (
              <div className="mb-2">
                <img
                  src={formData.image_url}
                  alt="Ad Banner"
                  className="w-full h-48 object-cover rounded-lg"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white flex-1"
                placeholder="이미지 URL을 입력하거나 업로드하세요"
                required
              />
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
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
                      <Upload className="w-5 h-5" />
                    )}
                  </span>
                </Button>
              </label>
            </div>
            <p className="text-gray-500 text-xs">
              💡 업로드 버튼을 눌러 갤러리에서 이미지를 선택하세요
            </p>
          </div>
        </Card>

        {/* 비디오 URL */}
        {formData.type === 'video' && (
          <Card className="bg-gray-900 border-gray-800 p-4">
            <h2 className="text-white font-bold mb-4">유튜브 영상</h2>
            
            <div>
              <label className="text-gray-400 text-sm mb-2 block">유튜브 URL</label>
              <Input
                value={formData.video_url}
                onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="https://youtube.com/watch?v=... 또는 https://youtu.be/..."
              />
              <p className="text-gray-500 text-xs mt-1">
                배너 클릭 시 모달로 영상이 재생됩니다
              </p>
            </div>
          </Card>
        )}

        {/* 링크 URL */}
        {formData.type === 'link' && (
          <Card className="bg-gray-900 border-gray-800 p-4">
            <h2 className="text-white font-bold mb-4">링크</h2>
            
            <div>
              <label className="text-gray-400 text-sm mb-2 block">링크 URL</label>
              <Input
                value={formData.link_url}
                onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="https://..."
              />
              <p className="text-gray-500 text-xs mt-1">
                배너 클릭 시 새 창에서 열립니다
              </p>
            </div>
          </Card>
        )}

        {/* 기간 설정 */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h2 className="text-white font-bold mb-4">노출 기간</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">시작일</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">종료일</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
            <p className="text-gray-500 text-xs">
              기간을 설정하지 않으면 계속 노출됩니다
            </p>
          </div>
        </Card>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 h-12"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? '저장 중...' : isEdit ? '수정 완료' : '광고 추가'}
        </Button>
      </form>
    </div>
  );
}
