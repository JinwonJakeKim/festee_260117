import React from 'react';
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isNativeAndroid, startNativeLogin } from '@/lib/nativeAuth';

const { appId, serverUrl, token, functionsVersion } = appParams;

const clientConfig = {
  appId,
  ...(isNativeAndroid() ? { appBaseUrl: 'https://festee.org' } : {}),
  ...(serverUrl ? { serverUrl } : {}),
  ...(token ? { token } : {}),
  ...(functionsVersion ? { functionsVersion } : {}),
  requiresAuth: false
};

export const base44 = createClient(clientConfig);

if (isNativeAndroid()) {
  base44.auth.redirectToLogin = (nextUrl) => {
    void startNativeLogin(nextUrl);
  };
}
