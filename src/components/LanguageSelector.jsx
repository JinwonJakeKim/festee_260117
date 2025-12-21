import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LanguageSelector({ isOpen, onClose, currentLanguage, onSelect }) {
  const languages = [
    { code: 'ko', label: '한국어', nativeLabel: '한국어' },
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'ja', label: '日本語', nativeLabel: '日本語' },
    { code: 'zh', label: '中文', nativeLabel: '中文' },
  ];

  const handleSelect = (code) => {
    onSelect(code);
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-white text-lg font-bold">언어 선택</h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Language List */}
              <div className="p-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full p-4 rounded-lg flex items-center justify-between transition-all ${
                      currentLanguage === lang.code
                        ? 'bg-cyan-400/10 border border-cyan-400/30'
                        : 'hover:bg-gray-800'
                    }`}
                  >
                    <span className={`text-lg font-medium ${
                      currentLanguage === lang.code ? 'text-cyan-400' : 'text-white'
                    }`}>
                      {lang.nativeLabel}
                    </span>
                    {currentLanguage === lang.code && (
                      <Check className="w-5 h-5 text-cyan-400" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}