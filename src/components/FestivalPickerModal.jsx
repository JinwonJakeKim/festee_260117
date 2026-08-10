import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, MapPin, Check, Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const getFestivalDisplayName = (festival) => {
  return festival?.name_ko || festival?.name_en || festival?.name_original || festival?.name_jp || festival?.name_zh || "이름 없음";
};

const getFestivalLocation = (festival) => {
  return `${festival?.city || ""} ${festival?.country || ""}`.trim() || "-";
};

export default function FestivalPickerModal({ isOpen, onClose, onSelect, selectedFestivalId }) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  const { data: festivals = [], isLoading } = useQuery({
    queryKey: ["festivalsForPicker"],
    queryFn: () => base44.entities.Festival.filter({ show: "Y" }, "-popularity", 9999),
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return festivals;
    const q = search.trim().toLowerCase();
    return festivals.filter((f) => {
      const name = getFestivalDisplayName(f).toLowerCase();
      const loc = getFestivalLocation(f).toLowerCase();
      const cat = (f.category || "").toLowerCase();
      return name.includes(q) || loc.includes(q) || cat.includes(q);
    });
  }, [festivals, search]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-full sm:max-w-lg bg-[#11141c] border-t sm:border border-gray-800 rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white">축제 선택</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="축제명, 지역, 카테고리로 검색"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400" />
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="py-12 text-center text-gray-500 text-sm">
                  {search.trim() ? "검색 결과가 없습니다." : "표시 중인 축제가 없습니다."}
                </div>
              )}
              {!isLoading &&
                filtered.map((festival) => {
                  const isSelected = festival.id === selectedFestivalId;
                  return (
                    <button
                      key={festival.id}
                      onClick={() => {
                        onSelect(festival);
                        onClose();
                      }}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl transition-colors text-left mb-1 ${
                        isSelected
                          ? "bg-cyan-500/15 border border-cyan-500/40"
                          : "hover:bg-gray-800/60 border border-transparent"
                      }`}
                    >
                      {festival.thumbnail_url ? (
                        <img
                          src={festival.thumbnail_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-800"
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-800 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium truncate">
                            {getFestivalDisplayName(festival)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{getFestivalLocation(festival)}</span>
                        </div>
                        {festival.start_date && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span>{format(new Date(festival.start_date), "yyyy.M.d", { locale: ko })}</span>
                          </div>
                        )}
                      </div>
                      {festival.category && (
                        <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                          {festival.category}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}