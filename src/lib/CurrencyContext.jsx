import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const CurrencyContext = createContext();

const SUPPORTED_CURRENCIES = ['KRW', 'USD', 'JPY', 'CNY'];

const CURRENCY_LOCALES = {
  KRW: { locale: 'ko-KR', currency: 'KRW', maximumFractionDigits: 0 },
  USD: { locale: 'en-US', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 },
  JPY: { locale: 'ja-JP', currency: 'JPY', maximumFractionDigits: 0 },
  CNY: { locale: 'zh-CN', currency: 'CNY', maximumFractionDigits: 2, minimumFractionDigits: 2 },
};

export const CurrencyProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [currency, setCurrencyState] = useState('KRW');

  // 사용자의 preferred_currency로 로컬 상태 동기화
  useEffect(() => {
    const preferred = user?.preferred_currency;
    if (preferred && SUPPORTED_CURRENCIES.includes(preferred)) {
      setCurrencyState(preferred);
    } else {
      setCurrencyState('KRW');
    }
  }, [user?.preferred_currency]);

  // 최신 환율 데이터 1건 조회 (date DESC, created_date DESC)
  const { data: exchangeRate, isLoading: isLoadingRate } = useQuery({
    queryKey: ['latestExchangeRate'],
    queryFn: async () => {
      // date DESC로 조회 후, 동일 날짜가 여러 건이면 created_date가 최신인 것 선택
      const rates = await base44.entities.ExchangeRate.list('-date', 10);
      if (!rates || rates.length === 0) return null;
      const latestDate = rates[0].date;
      const sameDateRates = rates.filter(r => r.date === latestDate);
      if (sameDateRates.length <= 1) return rates[0];
      sameDateRates.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      return sameDateRates[0];
    },
    staleTime: 5 * 60 * 1000, // 5분 캐싱
    cacheTime: 30 * 60 * 1000,
  });

  // KRW 기준 금액을 선택된 통화로 환산
  const convertFromKRW = useCallback((amountKRW, targetCurrency, rate) => {
    const cur = targetCurrency || currency;
    const r = rate || exchangeRate;
    if (amountKRW == null || amountKRW === undefined) return null;
    if (cur === 'KRW') return amountKRW;
    if (!r) return null; // 환율 데이터 없음
    const rateValue = cur === 'USD' ? r.usd_rate : cur === 'JPY' ? r.jpy_rate : cur === 'CNY' ? r.cny_rate : null;
    if (!rateValue || rateValue === 0) return null;
    return amountKRW / rateValue;
  }, [currency, exchangeRate]);

  // 통화별 포맷팅
  const formatCurrency = useCallback((amountKRW, overrideCurrency) => {
    const cur = overrideCurrency || currency;
    if (amountKRW == null || amountKRW === undefined || amountKRW === '') return '';
    const numAmount = Number(amountKRW);
    if (isNaN(numAmount)) return String(amountKRW);
    if (numAmount === 0) return '무료';
    const converted = convertFromKRW(numAmount, cur);
    if (converted == null) {
      // 환율 데이터가 없으면 KRW로 표시
      const config = CURRENCY_LOCALES['KRW'];
      return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.currency,
        maximumFractionDigits: config.maximumFractionDigits,
      }).format(numAmount);
    }
    const config = CURRENCY_LOCALES[cur];
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      maximumFractionDigits: config.maximumFractionDigits,
      minimumFractionDigits: config.minimumFractionDigits || 0,
    }).format(converted);
  }, [currency, convertFromKRW]);

  // 통화 설정 변경 (즉시 반영 + 백엔드 저장)
  const setCurrency = useCallback(async (newCurrency) => {
    if (!SUPPORTED_CURRENCIES.includes(newCurrency)) return;
    setCurrencyState(newCurrency); // 즉시 UI 반영 (optimistic)
    try {
      await base44.auth.updateMe({ preferred_currency: newCurrency });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    } catch (e) {
      console.error('통화 설정 저장 실패:', e);
    }
  }, [queryClient]);

  const value = {
    currency,
    setCurrency,
    exchangeRate,
    isLoadingRate,
    formatCurrency,
    convertFromKRW,
    supportedCurrencies: SUPPORTED_CURRENCIES,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};

export { SUPPORTED_CURRENCIES };