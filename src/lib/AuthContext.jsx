import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const headers = { 'X-App-Id': appParams.appId };
      if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;

      try {
        const resp = await fetch(
          `${appParams.serverUrl}/api/apps/public/prod/public-settings/by-id/${appParams.appId}`,
          { headers }
        );

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const err = new Error(data?.message || 'Failed to load app');
          err.status = resp.status;
          err.data = data;
          throw err;
        }

        const publicSettings = await resp.json();
        setAppPublicSettings(publicSettings);
        setIsLoadingPublicSettings(false);

        if (base44.auth.hasToken()) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
      } catch (appError) {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);

        const reason = appError.data?.extra_data?.reason;
        if (appError.status === 403 && reason) {
          setAuthError({ type: reason, message: appError.message });
        } else {
          setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
        }
      }
    } catch (error) {
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(shouldRedirect ? window.location.href : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  const completeNativeLogin = useCallback(async (accessToken) => {
    base44.setToken(accessToken);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      completeNativeLogin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
