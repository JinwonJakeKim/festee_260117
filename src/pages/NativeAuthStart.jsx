import React, { useEffect, useState } from 'react';
import {
  NATIVE_AUTH_WEB_STATE_KEY,
} from '@/lib/nativeAuth';

const FESTEE_WEB_ORIGIN = 'https://festee.org';

export default function NativeAuthStart() {
  const [message, setMessage] = useState('로그인 페이지로 이동하는 중입니다...');

  useEffect(() => {
    const pageUrl = new URL(window.location.href);
    const isAndroidRequest = pageUrl.searchParams.get('native') === 'android';
    const state = pageUrl.searchParams.get('state');

    window.history.replaceState({}, document.title, pageUrl.pathname);

    if (!isAndroidRequest || !state) {
      setMessage('유효한 Android 로그인 요청이 아닙니다.');
      return;
    }

    sessionStorage.setItem(
      NATIVE_AUTH_WEB_STATE_KEY,
      JSON.stringify({ state, createdAt: Date.now() })
    );

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
