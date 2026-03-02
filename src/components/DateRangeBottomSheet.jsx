import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const safeFormat = (date, formatStr) => {
  if (!date) return '';
  try { return format(new Date(date), formatStr, { locale: ko }); } catch (e) { return ''; }
};

// 현재 달 기준 앞뒤 12개월 목록 생성
const generateMonths = () => {
  const months = [];
  const now = new Date();
  for (let i = -3; i <= 12; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() + i, 1));
  }
  return months;
};

function MonthCalendar({ monthDate, tempRange, onDateClick }) {
  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDay = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const daysInMonth = getDaysInMonth(monthDate);
  const firstDay = getFirstDay(monthDate);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const isStart = (day) => {
    if (!tempRange?.from) return false;
    return new Date(monthDate.getFullYear(), monthDate.getMonth(), day).toDateString() === tempRange.from.toDateString();
  };
  const isEnd = (day) => {
    if (!tempRange?.to) return false;
    return new Date(monthDate.getFullYear(), monthDate.getMonth(), day).toDateString() === tempRange.to.toDateString();
  };
  const inRange = (day) => {
    if (!tempRange?.from || !tempRange?.to) return false;
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    return d > tempRange.from && d < tempRange.to;
  };
  const isToday = (day) => {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    return d.toDateString() === new Date().toDateString();
  };

  return (
    <div className="mb-6">
      <h3 className="text-white font-bold text-center mb-3 text-base">
        {monthDate.getFullYear()}년 {monthDate.getMonth() + 1}월
      </h3>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-gray-500 text-xs py-1">{d}</div>
        ))}
      </div>
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
              onClick={() => onDateClick(monthDate, day)}
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
  );
}

export default function DateRangeBottomSheet({ isOpen, onClose, dateRange, onApply }) {
   const [tempRange, setTempRange] = React.useState(dateRange || { from: null, to: null });
   const scrollRef = useRef(null);
   const currentMonthRef = useRef(null);
   const months = React.useMemo(() => generateMonths(), []);

   React.useEffect(() => {
     if (isOpen) {
       setTempRange(dateRange || { from: null, to: null });
       // 현재 달로 스크롤
       setTimeout(() => {
         if (currentMonthRef.current) {
           currentMonthRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
         }
       }, 100);
     }
   }, [isOpen]);

  const handleDateClick = (monthDate, day) => {
    const clicked = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
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
            className="fixed left-0 right-0 z-[101] bg-gray-950 rounded-t-3xl flex flex-col"
            style={{ bottom: '64px', maxHeight: 'calc(80vh - 64px)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-black flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-white">날짜 선택</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Scrollable Calendar */}
            <div ref={scrollRef} className="overflow-y-auto flex-1 px-4 pt-4">
              {months.map((monthDate, idx) => (
                <div key={idx} ref={idx === 3 ? currentMonthRef : null}>
                  <MonthCalendar
                    monthDate={monthDate}
                    tempRange={tempRange}
                    onDateClick={handleDateClick}
                  />
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="px-4 py-4 border-t border-gray-800 flex gap-2 flex-shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
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