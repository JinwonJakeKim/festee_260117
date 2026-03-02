import React, { useState, useMemo } from "react";
import { X, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

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

  // 다중 선택: selectedCities = ["Japan__Tokyo", "Korea__Seoul", ...]
  // selectedCountries = ["Japan", ...] (도시 없이 국가 전체 선택)
  const [selectedCities, setSelectedCities] = useState(() => {
    if (selectedCity && selectedCountry) {
      // 콤마로 구분된 다중 도시 처리
      const countries = selectedCountry.split(',');
      const cities = selectedCity.split(',');
      // 도시 수와 국가 수가 같으면 1:1 매핑, 아니면 첫 번째 국가 사용
      return cities.map((city, i) => `${countries[i] || countries[0]}__${city}`);
    }
    return [];
  });
  const [selectedCountries, setSelectedCountries] = useState(() => {
    if (selectedCountry && !selectedCity) return selectedCountry.split(',');
    return [];
  });

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
    setSelectedCountries(prev =>
      prev.includes(countryKey) ? prev.filter(c => c !== countryKey) : [...prev, countryKey]
    );
    // 국가 전체 선택 시 해당 국가의 도시 개별 선택 해제
    setSelectedCities(prev => prev.filter(key => !key.startsWith(`${countryKey}__`)));
  };

  const handleCityToggle = (countryKey, cityKey) => {
    const key = `${countryKey}__${cityKey}`;
    setSelectedCities(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
    // 도시 선택 시 해당 국가 전체 선택 해제
    setSelectedCountries(prev => prev.filter(c => c !== countryKey));
  };

  // 도시별 축제 수 계산 - 항상 검색어 기반 결과(위치 필터 미적용) 사용
  const cityFestivalCounts = useMemo(() => {
    // searchQuery가 있으면 filteredFestivals(검색어만 적용, 위치필터 미적용)를 사용
    // 없으면 전체 festivals 사용
    const source = searchQuery ? filteredFestivals : festivals;
    const counts = {};
    source.forEach(f => {
      const key = `${f.country}__${f.city}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [festivals, filteredFestivals, searchQuery]);

  // 결과 수 계산
  const resultCount = useMemo(() => {
    const source = searchQuery ? filteredFestivals : festivals;
    if (selectedCountries.length === 0 && selectedCities.length === 0) return source.length;
    return source.filter(f => {
      if (selectedCountries.includes(f.country)) return true;
      if (selectedCities.includes(`${f.country}__${f.city}`)) return true;
      return false;
    }).length;
  }, [selectedCountries, selectedCities, filteredFestivals, festivals, searchQuery]);

  const handleApply = () => {
    // 단일 선택 인터페이스와의 호환성 유지:
    // 다중 선택 결과를 onApply에 전달하기 위해 확장된 형태 사용
    onApply(selectedCountries, selectedCities);
  };

  const handleReset = () => {
    setSelectedCountries([]);
    setSelectedCities([]);
    // 모달을 닫지 않고 선택만 초기화
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Bottom Sheet */}
      <div className="relative bg-gray-950 rounded-t-3xl flex flex-col h-[80vh]" style={{marginBottom: 'calc(64px + env(safe-area-inset-bottom))'}}>
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
              placeholder="국가, 도시를 검색하세요"
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500 h-full text-sm"
              autoFocus
            />
          </div>

        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {filteredCountries.length > 0 ? (
            filteredCountries.map(([countryKey, data]) => {
              const isCountrySelected = selectedCountries.includes(countryKey);
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
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isCountrySelected
                          ? 'bg-cyan-500 border-cyan-500'
                          : 'border-gray-600'
                      }`}
                    >
                      {isCountrySelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* City chips */}
                  <div className="flex flex-wrap gap-2 mb-1">
                    {displayedCities.map(([cityKey, cityData]) => {
                      const isCitySelected = selectedCities.includes(`${countryKey}__${cityKey}`);
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
                          {cityData.display}{searchQuery ? `(${cityFestivalCounts[`${countryKey}__${cityKey}`] || 0})` : cityFestivalCounts[`${countryKey}__${cityKey}`] ? `(${cityFestivalCounts[`${countryKey}__${cityKey}`]})` : ''}
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
            onClick={handleReset}
            className="text-gray-400 text-sm underline"
          >
            초기화
          </button>
          <Button
            onClick={handleApply}
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-6"
          >
            {resultCount}개 결과 보기
          </Button>
        </div>
      </div>
    </div>
  );
}