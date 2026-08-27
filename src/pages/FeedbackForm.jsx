import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Upload, CheckCircle, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function FeedbackForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async (feedbackData) => {
      // 1. 데이터베이스에 피드백 저장
      await base44.entities.Feedback.create(feedbackData);
      
      // 2. 이메일로 피드백 전송
      const emailBody = `
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <h2 style="color: #00d4ff; border-bottom: 2px solid #00d4ff; padding-bottom: 10px;">
        🎉 새로운 Festee 피드백이 도착했습니다!
      </h2>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #555; margin-top: 0;">📋 피드백 정보</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">공개 여부:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${feedbackData.is_public ? '공개' : '비공개'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">카테고리:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${feedbackData.category}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">제목:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${feedbackData.subject}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">작성자:</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${feedbackData.user_name} (${feedbackData.user_email})</td>
          </tr>
        </table>
      </div>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #555; margin-top: 0;">💬 피드백 내용</h3>
        <p style="white-space: pre-wrap; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
${feedbackData.content}
        </p>
      </div>
      
      ${feedbackData.screenshot_url ? `
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #555; margin-top: 0;">📸 첨부 스크린샷</h3>
        <img src="${feedbackData.screenshot_url}" alt="스크린샷" style="max-width: 100%; border-radius: 5px; border: 1px solid #ddd;" />
      </div>
      ` : ''}
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #555; margin-top: 0;">🔧 기기 정보</h3>
        <p style="font-size: 12px; color: #666; background-color: #f5f5f5; padding: 10px; border-radius: 5px; word-break: break-all;">
          ${feedbackData.device_info}
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
        <p style="color: #888; font-size: 14px;">
          Festee 피드백 시스템 | ${new Date().toLocaleString('ko-KR')}
        </p>
      </div>
    </div>
  </body>
</html>
      `;
      
      await base44.integrations.Core.SendEmail({
        from_name: 'Festee 피드백',
        to: 'kjwcap59@gmail.com',
        subject: `[Festee 피드백${feedbackData.is_public ? ' - 공개' : ' - 비공개'}] ${feedbackData.category} - ${feedbackData.subject}`,
        body: emailBody
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['feedbacks'] });
      setTimeout(() => {
        navigate(-1);
      }, 2000);
    },
  });

  const handleScreenshotUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setScreenshot(file_url);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!category || !subject.trim() || !content.trim()) {
      alert('모든 필수 항목을 입력해주세요.');
      return;
    }

    const deviceInfo = `${navigator.userAgent}`;
    
    const feedbackData = {
      user_email: user.email,
      user_name: user.nickname || user.full_name,
      category,
      subject: subject.trim(),
      content: content.trim(),
      device_info: deviceInfo,
      is_public: isPublic,
      likes_count: 0,
      comments_count: 0,
    };

    if (screenshot) {
      feedbackData.screenshot_url = screenshot;
    }

    submitFeedbackMutation.mutate(feedbackData);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-400">로그인이 필요합니다</p>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">피드백이 전송되었습니다!</h2>
          <p className="text-gray-400">소중한 의견 감사합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">피드백 보내기</h1>
        </div>
      </div>

      <div className="px-4 py-6">
        <Card className="bg-gray-900 border-gray-800 p-6 mb-6">
          <h2 className="text-white text-lg font-bold mb-2">💡 여러분의 의견을 들려주세요</h2>
          <p className="text-gray-400 text-sm">
            Festee를 더 좋은 서비스로 만들기 위해 여러분의 소중한 의견을 기다리고 있습니다.
            버그, 개선사항, 새로운 기능 제안 등 무엇이든 알려주세요!
          </p>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 공개/비공개 토글 */}
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Unlock className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Lock className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <Label className="text-white font-medium text-base">
                    {isPublic ? '공개 피드백' : '비공개 피드백'}
                  </Label>
                  <p className="text-gray-400 text-xs mt-1">
                    {isPublic 
                      ? '다른 사용자들도 이 피드백을 보고 공감할 수 있습니다' 
                      : '관리자만 볼 수 있는 비공개 피드백입니다'}
                  </p>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
          </Card>

          <div>
            <label className="text-white font-medium mb-2 block">
              카테고리 <span className="text-red-500">*</span>
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full bg-gray-900 border-gray-700 text-white">
                <SelectValue placeholder="피드백 유형을 선택해주세요" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="버그 보고" className="text-white">
                  🐛 버그 보고
                </SelectItem>
                <SelectItem value="기능 제안" className="text-white">
                  💡 기능 제안
                </SelectItem>
                <SelectItem value="일반 의견" className="text-white">
                  💬 일반 의견
                </SelectItem>
                <SelectItem value="기타" className="text-white">
                  📝 기타
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-white font-medium mb-2 block">
              제목 <span className="text-red-500">*</span>
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="피드백 제목을 입력해주세요"
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
              maxLength={100}
            />
            <p className="text-gray-500 text-xs mt-1">{subject.length}/100</p>
          </div>

          <div>
            <label className="text-white font-medium mb-2 block">
              내용 <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="자세한 내용을 입력해주세요. 문제가 발생한 상황, 기대했던 결과, 제안하고 싶은 내용 등을 포함해주시면 더욱 도움이 됩니다."
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 min-h-[200px]"
              maxLength={1000}
            />
            <p className="text-gray-500 text-xs mt-1">{content.length}/1000</p>
          </div>

          <div>
            <label className="text-white font-medium mb-2 block">
              스크린샷 첨부 (선택사항)
            </label>
            <div className="space-y-3">
              {screenshot && (
                <div className="relative">
                  <img
                    src={screenshot}
                    alt="Screenshot"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <span className="text-white text-lg">×</span>
                  </button>
                </div>
              )}
              
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  disabled={isUploading || screenshot}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-gray-900 border-gray-700 text-white hover:bg-gray-800"
                  disabled={isUploading || screenshot}
                  asChild
                >
                  <span>
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2" />
                        업로드 중...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        스크린샷 첨부하기
                      </>
                    )}
                  </span>
                </Button>
              </label>
              <p className="text-gray-500 text-xs">
                문제가 발생한 화면의 스크린샷을 첨부하면 더 빠르게 해결할 수 있습니다.
              </p>
            </div>
          </div>

          <Card className="bg-gray-800/50 border-gray-700 p-4">
            <h3 className="text-white font-medium mb-2">제출 정보</h3>
            <div className="space-y-1 text-sm">
              <p className="text-gray-400">
                이름: <span className="text-white">{user.nickname || user.full_name}</span>
              </p>
              <p className="text-gray-400">
                이메일: <span className="text-white">{user.email}</span>
              </p>
            </div>
          </Card>

          <Button
            type="submit"
            disabled={!category || !subject.trim() || !content.trim() || submitFeedbackMutation.isPending}
            className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 h-12 text-lg font-bold"
          >
            {submitFeedbackMutation.isPending ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                전송 중...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                피드백 전송
              </div>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}