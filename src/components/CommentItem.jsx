import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Pencil, Trash2, X, Check, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return format(date, formatString, { locale: ko });
  } catch {
    return "";
  }
};

/**
 * 공통 댓글 아이템 컴포넌트 - 작성자 프로필 링크, 수정/삭제 메뉴, 인라인 에디터 포함.
 *
 * @param {Object} comment - 댓글 데이터 (user_name에 최신 닉네임 반영됨)
 * @param {Object} currentUser - 현재 로그인 사용자
 * @param {string} editingCommentId - 현재 수정 중인 댓글 ID
 * @param {string} editText - 수정 중인 텍스트
 * @param {Function} setEditText
 * @param {Function} startEdit
 * @param {Function} cancelEdit
 * @param {Function} submitEdit
 * @param {Function} deleteComment
 * @param {boolean} isEditing - 수정 저장 중
 * @param {boolean} isDeleting - 삭제 중
 * @param {string} [confirmDeleteId] - 삭제 확인 대기 중인 댓글 ID
 * @param {Function} [setConfirmDeleteId]
 */
export default function CommentItem({
  comment,
  currentUser,
  editingCommentId,
  editText,
  setEditText,
  startEdit,
  cancelEdit,
  submitEdit,
  deleteComment,
  isEditing,
  isDeleting,
  confirmDeleteId,
  setConfirmDeleteId,
}) {
  const isOwner = currentUser?.email === comment.user_email;
  const isEditingThis = editingCommentId === comment.id;
  const isConfirmingDelete = confirmDeleteId === comment.id;

  return (
    <Card className="bg-gray-900 border-gray-800 p-4">
      {/* 수정 모드 */}
      {isEditingThis ? (
        <div>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white mb-2"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-700 text-white hover:bg-gray-800"
              onClick={cancelEdit}
              disabled={isEditing}
            >
              <X className="w-4 h-4 mr-1" />
              취소
            </Button>
            <Button
              size="sm"
              className="bg-cyan-500 hover:bg-cyan-600"
              onClick={submitEdit}
              disabled={!editText.trim() || isEditing}
            >
              {isEditing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  저장 중
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  저장
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 헤더: 작성자 + 날짜 + 메뉴 */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link
                to={createPageUrl(`UserProfile?email=${comment.user_email}`)}
                className="font-bold text-white text-sm hover:text-cyan-400 transition-colors"
              >
                {comment.user_name || "사용자"}
              </Link>
              <span className="text-xs text-gray-500">
                {safeFormatDate(comment.created_date, "yy.MM.dd HH:mm")}
              </span>
            </div>
            {isOwner && !isConfirmingDelete && (
              <div className="flex gap-1">
                <button
                  onClick={() => startEdit(comment)}
                  className="w-7 h-7 rounded-full hover:bg-gray-800 flex items-center justify-center transition-colors"
                  aria-label="댓글 수정"
                >
                  <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-cyan-400" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId?.(comment.id)}
                  className="w-7 h-7 rounded-full hover:bg-gray-800 flex items-center justify-center transition-colors"
                  aria-label="댓글 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" />
                </button>
              </div>
            )}
          </div>

          {/* 삭제 확인 */}
          {isConfirmingDelete ? (
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-gray-300 text-sm flex-1">댓글을 삭제하시겠습니까?</span>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-white hover:bg-gray-800 h-8"
                onClick={() => setConfirmDeleteId?.(null)}
                disabled={isDeleting}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 h-8"
                onClick={() => deleteComment(comment.id)}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중" : "삭제"}
              </Button>
            </div>
          ) : (
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{comment.content}</p>
          )}
        </>
      )}
    </Card>
  );
}