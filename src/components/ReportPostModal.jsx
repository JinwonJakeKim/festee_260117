import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Flag, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

const REASONS = [
  { value: "성적 콘텐츠", label: "성적 콘텐츠", desc: "음란물, 성적 행위, 성적 묘사 등" },
  { value: "폭력/혐오 표현", label: "폭력/혐오 표현", desc: "폭력적 묘사, 혐오 발언, 차별적 표현" },
  { value: "스팸/광고", label: "스팸/광고", desc: "반복적 광고, 홍보성 게시글" },
  { value: "불법/유해 정보", label: "불법/유해 정보", desc: "불법 행위, 약물, 위험 정보 등" },
  { value: "개인정보 노출", label: "개인정보 노출", desc: "타인의 개인정보 무단 공개" },
  { value: "기타", label: "기타", desc: "위 항목에 해당하지 않는 문제" },
];

export default function ReportPostModal({
  isOpen,
  onClose,
  postId,
  postType = "post",
  postTitle = "",
  postAuthorEmail = "",
  postAuthorName = "",
}) {
  const [selectedReason, setSelectedReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState("");

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    retry: false,
    enabled: isOpen,
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("로그인이 필요합니다");
      if (!selectedReason) throw new Error("신고 사유를 선택해주세요");
      await base44.entities.PostReport.create({
        post_id: postId,
        post_type: postType,
        post_title: postTitle,
        post_author_email: postAuthorEmail,
        post_author_name: postAuthorName,
        reporter_email: user.email,
        reporter_name: user.full_name,
        reason: selectedReason,
        description: description.trim() || undefined,
      });
      // 관리자에게 이메일 발송
      try {
        const admins = await base44.entities.User.filter({ role: "admin" });
        const subject = `[FESTEE 신고 접수] ${selectedReason}`;
        const body = [
          `신고가 접수되었습니다.`,
          ``,
          `■ 신고 대상`,
          `유형: ${postType === "gotogether" ? "같이가기" : "게시글"}`,
          `제목: ${postTitle || "(제목 없음)"}`,
          `작성자: ${postAuthorName || ""} (${postAuthorEmail || ""})`,
          ``,
          `■ 신고자`,
          `${user.full_name || ""} (${user.email})`,
          ``,
          `■ 신고 사유`,
          `${selectedReason}`,
          ``,
          `■ 상세 내용`,
          `${description.trim() || "(입력되지 않음)"}`,
          ``,
          `관리자 대시보드에서 확인해주세요.`,
        ].join("\n");
        await Promise.all(
          (admins || []).map((a) =>
            base44.integrations.Core.SendEmail({
              to: a.email,
              subject,
              body,
            })
          )
        );
      } catch (e) {
        // 이메일 발송 실패는 신고 접수 자체에 영향을 주지 않음
        console.warn("신고 이메일 발송 실패", e);
      }
    },
    onSuccess: () => {
      setSelectedReason("");
      setDescription("");
      setSubmitError("");
      onClose();
      alert("신고가 접수되었습니다. 관리자가 확인 후 조치하겠습니다.");
    },
    onError: (err) => {
      setSubmitError(err?.message || "신고 접수에 실패했습니다");
    },
  });

  const handleClose = () => {
    if (reportMutation.isLoading) return;
    setSelectedReason("");
    setDescription("");
    setSubmitError("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000]"
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-gray-900 border-t sm:border border-gray-800 sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Flag className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">게시글 신고</h2>
                    <p className="text-gray-500 text-xs">관리자에게 신고를 전달합니다</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={reportMutation.isLoading}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* 본문 */}
              <div className="px-5 py-5 space-y-5">
                {/* 신고 대상 게시글 */}
                {postTitle && (
                  <div className="bg-gray-800/50 border border-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">신고 대상</p>
                    <p className="text-white text-sm font-medium line-clamp-2">{postTitle}</p>
                  </div>
                )}

                {/* 로그인 필요 안내 */}
                {!user && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-400 text-sm">
                      신고하려면 로그인이 필요합니다.
                    </p>
                  </div>
                )}

                {/* 사유 선택 */}
                <div>
                  <label className="text-white text-sm font-bold mb-3 block">
                    신고 사유 <span className="text-red-400">*</span>
                  </label>
                  <div className="space-y-2">
                    {REASONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setSelectedReason(r.value)}
                        disabled={reportMutation.isLoading}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedReason === r.value
                            ? "border-red-500 bg-red-500/10"
                            : "border-gray-800 bg-gray-800/30 hover:border-gray-700"
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              selectedReason === r.value
                                ? "border-red-500"
                                : "border-gray-600"
                            }`}
                          >
                            {selectedReason === r.value && (
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                            )}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{r.label}</p>
                            <p className="text-gray-500 text-xs">{r.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 상세 내용 */}
                <div>
                  <label className="text-white text-sm font-bold mb-2 block">
                    상세 내용 (선택)
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="문제가 되는 부분을 구체적으로 적어주시면 빠른 처리에 도움이 됩니다."
                    rows={3}
                    maxLength={500}
                    disabled={reportMutation.isLoading}
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
                  />
                  <p className="text-gray-600 text-xs text-right mt-1">
                    {description.length}/500
                  </p>
                </div>

                {/* 안내 */}
                <div className="bg-gray-800/30 border border-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs leading-relaxed">
                    • 허위 신고는 서비스 이용에 제재를 받을 수 있습니다.<br />
                    • 신고 내용은 관리자에게만 전달되며, 신고 대상자에게 공개되지 않습니다.<br />
                    • 동일 게시글을 여러 번 신고해도 최초 1건만 유효하게 집계될 수 있습니다.
                  </p>
                </div>

                {/* 에러 */}
                {submitError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{submitError}</p>
                  </div>
                )}
              </div>

              {/* 푸터 */}
              <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 px-5 pt-4 pb-[5.5rem] sm:pb-4 flex gap-2">
                <Button
                  onClick={handleClose}
                  disabled={reportMutation.isLoading}
                  variant="outline"
                  className="flex-1 bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                >
                  취소
                </Button>
                <Button
                  onClick={() => reportMutation.mutate()}
                  disabled={!user || !selectedReason || reportMutation.isLoading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white border-none"
                >
                  {reportMutation.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      접수 중...
                    </>
                  ) : (
                    <>
                      <Flag className="w-4 h-4 mr-2" />
                      신고하기
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}