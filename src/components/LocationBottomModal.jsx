import React, { useState, useMemo } from "react";
import { X, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const safeStringIncludes = (str, search) => {
  if (typeof str !== 'string' || typeof search !== 'string') return false;
  return str.toLowerCase().includes(search.toLowerCase());
};

export default function LocationBottomModal({
  show,
  onClose,
  locationStats,
  selectedCountry,
  selectedCity,
  onApply,
  onReset,
  filteredFestivals,
  festivals,
  searchQuery,
}) {
  const [searchQuery2, setSearchQuery2] = useState("");
  const [localCountry, setLocalCountry] = useState(selectedCountry || "");
  const [localCity, setLocalCity] = useState(selectedCity || "");
  const [expandedCountries, setExpandedCountries] = useState({});

  const CITY_DISPLAY_LIMIT = 8;

  const toggleCountryExpand = (countryKey) => {
    setExpandedCountries(prev => ({ ...prev, [countryKey]: !prev[countryKey] }));
  };

  // 검색어에 따라 국가 목록 필터링
  const filteredCountries = useMemo(() => {
    const query = searchQuery2.toLowerCase().trim();
    if (!query) return Object.entries(locationStats);

    return Object.entries(locationStats).filter(([countryKey, data]) => {
      const countryMatch = safeStringIncludes(data.display, query) || safeStringIncludes(countryKey, query);
      const cityMatch = Object.entries(data.cities).some(([cityKey, cityData]) =>
        safeStringIncludes(cityData.display, query) || safeStringIncludes(cityKey, query)
      );
      return countryMatch || cityMatch;
    });
  }, [locationStats, searchQuery2]);

  const handleCountryToggle = (countryKey) => {
    if (localCountry === countryKey) {
      setLocalCountry("");
      setLocalCity("");
    } else {
      setLocalCountry(countryKey);
      setLocalCity("");
    }
  };

  const handleCityToggle = (countryKey, cityKey) => {
    if (localCity === cityKey && localCountry === countryKey) {
      setLocalCity("");
    } else {
      setLocalCountry(countryKey);
      setLocalCity(cityKey);
    }
  };

  // 현재 선택에 맞는 결과 수 계산
  const resultCount = useMemo(() => {
    const source = searchQuery ? filteredFestivals : festivals;
    if (!localCountry) return source.length;
    return source.filter(f => {
      const matchCountry = f.country === localCountry;
      if (!matchCountry) return false;
      if (localCity) return f.city === localCity;
      return true;
    }).length;
  }, [localCountry, localCity, filteredFestivals, festivals, searchQuery]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Bottom Sheet */}
      <div className="relative bg-gray-950 rounded-t-3xl flex flex-col h-[80vh] mb-16" style={{marginBottom: 'calc(64px + env(safe-area-inset-bottom))'}}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 pt-2 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">위치</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex items-center bg-gray-900 rounded-xl border border-gray-700 h-11 gap-2 px-3">
            <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery2}
              onChange={(e) => setSearchQuery2(e.target.value)}
              placeholder="도시, 지역, 또는 국가를 검색해보세요."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500 h-full text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {filteredCountries.length > 0 ? (
            filteredCountries.map(([countryKey, data]) => {
              const isCountrySelected = localCountry === countryKey;
              const cityEntries = Object.entries(data.cities);
              const isExpanded = expandedCountries[countryKey];
              const displayedCities = isExpanded ? cityEntries : cityEntries.slice(0, CITY_DISPLAY_LIMIT);

              return (
                <div key={countryKey}>
                  {/* Country row */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-bold text-sm">{data.display}</span>
                    <button
                      onClick={() => handleCountryToggle(countryKey)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isCountrySelected && !localCity
                          ? 'bg-cyan-500 border-cyan-500'
                          : 'border-gray-600'
                      }`}
                    >
                      {isCountrySelected && !localCity && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </button>
                  </div>

                  {/* City chips */}
                  <div className="flex flex-wrap gap-2 mb-1">
                    {displayedCities.map(([cityKey, cityData]) => {
                      const isCitySelected = localCity === cityKey && localCountry === countryKey;
                      return (
                        <button
                          key={cityKey}
                          onClick={() => handleCityToggle(countryKey, cityKey)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                            isCitySelected
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 font-medium'
                              : 'bg-transparent border-gray-700 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {cityData.display}
                        </button>
                      );
                    })}
                  </div>

                  {/* 펼치기/접기 */}
                  {cityEntries.length > CITY_DISPLAY_LIMIT && (
                    <button
                      onClick={() => toggleCountryExpand(countryKey)}
                      className="text-gray-500 text-xs mt-1 hover:text-gray-400"
                    >
                      {isExpanded ? '접기' : '펼치기'}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="px-4 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setLocalCountry("");
              setLocalCity("");
              onReset();
            }}
            className="text-gray-400 text-sm underline"
          >
            재설정
          </button>
          <Button
            onClick={() => onApply(localCountry, localCity)}
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-6"
          >
            {resultCount}개 결과 보기
          </Button>
        </div>
      </div>
    </div>
  );
}