import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function DateRangePicker({ selected, onSelect, onApply, onReset, hidePastFestivals, onHidePastFestivalsChange }) {
  const [currentMonth, setCurrentMonth] = useState(
    selected?.from ? new Date(selected.from) : new Date()
  );

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateClick = (day) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    
    if (!selected?.from || (selected.from && selected.to)) {
      // 새로운 범위 시작
      onSelect({ from: clickedDate, to: null });
    } else {
      // 범위 종료
      if (clickedDate < selected.from) {
        onSelect({ from: clickedDate, to: selected.from });
      } else {
        onSelect({ from: selected.from, to: clickedDate });
      }
    }
  };

  const isDateInRange = (day) => {
    if (!selected?.from || !selected?.to) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return date > selected.from && date < selected.to;
  };

  const isDateRangeStart = (day) => {
    if (!selected?.from) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return date.toDateString() === selected.from.toDateString();
  };

  const isDateRangeEnd = (day) => {
    if (!selected?.to) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return date.toDateString() === selected.to.toDateString();
  };

  const isToday = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];

  // 이전 달 빈 칸
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // 현재 달 날짜
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // 6주(42칸)를 항상 유지하기 위해 다음 달 빈 칸 추가
  while (days.length < 42) {
    days.push(null);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 w-[320px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-cyan-400" />
        </button>
        <h3 className="text-white font-bold text-lg">
          {currentMonth.getFullYear()}년 {MONTHS[currentMonth.getMonth()]}
        </h3>
        <button
          onClick={handleNextMonth}
          className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-cyan-400" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS.map((day) => (
          <div key={day} className="text-center text-gray-500 text-xs font-medium py-2 w-10">
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 - 고정 높이 */}
      <div className="grid grid-cols-7 gap-1 mb-3" style={{ minHeight: '240px' }}>
        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="w-10 h-10" />;
          }

          const isStart = isDateRangeStart(day);
          const isEnd = isDateRangeEnd(day);
          const inRange = isDateInRange(day);
          const today = isToday(day);

          return (
            <button
              key={day}
              onClick={() => handleDateClick(day)}
              className={`
                w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all
                ${isStart || isEnd
                  ? 'bg-cyan-400 text-black font-bold'
                  : inRange
                  ? 'bg-cyan-400/25 text-cyan-400 font-semibold'
                  : 'text-white hover:bg-gray-800'
                }
                ${today && !isStart && !isEnd ? 'border-2 border-pink-500 text-pink-500' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 지난 축제 보기 토글 */}
      {onHidePastFestivalsChange && (
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-800">
          <span className="text-white text-sm">지난 축제 보기</span>
          <Switch
            checked={!hidePastFestivals}
            onCheckedChange={(checked) => onHidePastFestivalsChange(!checked)}
            className="data-[state=checked]:bg-cyan-500"
          />
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2">
        <Button
          onClick={onReset}
          variant="outline"
          size="sm"
          className="flex-1 bg-gray-800 text-white border-gray-700 hover:bg-gray-700"
        >
          초기화
        </Button>
        <Button
          onClick={onApply}
          size="sm"
          className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white"
        >
          적용
        </Button>
      </div>
    </div>
  );
}