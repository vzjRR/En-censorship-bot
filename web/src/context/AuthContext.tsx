import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setCsrfToken, ApiError } from "../lib/api";
import type { SessionUser } from "../lib/types";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  authError: string | null;
  hasPermission: (permission: string) => boolean;
  loginUrl: () => string;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ user: SessionUser; csrfToken: string }>("/auth/me");
      setUser(res.user);
      setCsrfToken(res.csrfToken);
      setAuthError(null);
    } catch (err) {
      setUser(null);
      setCsrfToken(null);
      if (err instanceof ApiError && err.status !== 401) {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loginUrl = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const returnTo = window.location.pathname.replace(base, "") || "/";
    return `${base}/api/auth/discord/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
    setCsrfToken(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.isPlatformOwner) return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, authError, hasPermission, loginUrl, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
