import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getMeApi, logoutApi } from '../api/auth.api';
import type { User } from '../types';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;       // True during the initial session check
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check if the tab has an active session token in sessionStorage
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const token = sessionStorage.getItem('plinth_access_token');
      if (!token) {
        // Tab does not have a session token — keep this tab unauthenticated
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getMeApi();
        if (!cancelled) setUser(currentUser);
      } catch {
        // Token is invalid/expired for this tab — clear only this tab's token
        sessionStorage.removeItem('plinth_access_token');
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      sessionStorage.removeItem('plinth_access_token');
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getMeApi();
      setUser(currentUser);
    } catch {
      sessionStorage.removeItem('plinth_access_token');
      setUser(null);
    }
  }, []);

  const mustChangePassword = Boolean(
    user && (user.role === 'BUILDER' || user.role === 'DSA') && user.mustChangePassword
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        mustChangePassword,
        setUser,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
