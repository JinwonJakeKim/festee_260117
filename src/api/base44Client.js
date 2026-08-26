import React from 'react';
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isNativeAndroid, startNativeLogin } from '@/lib/nativeAuth';

const { appId, serverUrl, token, functionsVersion } = appParams;

const createBase44Client = (accessToken = token) => {
  const client = createClient({
    appId,
    ...(isNativeAndroid() ? { appBaseUrl: 'https://festee.org' } : {}),
    ...(serverUrl ? { serverUrl } : {}),
    ...(accessToken ? { token: accessToken } : {}),
    ...(functionsVersion ? { functionsVersion } : {}),
    requiresAuth: false
  });

  if (isNativeAndroid()) {
    client.auth.redirectToLogin = (nextUrl) => {
      void startNativeLogin(nextUrl);
    };
  }

  return client;
};

export const base44 = createBase44Client();

export const resetNativeAuthClient = () => {
  if (!isNativeAndroid()) return;

  base44.cleanup();
  localStorage.removeItem('base44_access_token');
  localStorage.removeItem('token');
  appParams.token = null;

  Object.assign(base44, createBase44Client(null));
};
