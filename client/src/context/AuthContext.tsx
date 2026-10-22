import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type Role } from '../api/auth';
import { viewAsApi } from '../api/viewAs';
import { tokenStore } from '../lib/tokenStore';
import { viewAsStore } from '../lib/viewAsStore';

type User = { id: string; name: string; email: string; role: Role; departmentId: string | null; storeId: string | null; mustChangePassword?: boolean };

type AuthContextType = {
  user:       User | null;
  realUser:   User | null;
  isPreviewing: boolean;
  token:      string | null;
  login:      (token: string, user: User) => void;
  logout:     () => void;
  updateUser: (patch: Partial<User>) => void;
  startViewAs: (userId: string) => Promise<void>;
  stopViewAs:  () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const USER_KEY = 'tm-user';
const VIEWED_KEY = 'tm-view-as-user';

const loadUser = (): User | null => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); }
  catch { return null; }
};

const loadViewed = (): User | null => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(VIEWED_KEY) ?? 'null') as User | null;
    if (stored && stored.id === viewAsStore.get()) return stored;
  } catch {
  }
  viewAsStore.set(null);
  return null;
};

const rememberViewed = (viewed: User | null) => {
  try {
    if (viewed) sessionStorage.setItem(VIEWED_KEY, JSON.stringify(viewed));
    else sessionStorage.removeItem(VIEWED_KEY);
  } catch {
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [realUser, setUser] = useState<User | null>(loadUser);
  const [viewed, setViewed] = useState<User | null>(loadViewed);

  useEffect(() => {
    const unsubscribe = tokenStore.subscribe(setToken);
    return () => { unsubscribe(); };
  }, []);

  const clearPreview = () => {
    viewAsStore.set(null);
    rememberViewed(null);
    setViewed(null);
  };

  const login = (t: string, u: User) => {
    clearPreview();
    tokenStore.set(t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  };

  const updateUser = (patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    clearPreview();
    authApi.logout().catch(() => {});
    tokenStore.set(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    queryClient.clear();
  };

  const startViewAs = async (userId: string) => {
    const target = await viewAsApi.start(userId);
    const next: User = {
      id: target.id,
      name: [target.firstName, target.lastName].filter(Boolean).join(' '),
      email: target.email,
      role: target.role,
      departmentId: target.departmentId,
      storeId: target.storeId,
    };
    viewAsStore.set(next.id);
    rememberViewed(next);
    setViewed(next);
    queryClient.clear();
  };

  const stopViewAs = () => {
    const id = viewed?.id;
    clearPreview();
    queryClient.clear();
    if (id) viewAsApi.end(id).catch(() => {});
  };

  const canPreview = realUser?.role === 'ADMIN';
  const effective = canPreview && viewed ? viewed : realUser;

  return (
    <AuthContext.Provider value={{ user: effective, realUser, isPreviewing: !!(canPreview && viewed), token, login, logout, updateUser, startViewAs, stopViewAs }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
