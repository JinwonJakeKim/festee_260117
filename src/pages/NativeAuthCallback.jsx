import React, { useEffect, useRef, useState } from 'react';
import {
  NATIVE_AUTH_HOST,
  NATIVE_AUTH_MAX_AGE_MS,
  NATIVE_AUTH_PACKAGE,
  NATIVE_AUTH_PATH,
  NATIVE_AUTH_SCHEME,
  NATIVE_AUTH_WEB_STATE_KEY,
} from '@/lib/nativeAuthProtocol';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function NativeAuthCallback() {
  const [message, setMessage] = useState('Festee 앱으로 돌아가는 중입니다...');
  const [canOpenApp, setCanOpenApp] = useState(false);
  const appIntentUrlRef = useRef(null);
  const hasHandledCallbackRef = useRef(false);

  const openApp = () => {
    if (appIntentUrlRef.current) {
      window.location.replace(appIntentUrlRef.current);
    }
  };

  useEffect(() => {
    if (hasHandledCallbackRef.current) return;
    hasHandledCallbackRef.current = true;

    const pageUrl = new URL(window.location.href);
    const isAndroidCallback = pageUrl.searchParams.get('native') === 'android';
    const state = pageUrl.searchParams.get('state');
    const urlAccessToken = pageUrl.searchParams.get('access_token');

    pageUrl.searchParams.delete('access_token');
    pageUrl.searchParams.delete('state');
    pageUrl.searchParams.delete('native');
    window.history.replaceState(
      {},
      document.title,
      `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`
    );

    let webRequest = null;
    try {
      webRequest = JSON.parse(sessionStorage.getItem(NATIVE_AUTH_WEB_STATE_KEY) || 'null');
    } catch {
      // Invalid or unavailable session data is handled as an untrusted callback.
    }

    try {
      sessionStorage.removeItem(NATIVE_AUTH_WEB_STATE_KEY);
    } catch {
      // Continue without retaining an in-memory copy of the session marker.
    }

    const requestAge = Date.now() - webRequest?.createdAt;
    const hasMatchingWebState =
      isAndroidCallback &&
      !!state &&
      UUID_PATTERN.test(state) &&
      webRequest?.state === state &&
      typeof webRequest.createdAt === 'number' &&
      requestAge >= 0 &&
      requestAge <= NATIVE_AUTH_MAX_AGE_MS;

    if (!hasMatchingWebState) {
      setMessage('유효한 Android 로그인 요청을 확인할 수 없습니다.');
      return;
    }

    const accessToken =
      urlAccessToken ||
      localStorage.getItem('base44_access_token') ||
      localStorage.getItem('token');

    if (!accessToken) {
      setMessage('로그인 정보를 확인할 수 없습니다. Festee 앱에서 다시 시도해 주세요.');
      return;
    }

    const callbackParams = new URLSearchParams({
      access_token: accessToken,
      state,
    });
    appIntentUrlRef.current =
      `intent://${NATIVE_AUTH_HOST}${NATIVE_AUTH_PATH}?${callbackParams.toString()}` +
      `#Intent;scheme=${NATIVE_AUTH_SCHEME};package=${NATIVE_AUTH_PACKAGE};end`;
    setCanOpenApp(true);
    openApp();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-sm text-gray-300">{message}</p>
        {canOpenApp && (
          <button
            type="button"
            onClick={openApp}
            className="mt-5 rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-black"
          >
            Festee 앱 열기
          </button>
        )}
      </div>
    </div>
  );
}
