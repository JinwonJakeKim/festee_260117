import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";

export default function CategoryMultiSelect({ categories, selectedCategories, onToggleCategory, label }) {
  const items = categories.map(c => (typeof c === 'string' ? { value: c, label: c } : c));
  const activeCount = selectedCategories.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-auto min-w-[80px] px-3 rounded-full h-9 border flex items-center gap-1.5 text-xs whitespace-nowrap ${
            activeCount > 0
              ? "bg-purple-500/20 border-purple-400 text-purple-400"
              : "bg-gray-900 border-gray-800 text-white"
          }`}
        >
          <Tag className="w-4 h-4 text-purple-400" />
          <span>{activeCount > 0 ? `${label} (${activeCount})` : label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="bg-gray-900 border-gray-800 w-auto p-0">
        <div className="flex flex-wrap gap-2 p-3 max-w-[280px]">
          {items.map(({ value, label: lbl }) => (
            <Badge
              key={value}
              onClick={() => onToggleCategory(value)}
              className={`cursor-pointer select-none ${
                selectedCategories.includes(value)
                  ? "bg-cyan-400 text-black"
                  : "bg-gray-800 text-white"
              }`}
            >
              {lbl}
            </Badge>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}