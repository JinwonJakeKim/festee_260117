import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { useAuth } from '@/lib/AuthContext';
import {
  consumeNativeAuthRequest,
  isNativeAndroid,
  parseNativeAuthCallback,
} from '@/lib/nativeAuth';

export default function NativeAuthListener() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { completeNativeLogin } = useAuth();

  useEffect(() => {
    if (!isNativeAndroid()) return undefined;

    let disposed = false;
    let listenerHandle;
    let isHandling = false;

    const handleCallback = async (callbackUrl) => {
      if (disposed || isHandling) return;

      const callback = parseNativeAuthCallback(callbackUrl);
      if (!callback) return;

      const request = consumeNativeAuthRequest(callback.state);
      if (!request) return;

      isHandling = true;
      try {
        const currentUser = await completeNativeLogin(callback.accessToken);
        await queryClient.cancelQueries({ queryKey: ['currentUser'] });
        queryClient.setQueryData(['currentUser'], currentUser);
        await Browser.close().catch(() => {});
        if (!disposed) navigate(request.returnPath, { replace: true });
      } catch {
        await Browser.close().catch(() => {});
      } finally {
        isHandling = false;
      }
    };

    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void handleCallback(url);
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    });

    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (launch?.url) void handleCallback(launch.url);
    });

    return () => {
      disposed = true;
      if (listenerHandle) void listenerHandle.remove();
    };
  }, [completeNativeLogin, navigate, queryClient]);

  return null;
}
