import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Inquiry() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await base44.functions.invoke("submitInquiry", { title, content });
      setDone(true);
    } catch (err) {
      setError("전송에 실패했습니다. 로그인 상태를 확인하고 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-2">문의가 접수되었습니다</h2>
          <p className="text-gray-400 mb-6">확인 후 답변드리겠습니다.</p>
          <Button onClick={() => navigate(-1)} className="bg-cyan-500 hover:bg-cyan-600 text-black">확인</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-xl font-bold text-white">문의</h1>
      </div>
      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-5">
        <div>
          <label className="text-white font-medium mb-2 block">제목</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="제목을 입력해주세요"
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="text-white font-medium mb-2 block">내용</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            placeholder="문의 내용을 입력해주세요"
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 min-h-[220px]"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button
          type="submit"
          disabled={!title.trim() || !content.trim() || sending}
          className="w-full h-12 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5 mr-2" />제출</>}
        </Button>
      </form>
    </div>
  );
}