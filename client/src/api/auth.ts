import { apiFetch } from './http';

export type Role = 'ADMIN' | 'APPROVAL_MANAGER' | 'SENIOR' | 'MANAGER' | 'AGENT' | 'USER' | 'PC';

// Which roles land in the /admin section at all — shared by both the post-login redirect
// (features/auth/hooks.ts) and the AdminRoute/PCRoute route guards (App.tsx) so they can't
// silently drift apart (a role added to one set without the other used to mean either a login
// that "succeeds" but immediately bounces back out of /admin, or a role that's guard-eligible but
// never actually routed there on login).
export const ADMIN_AREA_ROLES: readonly Role[] = ['ADMIN', 'PC'];

// Front-line roles whose tickets, delegations and checklists are strictly their own on the server
// (raised by / assigned to them — see ticket.service.ts's visibilityFilter and task.service.ts's
// buildVisibilityCondition). Filtering a list that only ever holds your own work by someone else,
// or by a department, has nothing to act on — and those pickers list colleagues' names — so the
// Options sheets leave the people/department sections out for these roles.
export const OWN_SCOPE_ROLES: readonly Role[] = ['AGENT', 'USER'];

export type AuthUser = {
  id:           string;
  email:        string;
  role:         Role;
  firstName:    string | null;
  departmentId: string | null;
  storeId:      string | null;
  /** An admin set this password: the app asks for a new one before anything else. */
  mustChangePassword?: boolean;
};

export type AuthResponse = {
  accessToken: string;
  user:        AuthUser;
};

export type LoginPayload  = { email: string; password: string };

export type ForgotPasswordPayload = { email: string };
export type ResetPasswordPayload  = { token: string; password: string };
export type ResetPasswordCodePayload = { email: string; code: string; password: string };

export const authApi = {
  login:   (p: LoginPayload) => apiFetch<AuthResponse>('/auth/login',   { method: 'POST', body: JSON.stringify(p) }),
  refresh: ()                => apiFetch<AuthResponse>('/auth/refresh', { method: 'POST' }),
  logout:  ()                => apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (p: ForgotPasswordPayload) =>
    apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(p) }),

  resetPasswordWithCode: (p: ResetPasswordCodePayload) =>
    apiFetch<{ success: boolean }>('/auth/reset-password-code', { method: 'POST', body: JSON.stringify(p) }),
  resetPassword: (p: ResetPasswordPayload) =>
    apiFetch<{ success: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(p) }),
};
