import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";

export default function UserSearchModal({ isOpen, onClose, onAdd, existingEmails = [] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  const handleSearch = async (value) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('searchUsers', { query: value });
      setResults(res.data.users || []);
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (user) => {
    if (existingEmails.includes(user.email)) return;
    onAdd(user);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="bg-gray-900 border-t border-gray-800 rounded-t-2xl w-full max-w-md p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">멤버 초대</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="이메일 또는 이름으로 검색"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-cyan-400"
                autoFocus
              />
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
              {loading && <div className="text-center text-gray-500 py-4">검색 중...</div>}
              {!loading && query.trim() && results.length === 0 && (
                <div className="text-center text-gray-500 py-4">검색 결과가 없습니다</div>
              )}
              {results.map((user) => {
                const alreadyAdded = existingEmails.includes(user.email);
                return (
                  <button
                    key={user.email}
                    onClick={() => handleSelect(user)}
                    disabled={alreadyAdded}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800'
                    }`}
                  >
                    {user.profile_image ? (
                      <img src={user.profile_image} alt={user.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {user.full_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-white font-medium text-sm truncate">{user.full_name}</div>
                      <div className="text-gray-500 text-xs truncate">{user.email}</div>
                    </div>
                    {alreadyAdded && <span className="text-xs text-gray-500 flex-shrink-0">추가됨</span>}
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