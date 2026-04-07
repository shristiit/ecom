import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { get, configureApiClient } from '@admin/lib/api';
import { authService } from '../services/auth.service';
import { sessionStorage } from '../services/session-storage';
import type { LoginInput } from '../types/auth.types';
import type { SessionState, SessionTenant, SessionUser } from '../types/session.types';

type AuthSessionContextValue = {
  status: SessionState['status'];
  isReady: boolean;
  isAuthenticated: boolean;
  requiresMfa: boolean;
  user: SessionUser | null;
  tenants: SessionTenant[];
  selectedTenantId: string | null;
  signIn: (input: LoginInput) => Promise<void>;
  signInWithSso: () => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (input: { email: string; token: string; newPassword: string }) => Promise<void>;
  selectTenant: (tenantId: string) => void;
  signOut: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
};

const MFA_ENABLED = process.env.EXPO_PUBLIC_ENABLE_MFA === 'true';
const SSO_URL = process.env.EXPO_PUBLIC_SSO_URL ?? '';

const initialState: SessionState = {
  status: 'bootstrapping',
  accessToken: null,
  refreshToken: null,
  user: null,
  tenants: [],
  selectedTenantId: null,
  pendingTokens: null,
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

async function resolvePermissions(roleId: string) {
  try {
    const roles = await get<Array<{ id: string; permissions?: string[] }>>('/admin/roles');
    const role = roles.find((item) => item.id === roleId);
    return role?.permissions ?? [];
  } catch {
    return [];
  }
}

async function buildSessionUser() {
  const profile = await authService.me();
  const permissions = await resolvePermissions(profile.roleId);

  return {
    user: {
      id: profile.id,
      tenantId: profile.tenantId,
      roleId: profile.roleId,
      email: profile.email,
      permissions,
    } satisfies SessionUser,
    defaultTenantId: profile.tenantId,
  };
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(initialState);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const unauthorizedHandlerRef = useRef<(() => Promise<boolean>) | null>(null);

  const signOut = useCallback(() => {
    sessionStorage.clear();
    setState({ ...initialState, status: 'signed_out' });
    unauthorizedHandlerRef.current = null;
    configureApiClient({ getAccessToken: () => null, getTenantId: () => null, onUnauthorized: undefined });
  }, []);

  const applyApiContext = useCallback((nextState: SessionState) => {
    configureApiClient({
      getAccessToken: () => nextState.accessToken,
      getTenantId: () => nextState.selectedTenantId ?? nextState.user?.tenantId ?? null,
      onUnauthorized: async () => {
        const handler = unauthorizedHandlerRef.current;
        if (!handler) return false;
        return handler();
      },
    });
  }, []);

  const commitSignedInSession = useCallback(
    async (accessToken: string, refreshToken: string, selectedTenantId?: string | null) => {
      sessionStorage.writeTokens(accessToken, refreshToken);

      const draftState: SessionState = {
        status: 'signed_in',
        accessToken,
        refreshToken,
        user: null,
        tenants: [],
        selectedTenantId: selectedTenantId ?? null,
        pendingTokens: null,
      };
      applyApiContext(draftState);

      const { user, defaultTenantId } = await buildSessionUser();
      const nextSelectedTenantId = selectedTenantId ?? defaultTenantId;
      const tenants: SessionTenant[] = [{ id: defaultTenantId, name: 'Primary Tenant' }];

      sessionStorage.writeSelectedTenant(nextSelectedTenantId);

      const nextState: SessionState = {
        ...draftState,
        user,
        tenants,
        selectedTenantId: nextSelectedTenantId,
      };

      setState(nextState);
      applyApiContext(nextState);
    },
    [applyApiContext],
  );

  const handleUnauthorized = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise = (async () => {
      const stored = sessionStorage.readSession();
      if (!stored.refreshToken) {
        signOut();
        return false;
      }

      try {
        const refreshed = await authService.refresh({ refreshToken: stored.refreshToken });
        await commitSignedInSession(refreshed.accessToken, refreshed.refreshToken, stored.selectedTenantId);
        return true;
      } catch {
        signOut();
        return false;
      }
    })();

    refreshInFlightRef.current = refreshPromise.finally(() => {
      refreshInFlightRef.current = null;
    });

    return refreshInFlightRef.current;
  }, [commitSignedInSession, signOut]);

  useEffect(() => {
    unauthorizedHandlerRef.current = handleUnauthorized;
  }, [handleUnauthorized]);

  const bootstrap = useCallback(async () => {
    const stored = sessionStorage.readSession();

    if (!stored.accessToken || !stored.refreshToken) {
      const signedOut: SessionState = { ...initialState, status: 'signed_out' };
      setState(signedOut);
      applyApiContext(signedOut);
      return;
    }

    try {
      await commitSignedInSession(stored.accessToken, stored.refreshToken, stored.selectedTenantId);
    } catch {
      try {
        const refreshed = await authService.refresh({ refreshToken: stored.refreshToken });
        await commitSignedInSession(refreshed.accessToken, refreshed.refreshToken, stored.selectedTenantId);
      } catch {
        signOut();
      }
    }
  }, [applyApiContext, commitSignedInSession, signOut]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      const tokens = await authService.login(input);

      if (MFA_ENABLED) {
        setState((prev) => ({
          ...prev,
          status: 'mfa_required',
          pendingTokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        }));
        return;
      }

      await commitSignedInSession(tokens.accessToken, tokens.refreshToken);
    },
    [commitSignedInSession],
  );

  const signInWithSso = useCallback(async () => {
    if (!SSO_URL) {
      throw new Error('SSO is not configured for this tenant.');
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(SSO_URL);
      return;
    }

    await openBrowserAsync(SSO_URL, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }, []);

  const verifyMfa = useCallback(
    async (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        throw new Error('Enter a valid 6-digit verification code.');
      }

      const pending = state.pendingTokens;
      if (!pending) {
        throw new Error('MFA session expired. Please sign in again.');
      }

      await commitSignedInSession(pending.accessToken, pending.refreshToken, state.selectedTenantId);
    },
    [commitSignedInSession, state.pendingTokens, state.selectedTenantId],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await authService.requestPasswordReset(email);
  }, []);

  const resetPassword = useCallback(async (input: { email: string; token: string; newPassword: string }) => {
    await authService.resetPassword(input);
  }, []);

  const selectTenant = useCallback((tenantId: string) => {
    setState((prev) => {
      const nextState = { ...prev, selectedTenantId: tenantId };
      applyApiContext(nextState);
      return nextState;
    });
    sessionStorage.writeSelectedTenant(tenantId);
  }, [applyApiContext]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!state.user) return false;
      return state.user.permissions.includes(permission) || state.user.permissions.includes('*');
    },
    [state.user],
  );

  const hasAnyPermission = useCallback(
    (permissions: string[]) => {
      if (permissions.length === 0) return true;
      return permissions.some((permission) => hasPermission(permission));
    },
    [hasPermission],
  );

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      status: state.status,
      isReady: state.status !== 'bootstrapping',
      isAuthenticated: state.status === 'signed_in',
      requiresMfa: state.status === 'mfa_required',
      user: state.user,
      tenants: state.tenants,
      selectedTenantId: state.selectedTenantId,
      signIn,
      signInWithSso,
      verifyMfa,
      requestPasswordReset,
      resetPassword,
      selectTenant,
      signOut,
      hasPermission,
      hasAnyPermission,
    }),
    [state, signIn, signInWithSso, verifyMfa, requestPasswordReset, resetPassword, selectTenant, signOut, hasPermission, hasAnyPermission],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider');
  }
  return context;
}
