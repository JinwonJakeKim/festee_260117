import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';

const CURRENCY_INFO = {
  KRW: { label: '대한민국 원', symbol: '₩', flag: '🇰🇷' },
  USD: { label: '미국 달러', symbol: '$', flag: '🇺🇸' },
  JPY: { label: '일본 엔', symbol: '¥', flag: '🇯🇵' },
  CNY: { label: '중국 위안', symbol: 'CN¥', flag: '🇨🇳' },
};

export default function CurrencySelectorModal({ isOpen, onClose }) {
  const { currency, setCurrency } = useCurrency();

  const handleSelect = async (cur) => {
    await setCurrency(cur);
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
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-[200] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[201] bg-gray-900 rounded-t-3xl border-t border-gray-700 shadow-2xl"
          >
            <div className="max-w-screen-sm mx-auto">
              {/* 핸들 */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </div>

              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                <h2 className="text-white font-bold text-lg">통화 설정</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 통화 목록 */}
              <div className="p-3 pb-8 space-y-2">
                {Object.entries(CURRENCY_INFO).map(([code, info]) => {
                  const isSelected = currency === code;
                  return (
                    <button
                      key={code}
                      onClick={() => handleSelect(code)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-cyan-500/15 border border-cyan-500/50'
                          : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{info.flag}</span>
                        <div className="text-left">
                          <div className={`font-semibold ${isSelected ? 'text-cyan-400' : 'text-white'}`}>
                            {info.label}
                          </div>
                          <div className="text-gray-500 text-sm">
                            {info.symbol} {code}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-400'
                            : 'border-gray-600'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 text-black" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 안내 메시지 */}
              <div className="px-5 pb-6">
                <p className="text-gray-500 text-xs text-center">
                  선택한 통화 기준으로 앱 내 모든 가격이 표시됩니다
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}