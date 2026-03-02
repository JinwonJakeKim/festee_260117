import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const safeFormat = (date, formatStr) => {
  if (!date) return '';
  try { return format(new Date(date), formatStr, { locale: ko }); } catch (e) { return ''; }
};

export default function DateRangeBottomSheet({ isOpen, onClose, dateRange, onApply }) {
  const [currentMonth, setCurrentMonth] = useState(
    dateRange?.from ? new Date(dateRange.from) : new Date()
  );
  const [tempRange, setTempRange] = useState(dateRange || { from: null, to: null });

  React.useEffect(() => {
    if (isOpen) {
      setTempRange(dateRange || { from: null, to: null });
      setCurrentMonth(dateRange?.from ? new Date(dateRange.from) : new Date());
    }
  }, [isOpen]);

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handleDateClick = (day) => {
    const clicked = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (!tempRange?.from || (tempRange.from && tempRange.to)) {
      setTempRange({ from: clicked, to: null });
    } else {
      if (clicked < tempRange.from) {
        setTempRange({ from: clicked, to: tempRange.from });
      } else {
        setTempRange({ from: tempRange.from, to: clicked });
      }
    }
  };

  const isStart = (day) => {
    if (!tempRange?.from) return false;
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString() === tempRange.from.toDateString();
  };
  const isEnd = (day) => {
    if (!tempRange?.to) return false;
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString() === tempRange.to.toDateString();
  };
  const inRange = (day) => {
    if (!tempRange?.from || !tempRange?.to) return false;
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return d > tempRange.from && d < tempRange.to;
  };
  const isToday = (day) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return d.toDateString() === new Date().toDateString();
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  while (days.length < 42) days.push(null);

  const handleApply = () => {
    onApply(tempRange);
    onClose();
  };

  const handleReset = () => {
    setTempRange({ from: null, to: null });
    onApply({ from: null, to: null });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-[100]"
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-gray-950 rounded-t-3xl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">날짜 선택</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Selected Range Display */}
            <div className="px-4 py-3 flex items-center gap-2">
              <div className={`flex-1 rounded-xl px-3 py-2 text-center ${tempRange?.from ? 'bg-cyan-500/20 border border-cyan-500' : 'bg-gray-900 border border-gray-700'}`}>
                <p className="text-gray-400 text-xs mb-0.5">시작일</p>
                <p className={`text-sm font-bold ${tempRange?.from ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {tempRange?.from ? safeFormat(tempRange.from, 'M월 d일') : '선택 없음'}
                </p>
              </div>
              <div className="w-6 text-gray-600 text-center">→</div>
              <div className={`flex-1 rounded-xl px-3 py-2 text-center ${tempRange?.to ? 'bg-cyan-500/20 border border-cyan-500' : 'bg-gray-900 border border-gray-700'}`}>
                <p className="text-gray-400 text-xs mb-0.5">종료일</p>
                <p className={`text-sm font-bold ${tempRange?.to ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {tempRange?.to ? safeFormat(tempRange.to, 'M월 d일') : '선택 없음'}
                </p>
              </div>
            </div>

            {/* Calendar */}
            <div className="px-4 pb-2">
              {/* Month Nav */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="w-9 h-9 rounded-full hover:bg-gray-800 flex items-center justify-center">
                  <ChevronLeft className="w-5 h-5 text-cyan-400" />
                </button>
                <h3 className="text-white font-bold">
                  {currentMonth.getFullYear()}년 {MONTHS[currentMonth.getMonth()]}
                </h3>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="w-9 h-9 rounded-full hover:bg-gray-800 flex items-center justify-center">
                  <ChevronRight className="w-5 h-5 text-cyan-400" />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-gray-500 text-xs py-1">{d}</div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} className="h-10" />;
                  const start = isStart(day);
                  const end = isEnd(day);
                  const range = inRange(day);
                  const today = isToday(day);
                  return (
                    <button
                      key={day}
                      onClick={() => handleDateClick(day)}
                      className={`
                        h-10 w-full flex items-center justify-center text-sm font-medium transition-all rounded-lg
                        ${start || end ? 'bg-cyan-400 text-black font-bold' : ''}
                        ${range ? 'bg-cyan-400/20 text-cyan-400' : ''}
                        ${!start && !end && !range ? 'text-white hover:bg-gray-800' : ''}
                        ${today && !start && !end ? 'border border-pink-500 text-pink-400' : ''}
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Buttons */}
            <div className="px-4 py-4 border-t border-gray-800 flex gap-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <Button onClick={handleReset} variant="outline" className="flex-1 bg-gray-800 text-white border-gray-700 hover:bg-gray-700">
                초기화
              </Button>
              <Button onClick={handleApply} disabled={!tempRange?.from} className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-50">
                적용
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}