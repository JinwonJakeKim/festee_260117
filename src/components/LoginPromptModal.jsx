import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPromptModal({ isOpen, onClose, onLogin, message = "로그인이 필요한 기능입니다" }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
          />

          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-gray-900 rounded-2xl border border-gray-800 p-6 max-w-sm w-full relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/20 to-pink-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 rounded-full blur-2xl" />

              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors z-10"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>

              <div className="relative z-10">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-cyan-500 to-pink-500 flex items-center justify-center">
                    <LogIn className="w-8 h-8 text-white" />
                  </div>
                </div>

                <h3 className="text-white text-xl font-bold text-center mb-2">
                  로그인이 필요해요
                </h3>

                <p className="text-gray-400 text-sm text-center mb-6">
                  {message}
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={onLogin}
                    className="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-bold h-12 rounded-xl"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    로그인/회원가입
                  </Button>

                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="w-full bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white h-12 rounded-xl"
                  >
                    취소
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}