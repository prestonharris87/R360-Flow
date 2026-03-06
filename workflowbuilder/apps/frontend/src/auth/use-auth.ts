import { useState, useEffect, useCallback } from 'react';
import type { AuthState, AuthUser } from './types';

const SESSION_KEY = 'r360_auth';

interface StoredSession {
  token: string;
  user: AuthUser;
}

export function useAuth(): AuthState {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check sessionStorage for existing session
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        setToken(session.token);
        setUser(session.user);
      }
    } catch {
      // Invalid session data, clear it
      sessionStorage.removeItem(SESSION_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    // TODO: Replace with Clerk/Auth0 redirect
    window.location.href = '/auth/login';
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setToken(null);
    window.location.href = '/';
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    if (!token) return;
    try {
      setError(null);
      // TODO: Replace with actual tenant switch API call
      const response = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) throw new Error('Failed to switch tenant');
      const data = await response.json();
      const newSession: StoredSession = { token: data.token, user: data.user };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch tenant');
    }
  }, [token]);

  return {
    isAuthenticated: !!token && !!user,
    isLoading,
    user,
    token,
    error,
    login,
    logout,
    switchTenant,
  };
}
