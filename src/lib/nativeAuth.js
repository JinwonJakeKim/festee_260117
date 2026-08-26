import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const NATIVE_AUTH_SCHEME = 'com.base68e839a7fae23682478cedbe.app';
export const NATIVE_AUTH_PACKAGE = 'com.base68e839a7fae23682478cedbe.app';
export const NATIVE_AUTH_HOST = 'auth';
export const NATIVE_AUTH_PATH = '/callback';
export const NATIVE_AUTH_WEB_STATE_KEY = 'festee_native_auth_web_state';
export const NATIVE_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

const FESTEE_WEB_ORIGIN = 'https://festee.org';
const NATIVE_AUTH_REQUEST_KEY = 'festee_native_auth_request';

export const isNativeAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const getSafeReturnPath = (nextUrl) => {
  try {
    const url = new URL(nextUrl || window.location.href, window.location.origin);
    if (url.origin !== window.location.origin) return '/MyFestee';
    return `${url.pathname}${url.search}${url.hash}` || '/MyFestee';
  } catch {
    return '/MyFestee';
  }
};

export const startNativeLogin = async (nextUrl) => {
  const state = crypto.randomUUID();
  const request = {
    state,
    returnPath: getSafeReturnPath(nextUrl),
    createdAt: Date.now(),
  };

  localStorage.setItem(NATIVE_AUTH_REQUEST_KEY, JSON.stringify(request));

  const startUrl = new URL('/NativeAuthStart', FESTEE_WEB_ORIGIN);
  startUrl.searchParams.set('native', 'android');
  startUrl.searchParams.set('state', state);

  try {
    await Browser.open({ url: startUrl.toString() });
  } catch {
    localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
  }
};

export const consumeNativeAuthRequest = (state) => {
  let request;
  try {
    request = JSON.parse(localStorage.getItem(NATIVE_AUTH_REQUEST_KEY) || 'null');
  } catch {
    localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
    return null;
  }

  if (!request || typeof request.createdAt !== 'number') {
    localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
    return null;
  }

  if (Date.now() - request.createdAt > NATIVE_AUTH_MAX_AGE_MS) {
    localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
    return null;
  }

  if (!state || request.state !== state) return null;

  localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
  return {
    returnPath:
      typeof request.returnPath === 'string' &&
      request.returnPath.startsWith('/') &&
      !request.returnPath.startsWith('//')
        ? request.returnPath
        : '/MyFestee',
  };
};

export const parseNativeAuthCallback = (callbackUrl) => {
  try {
    const url = new URL(callbackUrl);
    if (
      url.protocol !== `${NATIVE_AUTH_SCHEME}:` ||
      url.hostname !== NATIVE_AUTH_HOST ||
      url.pathname !== NATIVE_AUTH_PATH
    ) {
      return null;
    }

    const accessToken = url.searchParams.get('access_token');
    const state = url.searchParams.get('state');
    if (!accessToken || !state) return null;

    return { accessToken, state };
  } catch {
    return null;
  }
};
