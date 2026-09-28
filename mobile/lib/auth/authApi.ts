import { apiFetch } from "../api/http";

export type Role = "ADMIN" | "SENIOR" | "MANAGER" | "AGENT" | "USER" | "PC";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  firstName: string | null;
  departmentId: string | null;
  storeId: string | null;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type LoginPayload = { email: string; password: string };

export const authApi = {
  login: (p: LoginPayload) => apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(p) }),

  refresh: (refreshToken: string) =>
    apiFetch<AuthResponse>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),

  logout: (refreshToken: string | null) =>
    apiFetch<{ success: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }),
};
