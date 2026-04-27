import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, RefreshCw } from "lucide-react";

export default function ExtractionLogSection() {
  const queryClient = useQueryClient();

  const { data: extractionLogs } = useQuery({
    queryKey: ['japantravelExtractionLogs'],
    queryFn: () => base44.entities.JapantravelExtractionLog.list('-created_date', 20),
    initialData: [],
  });

  return (
    <Card className="bg-gray-900 border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-cyan-400" />
          추출 실행 로그
        </h3>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['japantravelExtractionLogs'] })}
          size="sm"
          variant="outline"
          className="border-gray-700 text-gray-400 hover:bg-gray-800"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {extractionLogs.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">아직 실행 기록이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {extractionLogs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg border p-4 ${
                log.status === 'success'
                  ? 'bg-green-900/10 border-green-400/30'
                  : 'bg-red-900/10 border-red-400/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-bold ${log.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {log.status === 'success' ? '✅ 성공' : '❌ 실패'}
                  </span>
                  {log.target_month && (
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-400/40 text-xs">
                      {log.target_month}
                    </Badge>
                  )}
                  {log.source_name && (
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-400/40 text-xs">
                      {log.source_name}
                    </Badge>
                  )}
                </div>
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {new Date(log.created_date).toLocaleString('ko-KR')}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-2">
                {log.pages_processed != null && (
                  <span>📄 {log.pages_processed}페이지</span>
                )}
                {log.total_links != null && (
                  <span>🔗 총 {log.total_links}개 링크</span>
                )}
                {log.new_records != null && (
                  <span>🆕 신규 {log.new_records}개</span>
                )}
                {log.duration_ms != null && (
                  <span>⏱️ {(log.duration_ms / 1000).toFixed(1)}초</span>
                )}
              </div>

              {log.message && (
                <p className="text-gray-300 text-xs">{log.message}</p>
              )}
              {log.error_message && (
                <p className="text-red-400 text-xs mt-1 bg-red-900/20 rounded p-2">❌ {log.error_message}</p>
              )}
              <p className="text-gray-600 text-xs mt-1">by {log.initiated_by}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}