import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, UserX, UserMinus, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export default function AccountManagement() {
  const navigate = useNavigate();
  const [activeAction, setActiveAction] = useState(null); // 'deactivate' | 'delete'
  const [emailInput, setEmailInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

const handleAction = async () => {
  if (!emailInput.trim()) {
    setError("이메일을 입력해주세요.");
    return;
  }

  setError("");
  setIsLoading(true);

  try {
    await base44.functions.invoke("manageAccountStatus", {
      action: activeAction,
      email_confirm: emailInput
    });

    setSuccess(true);

    // 3초 후 로그아웃 처리
    setTimeout(() => {
      base44.auth.logout("/");
    }, 3000);
  } catch (e) {
    setError(
      e?.response?.data?.error || "오류가 발생했습니다. 다시 시도해주세요."
    );
  } finally {
    setIsLoading(false);
  }
};

  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <UserX className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">
            {activeAction === 'delete' ? '계정이 삭제되었습니다' : '계정이 비활성화되었습니다'}
          </h2>
          <p className="text-gray-400 text-sm">잠시 후 자동으로 로그아웃됩니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => activeAction ? setActiveAction(null) : navigate(-1)}
            className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">계정 관리</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">

        {!activeAction ? (
          <>
            {/* 안내 문구 */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-gray-400 text-sm leading-relaxed">
                계정 비활성화 또는 삭제를 선택할 수 있습니다. 진행 전에 아래 내용을 꼭 확인해주세요.
              </p>
            </div>

            {/* 계정 비활성화 */}
            <Card className="bg-gray-900 border-gray-800 overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <UserMinus className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">계정 비활성화</h3>
                    <p className="text-gray-500 text-xs">언제든지 다시 활성화 가능</p>
                  </div>
                </div>
                <ul className="space-y-2 mb-4">
                  {[
                    { text: "로그인 및 모든 서비스 이용이 일시 중단됩니다.", sub: "비활성화 기간 동안 앱에 접근할 수 없습니다." },
                    { text: "내 프로필이 다른 사용자에게 보이지 않게 됩니다.", sub: "팔로워/팔로잉 목록에서도 숨겨집니다." },
                    { text: "작성한 게시물, 댓글, 좋아요, 캐치 데이터는 모두 보존됩니다.", sub: "계정 복구 시 모든 데이터가 그대로 유지됩니다." },
                    { text: "다시 로그인하면 계정이 즉시 복구됩니다.", sub: "비활성화 기간에 대한 제한은 없습니다." },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-400 mt-1 shrink-0">•</span>
                      <div>
                        <p className="text-white text-sm">{item.text}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{item.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { setActiveAction('deactivate'); setEmailInput(""); setError(""); }}
                  className="w-full py-3 rounded-xl border border-yellow-500/50 text-yellow-400 font-medium hover:bg-yellow-500/10 transition-colors"
                >
                  계정 비활성화
                </button>
              </div>
            </Card>

            {/* 계정 삭제 */}
            <Card className="bg-gray-900 border-red-900/50 overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <UserX className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">계정 삭제</h3>
                    <p className="text-red-400 text-xs font-medium">복구 불가능 · 신중히 결정하세요</p>
                  </div>
                </div>
                <div className="bg-red-500/10 rounded-xl p-3 mb-4 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-red-300 text-xs leading-relaxed">
                    계정 삭제 후에는 데이터 복구가 불가능합니다. 모든 개인 정보, 게시물, 좋아요, 팔로우 정보가 영구적으로 비활성화됩니다.
                  </p>
                </div>
                <ul className="space-y-2 mb-4">
                  {[
                    { text: "계정이 영구적으로 비활성화되며 로그인이 불가능해집니다.", sub: "삭제 처리 후에는 관리자도 복구할 수 없습니다." },
                    { text: "프로필, 게시물, 댓글, 좋아요, 팔로우 정보가 모두 비공개 처리됩니다.", sub: "다른 사용자에게 더 이상 노출되지 않습니다." },
                    { text: "데이터는 내부 보관 정책에 따라 일정 기간 후 완전 삭제됩니다.", sub: "서비스 운영 및 법적 의무 이행을 위해 일부 기록은 보존될 수 있습니다." },
                    { text: "같은 이메일로 재가입하더라도 이전 데이터는 복구되지 않습니다.", sub: "완전히 새로운 계정으로 시작하게 됩니다." },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-400 mt-1 shrink-0">•</span>
                      <div>
                        <p className="text-white text-sm">{item.text}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{item.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { setActiveAction('delete'); setEmailInput(""); setError(""); }}
                  className="w-full py-3 rounded-xl border border-red-500/50 text-red-400 font-medium hover:bg-red-500/10 transition-colors"
                >
                  계정 삭제
                </button>
              </div>
            </Card>
          </>
        ) : (
          /* 이메일 인증 단계 */
          <div className="space-y-6">
            <div className={`rounded-2xl p-5 border ${activeAction === 'delete' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className={`w-5 h-5 ${activeAction === 'delete' ? 'text-red-400' : 'text-yellow-400'}`} />
                <h3 className="text-white font-bold">
                  {activeAction === 'delete' ? '계정 삭제 확인' : '계정 비활성화 확인'}
                </h3>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                {activeAction === 'delete'
                  ? '이 작업은 되돌릴 수 없습니다. 계속하려면 아래에 가입한 이메일 주소를 정확히 입력해주세요.'
                  : '계정을 비활성화하려면 아래에 가입한 이메일 주소를 정확히 입력해주세요.'}
              </p>
            </div>

            <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Mail className="w-4 h-4" />
                <span>현재 계정: <span className="text-white">{user?.email}</span></span>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">이메일 주소 입력</label>
                <Input
                  type="email"
                  placeholder="가입한 이메일 주소를 입력하세요"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setError(""); }}
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-cyan-500"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <Button
                onClick={handleAction}
                disabled={isLoading || !emailInput.trim()}
                className={`w-full py-3 font-bold rounded-xl ${
                  activeAction === 'delete'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {isLoading ? '처리 중...' : activeAction === 'delete' ? '계정 영구 삭제' : '계정 비활성화'}
              </Button>

              <button
                onClick={() => setActiveAction(null)}
                className="w-full py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
              >
                취소
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}