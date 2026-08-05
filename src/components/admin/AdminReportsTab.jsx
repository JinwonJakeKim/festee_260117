import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, ExternalLink, Trash2, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return format(date, formatString, { locale: ko });
  } catch (e) {
    return "-";
  }
};

const STATUS_STYLES = {
  "접수": "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  "처리중": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "완료": "bg-green-500/20 text-green-400 border-green-500/40",
  "기각": "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

const REASON_STYLES = {
  "성적 콘텐츠": "bg-red-500/20 text-red-400 border-red-500/40",
  "폭력/혐오 표현": "bg-orange-500/20 text-orange-400 border-orange-500/40",
  "스팸/광고": "bg-purple-500/20 text-purple-400 border-purple-500/40",
  "불법/유해 정보": "bg-red-700/20 text-red-500 border-red-700/40",
  "개인정보 노출": "bg-pink-500/20 text-pink-400 border-pink-500/40",
  "기타": "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

export default function AdminReportsTab({ user }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [adminMemos, setAdminMemos] = useState({});
  const [actionReportId, setActionReportId] = useState(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['postReports'],
    queryFn: () => base44.entities.PostReport.list('-created_date', 500),
    initialData: [],
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['postsForReports'],
    queryFn: () => base44.entities.Post.list('-created_date', 500),
    initialData: [],
  });

  const postMap = useMemo(() => {
    const map = new Map();
    posts.forEach(p => map.set(p.id, p));
    return map;
  }, [posts]);

  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, status, memo }) => {
      const updateData = { status };
      if (memo !== undefined) updateData.admin_memo = memo;
      if (status === '완료' || status === '기각') {
        updateData.handled_by = user?.email;
        updateData.handled_at = new Date().toISOString();
      }
      await base44.entities.PostReport.update(reportId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postReports'] });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async ({ reportId, postId }) => {
      await base44.entities.Post.delete(postId);
      await base44.entities.PostReport.update(reportId, {
        status: '완료',
        handled_by: user?.email,
        handled_at: new Date().toISOString(),
        admin_memo: (adminMemos[reportId] || '') + (adminMemos[reportId] ? ' / ' : '') + '게시글 삭제 처리됨',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postReports'] });
      queryClient.invalidateQueries({ queryKey: ['postsForReports'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      setActionReportId(null);
      alert('신고된 게시글이 삭제되었습니다.');
    },
  });

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      return true;
    });
  }, [reports, statusFilter, reasonFilter]);

  const counts = useMemo(() => {
    const c = { all: reports.length, "접수": 0, "처리중": 0, "완료": 0, "기각": 0 };
    reports.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [reports]);

  const handleStatusChange = (reportId, newStatus) => {
    updateReportMutation.mutate({
      reportId,
      status: newStatus,
      memo: adminMemos[reportId],
    });
  };

  const handleDeletePost = (reportId, postId) => {
    const post = postMap.get(postId);
    const postTitle = post?.title || '';
    if (!confirm(`정말 이 게시글을 삭제하시겠습니까?\n\n"${postTitle}"\n\n삭제 시 신고는 '완료' 처리됩니다.`)) return;
    setActionReportId(reportId);
    deletePostMutation.mutate({ reportId, postId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* 통계 카드 */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        <Card className="bg-gray-900 border-gray-800 p-3 text-center">
          <div className="text-xl font-bold text-white">{counts.all}</div>
          <div className="text-gray-500 text-xs">전체</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-3 text-center">
          <div className="text-xl font-bold text-yellow-400">{counts["접수"]}</div>
          <div className="text-gray-500 text-xs">접수</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-3 text-center">
          <div className="text-xl font-bold text-blue-400">{counts["처리중"]}</div>
          <div className="text-gray-500 text-xs">처리중</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-3 text-center">
          <div className="text-xl font-bold text-green-400">{counts["완료"]}</div>
          <div className="text-gray-500 text-xs">완료</div>
        </Card>
        <Card className="bg-gray-900 border-gray-800 p-3 text-center">
          <div className="text-xl font-bold text-gray-400">{counts["기각"]}</div>
          <div className="text-gray-500 text-xs">기각</div>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-9 text-sm">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-800">
            <SelectItem value="all" className="text-white">모든 상태</SelectItem>
            <SelectItem value="접수" className="text-white">접수</SelectItem>
            <SelectItem value="처리중" className="text-white">처리중</SelectItem>
            <SelectItem value="완료" className="text-white">완료</SelectItem>
            <SelectItem value="기각" className="text-white">기각</SelectItem>
          </SelectContent>
        </Select>

        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-9 text-sm">
            <SelectValue placeholder="사유 필터" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-800">
            <SelectItem value="all" className="text-white">모든 사유</SelectItem>
            <SelectItem value="성적 콘텐츠" className="text-white">성적 콘텐츠</SelectItem>
            <SelectItem value="폭력/혐오 표현" className="text-white">폭력/혐오 표현</SelectItem>
            <SelectItem value="스팸/광고" className="text-white">스팸/광고</SelectItem>
            <SelectItem value="불법/유해 정보" className="text-white">불법/유해 정보</SelectItem>
            <SelectItem value="개인정보 노출" className="text-white">개인정보 노출</SelectItem>
            <SelectItem value="기타" className="text-white">기타</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 신고 목록 */}
      {filteredReports.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800 p-12 text-center">
          <Flag className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">신고된 게시글이 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => {
            const post = postMap.get(report.post_id);
            const postExists = !!post;
            const detailUrl = report.post_type === "gotogether"
              ? createPageUrl(`GoTogetherDetail?id=${report.post_id}`)
              : createPageUrl(`PostDetail?id=${report.post_id}`);
            return (
              <Card key={report.id} className="bg-gray-900 border-gray-800 p-4">
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={`${REASON_STYLES[report.reason] || REASON_STYLES["기타"]} border text-xs`}>
                        {report.reason}
                      </Badge>
                      <Badge className={`${STATUS_STYLES[report.status] || STATUS_STYLES["접수"]} border text-xs`}>
                        {report.status}
                      </Badge>
                      <span className="text-gray-600 text-xs">
                        {safeFormatDate(report.created_date, 'yy.MM.dd HH:mm')}
                      </span>
                    </div>
                    <p className="text-white font-medium text-sm mb-1 line-clamp-1">
                      {report.post_title || '(제목 없음)'}
                    </p>
                    <p className="text-gray-500 text-xs">
                      작성자: {report.post_author_name || report.post_author_email || '-'}
                    </p>
                    <p className="text-gray-500 text-xs">
                      신고자: {report.reporter_name || report.reporter_email}
                    </p>
                  </div>
                </div>

                {/* 신고 상세 내용 */}
                {report.description && (
                  <div className="bg-gray-800/50 border border-gray-800 rounded-lg p-2 mb-3">
                    <p className="text-gray-300 text-xs">{report.description}</p>
                  </div>
                )}

                {/* 게시글 미리보기 (존재하는 경우) */}
                {postExists && post?.content && (
                  <div className="bg-gray-800/30 border border-gray-800 rounded-lg p-2 mb-3">
                    <p className="text-gray-400 text-xs line-clamp-3">{post.content}</p>
                  </div>
                )}

                {/* 게시글 삭제됨 안내 */}
                {!postExists && report.status !== "완료" && (
                  <div className="bg-gray-800/30 border border-gray-800 rounded-lg p-2 mb-3">
                    <p className="text-gray-500 text-xs">⚠️ 해당 게시글이 이미 삭제되었거나 존재하지 않습니다.</p>
                  </div>
                )}

                {/* 관리자 메모 */}
                <div className="mb-3">
                  <Textarea
                    value={adminMemos[report.id] ?? report.admin_memo ?? ""}
                    onChange={(e) => setAdminMemos(prev => ({ ...prev, [report.id]: e.target.value }))}
                    placeholder="관리자 메모 (내부용)"
                    rows={2}
                    className="bg-gray-800 border-gray-700 text-white text-xs resize-none placeholder:text-gray-600"
                  />
                </div>

                {/* 처리 정보 */}
                {report.handled_by && (
                  <p className="text-gray-600 text-xs mb-3">
                    처리자: {report.handled_by}
                    {report.handled_at && ` / ${safeFormatDate(report.handled_at, 'yy.MM.dd HH:mm')}`}
                  </p>
                )}

                {/* 액션 버튼 */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(report.id, "처리중")}
                    disabled={updateReportMutation.isLoading || report.status === "처리중"}
                    className="bg-blue-900/30 border-blue-700/50 text-blue-400 hover:bg-blue-900/50 h-8 text-xs"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    처리중
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(report.id, "완료")}
                    disabled={updateReportMutation.isLoading || report.status === "완료"}
                    className="bg-green-900/30 border-green-700/50 text-green-400 hover:bg-green-900/50 h-8 text-xs"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    완료
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange(report.id, "기각")}
                    disabled={updateReportMutation.isLoading || report.status === "기각"}
                    className="bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 h-8 text-xs"
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    기각
                  </Button>
                  {postExists && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeletePost(report.id, report.post_id)}
                      disabled={deletePostMutation.isLoading && actionReportId === report.id}
                      className="bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50 h-8 text-xs ml-auto"
                    >
                      {deletePostMutation.isLoading && actionReportId === report.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3 mr-1" />
                      )}
                      게시글 삭제
                    </Button>
                  )}
                  <Link
                    to={detailUrl}
                    target="_blank"
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-xs"
                  >
                    <ExternalLink className="w-3 h-3" />
                    게시글 보기
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}