import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useTabNavigation } from "@/lib/TabNavigationContext";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Plus, X, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

// Import for date formatting
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// Import for Select component from shadcn/ui
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 안전한 날짜 포맷팅 함수 추가
const safeFormatDate = (dateString, formatString) => {
  if (!dateString) return '날짜 미정';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '날짜 미정';
    return format(date, formatString, { locale: ko });
  } catch (e) {
    console.error("Error formatting date:", e); // Log error for debugging
    return '날짜 미정';
  }
};

export default function MyRecommendations() {
  const navigate = useNavigate();
  const { goBack } = useTabNavigation();
  const queryClient = useQueryClient();

  // State for view/edit mode
  const [isEditing, setIsEditing] = useState(false);

  // State for current saved recommendations (from user data)
  // This is what's displayed when !isEditing
  const [recommendations, setRecommendations] = useState([]); // Array of { festival_id, comment }

  // State for recommendations being edited in the form
  // This will always contain 3 items, potentially with empty festival_id/comment
  const [editingRecommendations, setEditingRecommendations] = useState(
    Array(3).fill({ festival_id: '', comment: '' })
  );

  // Fetch current user data
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch all festivals
  const { data: festivals = [] } = useQuery({ // Default to empty array to avoid undefined issues
    queryKey: ['festivals'],
    queryFn: () => base44.entities.Festival.list('-likes_count', 100),
  });

  // 페이지 진입 시 스크롤 초기화
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load existing recommendations from user data when user or festivals data changes
  useEffect(() => {
    if (user?.recommended_festivals && festivals.length > 0) {
      // Filter out recommendations where festival might not be found
      const validRecommendations = user.recommended_festivals.filter(rec =>
        festivals.some(f => f.id === rec.festival_id)
      );

      setRecommendations(validRecommendations);

      // Initialize editingRecommendations with existing data, pad to 3
      const paddedEditingRecs = [...validRecommendations];
      while (paddedEditingRecs.length < 3) {
        paddedEditingRecs.push({ festival_id: '', comment: '' });
      }
      setEditingRecommendations(paddedEditingRecs.slice(0, 3)); // Ensure it's exactly 3
    } else if (user && festivals.length === 0) {
      // If festivals haven't loaded yet, or there are no festivals
      setRecommendations([]);
      setEditingRecommendations(Array(3).fill({ festival_id: '', comment: '' }));
    } else if (user && !user.recommended_festivals) {
      // If user has no recommended_festivals explicitly
      setRecommendations([]);
      setEditingRecommendations(Array(3).fill({ festival_id: '', comment: '' }));
    }
  }, [user, festivals]);


  const saveRecommendationsMutation = useMutation({
    mutationFn: async () => {
      // Filter out empty recommendation slots before sending
      const recommendationsToSave = editingRecommendations.filter(
        rec => rec.festival_id !== ''
      );
      await base44.auth.updateMe({ recommended_festivals: recommendationsToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      alert('추천 축제가 저장되었습니다!');
      setIsEditing(false); // Exit editing mode
      navigate(createPageUrl("MyFestee")); 
    },
    onError: (error) => {
      console.error("Failed to save recommendations:", error);
      alert('추천 축제 저장에 실패했습니다.');
    }
  });

  // Function to handle cancelling edit
  const handleCancelEdit = () => {
    // Revert editingRecommendations to the last saved state (recommendations)
    const paddedRecommendations = [...recommendations];
    while (paddedRecommendations.length < 3) {
      paddedRecommendations.push({ festival_id: '', comment: '' });
    }
    setEditingRecommendations(paddedRecommendations.slice(0,3));
    setIsEditing(false);
  };

  // Original states and functions related to the search modal are removed
  // as the UI has been completely refactored to use Select components.

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-gray-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => goBack()}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">추천 축제 설정</h1>
          </div>
          {isEditing ? (
            <div className="flex gap-2">
                <Button
                    onClick={handleCancelEdit}
                    variant="outline"
                    className="bg-gray-800 hover:bg-gray-700 border-gray-700 text-white rounded-full px-4"
                >
                    취소
                </Button>
                <Button
                    onClick={() => saveRecommendationsMutation.mutate()}
                    // Disable save button if no festivals are selected or if mutation is pending
                    disabled={saveRecommendationsMutation.isPending || editingRecommendations.every(rec => rec.festival_id === '')}
                    className="bg-cyan-500 hover:bg-cyan-600 rounded-full px-4"
                >
                    저장
                </Button>
            </div>
          ) : (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-cyan-500 hover:bg-cyan-600 rounded-full px-4"
            >
              편집
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 py-6">
        <div className="bg-gradient-to-r from-cyan-900/20 to-pink-900/20 border border-cyan-400/30 rounded-lg p-4 mb-6">
          <p className="text-white text-sm mb-2">
            💡 내가 추천하는 축제 Top 3를 설정하세요!
          </p>
          <p className="text-gray-400 text-xs">
            각 축제마다 추천 이유를 작성할 수 있습니다.
          </p>
        </div>

        {!isEditing ? (
          <>
            {recommendations.length > 0 ? (
              <div className="space-y-3 mb-6">
                {recommendations.map((rec, index) => {
                  const festival = festivals.find(f => f.id === rec.festival_id);
                  if (!festival) return null; // Should ideally not happen if data is consistent
                  
                  return (
                    <Card key={festival.id} className="bg-gray-900 border-gray-800 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-black">
                          {index + 1}
                        </div>
                        <img
                          src={festival.thumbnail_url}
                          alt={festival.name}
                          className="w-20 h-20 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="text-white font-bold mb-1">{festival.name}</h3>
                          <p className="text-gray-400 text-sm mb-1">
                            {festival.city}, {festival.country}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {safeFormatDate(festival.start_date, 'yy.M.d')}
                          </p>
                          {rec.comment && (
                            <p className="text-gray-400 text-sm mt-2 italic">"{rec.comment}"</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 mb-6">
                <Star className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500">아직 추천 축제를 설정하지 않았습니다</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {editingRecommendations.map((rec, index) => (
                <Card key={index} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-black">
                      {index + 1}
                    </div>
                    <h3 className="text-white font-bold">Top {index + 1}</h3>
                  </div>

                  <Select
                    value={rec.festival_id || ""} // Use rec.festival_id directly
                    onValueChange={(value) => {
                      const newEditingRecs = [...editingRecommendations];
                      newEditingRecs[index] = { ...newEditingRecs[index], festival_id: value };
                      setEditingRecommendations(newEditingRecs);
                    }}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white mb-3">
                      <SelectValue placeholder="축제를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800 max-h-60 overflow-y-auto custom-scrollbar">
                      {festivals.map((festival) => (
                        <SelectItem
                          key={festival.id}
                          value={festival.id}
                          className="text-white hover:bg-gray-800 focus:bg-gray-800"
                          disabled={editingRecommendations.some(
                            (s, i) => i !== index && s.festival_id === festival.id
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span>{festival.name}</span>
                            <span className="text-gray-500 text-xs">
                              ({festival.city}, {safeFormatDate(festival.start_date, 'yy.M.d')})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {rec.festival_id && ( // Only show selected festival info if one is selected for this slot
                    <div className="mb-3">
                      {(() => {
                        const festival = festivals.find(f => f.id === rec.festival_id);
                        return festival ? (
                          <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                            <img
                              src={festival.thumbnail_url}
                              alt={festival.name}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                            <div>
                              <p className="text-white font-bold text-sm">{festival.name}</p>
                              <p className="text-gray-400 text-xs">{festival.city}, {festival.country}</p>
                              <p className="text-gray-500 text-xs">{safeFormatDate(festival.start_date, 'yy.M.d')}</p>
                            </div>
                            <button
                                onClick={() => {
                                    const newEditingRecs = [...editingRecommendations];
                                    newEditingRecs[index] = { festival_id: '', comment: '' }; // Clear this specific slot
                                    setEditingRecommendations(newEditingRecs);
                                }}
                                className="ml-auto w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:bg-gray-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}

                  <Textarea
                    placeholder="이 축제를 추천하는 이유를 적어주세요 (선택)"
                    value={rec.comment || ""} // Use rec.comment directly
                    onChange={(e) => {
                      const newEditingRecs = [...editingRecommendations];
                      newEditingRecs[index] = { ...newEditingRecs[index], comment: e.target.value };
                      setEditingRecommendations(newEditingRecs);
                    }}
                    className="bg-gray-800 border-gray-700 text-white"
                    rows={2}
                  />
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}