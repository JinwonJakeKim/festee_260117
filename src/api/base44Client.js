import React from 'react';
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

const clientConfig = {
  appId,
  ...(serverUrl ? { serverUrl } : {}),
  ...(token ? { token } : {}),
  ...(functionsVersion ? { functionsVersion } : {}),
  requiresAuth: false
};

export const base44 = createClient(clientConfig);