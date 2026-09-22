import { apiFetch } from './http';

export type Role = 'ADMIN' | 'APPROVAL_MANAGER' | 'SENIOR' | 'MANAGER' | 'AGENT' | 'USER' | 'PC';

// Which roles land in the /admin section at all — shared by both the post-login redirect
// (features/auth/hooks.ts) and the AdminRoute/PCRoute route guards (App.tsx) so they can't
// silently drift apart (a role added to one set without the other used to mean either a login
// that "succeeds" but immediately bounces back out of /admin, or a role that's guard-eligible but
// never actually routed there on login).
export const ADMIN_AREA_ROLES: readonly Role[] = ['ADMIN', 'PC'];

export type AuthUser = {
  id:           string;
  email:        string;
  role:         Role;
  firstName:    string | null;
  departmentId: string | null;
  storeId:      string | null;
};

export type AuthResponse = {
  accessToken: string;
  user:        AuthUser;
};

export type LoginPayload  = { email: string; password: string };

export type ForgotPasswordPayload = { email: string };
export type ResetPasswordPayload  = { token: string; password: string };

export const authApi = {
  login:   (p: LoginPayload) => apiFetch<AuthResponse>('/auth/login',   { method: 'POST', body: JSON.stringify(p) }),
  refresh: ()                => apiFetch<AuthResponse>('/auth/refresh', { method: 'POST' }),
  logout:  ()                => apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (p: ForgotPasswordPayload) =>
    apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(p) }),

  resetPassword: (p: ResetPasswordPayload) =>
    apiFetch<{ success: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(p) }),
};
