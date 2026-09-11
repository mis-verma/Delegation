import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type Role } from '../api/auth';
import { tokenStore } from '../lib/tokenStore';

type User = { id: string; name: string; email: string; role: Role; departmentId: string | null; storeId: string | null };

type AuthContextType = {
  user:   User | null;
  token:  string | null;
  login:  (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = 'tm-user';

const loadUser = (): User | null => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); }
  catch { return null; }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [user,  setUser]  = useState<User | null>(loadUser);

  useEffect(() => {
    const unsubscribe = tokenStore.subscribe(setToken);
    return () => { unsubscribe(); };
  }, []);

  const login = (t: string, u: User) => {
    tokenStore.set(t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    // Fire-and-forget, not awaited — sign-out should stay instant like it always has, and there's
    // nothing to react to locally either way. This revokes the refresh token server-side so the
    // still-valid httpOnly cookie can't be replayed (via /auth/refresh) to silently mint a new
    // session after the user believes they've signed out — clearing only the local token/user
    // state below never invalidated that cookie.
    authApi.logout().catch(() => {});
    tokenStore.set(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    // Purge every cached query on sign-out — without this, whatever the previous account had
    // already fetched (tasks, tickets, dashboard data) stays in memory and can render for
    // whichever account logs in next in this same tab, before its own queries refetch.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Provider + hook intentionally live in one file (the hook is meaningless without its provider);
// only affects Fast Refresh granularity, not runtime correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
