import React, { useEffect, useState } from 'react';
import {
  FESTEE_WEB_ORIGIN,
  NATIVE_AUTH_WEB_STATE_KEY,
} from '@/lib/nativeAuthProtocol';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NativeAuthStart() {
  const [message, setMessage] = useState('로그인 페이지로 이동하는 중입니다...');

  useEffect(() => {
    const pageUrl = new URL(window.location.href);
    const isAndroidRequest = pageUrl.searchParams.get('native') === 'android';
    const state = pageUrl.searchParams.get('state');

    window.history.replaceState({}, document.title, pageUrl.pathname);

    if (!isAndroidRequest || !state || !UUID_PATTERN.test(state)) {
      setMessage('유효한 Android 로그인 요청이 아닙니다.');
      return;
    }

    try {
      sessionStorage.setItem(
        NATIVE_AUTH_WEB_STATE_KEY,
        JSON.stringify({ state, createdAt: Date.now() })
      );
    } catch {
      setMessage('로그인 요청을 저장할 수 없습니다. Festee 앱에서 다시 시도해 주세요.');
      return;
    }

    const callbackUrl = new URL('/NativeAuthCallback', FESTEE_WEB_ORIGIN);
    callbackUrl.searchParams.set('native', 'android');
    callbackUrl.searchParams.set('state', state);

    const loginUrl = new URL('/login', FESTEE_WEB_ORIGIN);
    loginUrl.searchParams.set('from_url', callbackUrl.toString());
    window.location.replace(loginUrl.toString());
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <p className="text-center text-sm text-gray-300">{message}</p>
    </div>
  );
}
