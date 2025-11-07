import * as React from "react";

const Slider = React.forwardRef(({ className = "", value = [0, 100], onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (index, newValue) => {
    const numValue = Number(newValue);
    const newValues = [...localValue];
    newValues[index] = numValue;
    
    // Ensure min doesn't exceed max and vice versa
    if (index === 0 && newValues[0] > newValues[1]) {
      newValues[0] = newValues[1];
    }
    if (index === 1 && newValues[1] < newValues[0]) {
      newValues[1] = newValues[0];
    }
    
    setLocalValue(newValues);
    if (onValueChange) {
      onValueChange(newValues);
    }
  };

  const percentage0 = ((localValue[0] - min) / (max - min)) * 100;
  const percentage1 = localValue.length > 1 ? ((localValue[1] - min) / (max - min)) * 100 : 100;

  return (
    <div ref={ref} className={`relative w-full ${className}`} {...props}>
      {/* Track */}
      <div className="relative h-2 w-full bg-gray-800 rounded-full">
        {/* Active Range */}
        <div
          className="absolute h-full bg-cyan-400 rounded-full"
          style={{
            left: `${percentage0}%`,
            right: `${100 - percentage1}%`,
          }}
        />
      </div>

      {/* First Thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue[0]}
        onChange={(e) => handleChange(0, e.target.value)}
        className="absolute top-0 left-0 w-full h-2 opacity-0 cursor-pointer"
        style={{ zIndex: localValue.length > 1 ? 2 : 1 }}
      />
      <div
        className="absolute top-1/2 w-5 h-5 -mt-2.5 bg-white border-2 border-cyan-400 rounded-full pointer-events-none"
        style={{ left: `calc(${percentage0}% - 10px)` }}
      />

      {/* Second Thumb (if range slider) */}
      {localValue.length > 1 && (
        <>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={localValue[1]}
            onChange={(e) => handleChange(1, e.target.value)}
            className="absolute top-0 left-0 w-full h-2 opacity-0 cursor-pointer"
            style={{ zIndex: 1 }}
          />
          <div
            className="absolute top-1/2 w-5 h-5 -mt-2.5 bg-white border-2 border-cyan-400 rounded-full pointer-events-none"
            style={{ left: `calc(${percentage1}% - 10px)` }}
          />
        </>
      )}
    </div>
  );
});

Slider.displayName = "Slider";

export { Slider };