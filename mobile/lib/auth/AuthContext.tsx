import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, type AuthUser } from "./authApi";
import { tokenStore } from "./tokenStore";
import { setSessionExpiredHandler } from "../api/http";

type AuthContextValue = {
  user: AuthUser | null;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Distinct from "no user" — until this resolves we don't know yet whether a stored refresh
  // token is still good, so the router must not render the login screen or the app shell.
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const clearSession = () => {
    setUser(null);
    tokenStore.setAccessToken(null);
  };

  useEffect(() => {
    setSessionExpiredHandler(clearSession);

    (async () => {
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) {
        setIsBootstrapping(false);
        return;
      }
      try {
        const result = await authApi.refresh(refreshToken);
        tokenStore.setAccessToken(result.accessToken);
        await tokenStore.setRefreshToken(result.refreshToken);
        setUser(result.user);
      } catch {
        await tokenStore.setRefreshToken(null);
      } finally {
        setIsBootstrapping(false);
      }
    })();

    return () => setSessionExpiredHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    tokenStore.setAccessToken(result.accessToken);
    await tokenStore.setRefreshToken(result.refreshToken);
    setUser(result.user);
  };

  const logout = async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    clearSession();
    await tokenStore.setRefreshToken(null);
    // Best-effort: the local session is already cleared either way, this just revokes the token
    // server-side so a captured copy of it can't be replayed.
    authApi.logout(refreshToken).catch(() => {});
  };

  return <AuthContext.Provider value={{ user, isBootstrapping, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
