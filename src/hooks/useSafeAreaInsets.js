import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Android WebView에서 env(safe-area-inset-*) CSS 변수가 제대로 작동하지 않는 경우를 대비해
 * JavaScript로 안전 영역 값을 동적으로 감지하는 훅
 */
export default function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    isNativeAndroid: false,
  });

  useEffect(() => {
    const getInsetValue = (property) => {
      try {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.padding = `env(${property}, 0px)`;
        el.style.visibility = 'hidden';
        document.body.appendChild(el);
        const computed = getComputedStyle(el).paddingTop;
        document.body.removeChild(el);
        const value = parseFloat(computed) || 0;
        return value;
      } catch {
        return 0;
      }
    };

    const isNativeAndroid =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    const getNativeInsetValue = (property) => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue(`--${property}`);
      return parseFloat(value) || 0;
    };

    const update = () => {
      // Capacitor 8의 SystemBars 플러그인은 Android WindowInsetsCompat 값을
      // --safe-area-inset-* 변수로 주입합니다. 웹과 iOS는 기존 env() 값을 사용합니다.
      const readInset = isNativeAndroid ? getNativeInsetValue : getInsetValue;
      const top = readInset('safe-area-inset-top');
      const bottom = readInset('safe-area-inset-bottom');
      const left = readInset('safe-area-inset-left');
      const right = readInset('safe-area-inset-right');

      setInsets({
        // 기존 웹/iOS의 40px 상단 동작은 유지하고 Android 네이티브에서만 실제 inset을 사용합니다.
        top: isNativeAndroid ? (top || 40) : 40,
        bottom,
        left,
        right,
        isNativeAndroid,
      });
    };

    update();
    const observer = isNativeAndroid
      ? new MutationObserver(update)
      : null;
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return insets;
}
