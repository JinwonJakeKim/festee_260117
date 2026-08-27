import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  FESTEE_WEB_ORIGIN,
  NATIVE_AUTH_HOST,
  NATIVE_AUTH_PATH,
  NATIVE_AUTH_SCHEME,
  isValidNativeAuthState,
  isValidNativeAuthTimestamp,
} from './nativeAuthProtocol';

export {
  NATIVE_AUTH_HOST,
  NATIVE_AUTH_MAX_AGE_MS,
  NATIVE_AUTH_PACKAGE,
  NATIVE_AUTH_PATH,
  NATIVE_AUTH_SCHEME,
  NATIVE_AUTH_WEB_STATE_KEY,
} from './nativeAuthProtocol';

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

  if (!request || !isValidNativeAuthTimestamp(request.createdAt)) {
    localStorage.removeItem(NATIVE_AUTH_REQUEST_KEY);
    return null;
  }

  if (!isValidNativeAuthState(state) || request.state !== state) return null;

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
    if (!accessToken || !isValidNativeAuthState(state)) return null;

    return { accessToken, state };
  } catch {
    return null;
  }
};
