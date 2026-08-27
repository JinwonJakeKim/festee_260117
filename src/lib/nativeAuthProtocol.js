export const FESTEE_WEB_ORIGIN = 'https://festee.org';
export const NATIVE_AUTH_SCHEME = 'com.base68e839a7fae23682478cedbe.app';
export const NATIVE_AUTH_PACKAGE = 'com.base68e839a7fae23682478cedbe.app';
export const NATIVE_AUTH_HOST = 'auth';
export const NATIVE_AUTH_PATH = '/callback';
export const NATIVE_AUTH_WEB_STATE_KEY = 'festee_native_auth_web_state';
export const NATIVE_AUTH_MAX_AGE_MS = 10 * 60 * 1000;

const NATIVE_AUTH_STATE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidNativeAuthState = (state) =>
  typeof state === 'string' && NATIVE_AUTH_STATE_PATTERN.test(state);

export const isValidNativeAuthTimestamp = (createdAt, now = Date.now()) => {
  if (!Number.isFinite(createdAt)) return false;
  const requestAge = now - createdAt;
  return requestAge >= 0 && requestAge <= NATIVE_AUTH_MAX_AGE_MS;
};
