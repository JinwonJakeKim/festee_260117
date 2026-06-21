import { useState, useEffect } from 'react';

/**
 * Android WebView에서 env(safe-area-inset-*) CSS 변수가 제대로 작동하지 않는 경우를 대비해
 * JavaScript로 안전 영역 값을 동적으로 감지하는 훅
 */
export default function useSafeAreaInsets() {
  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

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

    const update = () => {
      const top = getInsetValue('safe-area-inset-top');
      const bottom = getInsetValue('safe-area-inset-bottom');
      const left = getInsetValue('safe-area-inset-left');
      const right = getInsetValue('safe-area-inset-right');

      console.log("SAFE AREA", {
        top,
        bottom,
        left,
        right
      });

      setInsets({
        top: Math.min(top, 24),
        bottom,
        left,
        right,
      });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return insets;
}