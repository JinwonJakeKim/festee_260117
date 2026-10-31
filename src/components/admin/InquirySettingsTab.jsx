import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function InquirySettingsTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: setting } = useQuery({
    queryKey: ["siteSetting", "inquiry_email"],
    queryFn: async () => (await base44.entities.SiteSetting.filter({ key: "inquiry_email" }))[0] || null,
  });

  useEffect(() => {
    setEmail(setting?.value || "kjwcap59@gmail.com");
  }, [setting]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const value = email.trim();
    if (setting) {
      await base44.entities.SiteSetting.update(setting.id, { value });
    } else {
      await base44.entities.SiteSetting.create({ key: "inquiry_email", value });
    }
    await queryClient.invalidateQueries({ queryKey: ["siteSetting", "inquiry_email"] });
    setSaving(false);
    setSaved(true);
  };

  return (
    <Card className="bg-gray-900 border-gray-800 p-4 space-y-3">
      <h3 className="text-white font-bold">문의 메일 수신 설정</h3>
      <p className="text-gray-400 text-sm">사용자가 문의를 제출하면 아래 이메일로 전달됩니다.</p>
      <Input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
        placeholder="수신 이메일"
        className="bg-gray-800 border-gray-700 text-white"
      />
      <Button onClick={handleSave} disabled={saving || !email.trim()} className="bg-cyan-500 hover:bg-cyan-600 text-black">
        {saving ? "저장 중..." : "저장"}
      </Button>
      {saved && <p className="text-green-400 text-sm">저장되었습니다.</p>}
    </Card>
  );
}