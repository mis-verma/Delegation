import { apiFetch } from './http';

export type Role = 'ADMIN' | 'APPROVAL_MANAGER' | 'SENIOR' | 'MANAGER' | 'AGENT' | 'USER' | 'PC' | 'OWNER';

export const ADMIN_AREA_ROLES: readonly Role[] = ['ADMIN', 'PC'];

export const OWNER_HOME = '/admin/owner';

const OWNER_EXACT_PATHS = ['/admin', OWNER_HOME];
const OWNER_PATH_PREFIXES = ['/admin/scores', '/team/fill', '/settings', '/get-app'];

export const ownerMayVisit = (pathname: string): boolean => {
  const path = pathname.replace(/\/+$/, '') || '/';
  return OWNER_EXACT_PATHS.includes(path) || OWNER_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
};

export const PC_HOME = '/pc';

export const homeFor = (role: Role): string => (role === 'OWNER' ? OWNER_HOME : role === 'PC' ? PC_HOME : ADMIN_AREA_ROLES.includes(role) ? '/admin' : '/');

export const OWN_SCOPE_ROLES: readonly Role[] = ['AGENT', 'USER'];

export type AuthUser = {
  id:           string;
  email:        string;
  role:         Role;
  firstName:    string | null;
  departmentId: string | null;
  storeId:      string | null;
  mustChangePassword?: boolean;
};

export type AuthResponse = {
  accessToken: string;
  user:        AuthUser;
};

export type LoginPayload  = { email: string; password: string; deviceToken?: string };

export type LoginCodeRequired = { codeRequired: true; challenge: string; emailHint: string };
export type LoginResult = AuthResponse | LoginCodeRequired;
export type LoginCodeResponse = AuthResponse & { deviceToken?: string };

export type ForgotPasswordPayload = { email: string };
export type ResetPasswordPayload  = { token: string; password: string };
export type ResetPasswordCodePayload = { email: string; code: string; password: string };

export const authApi = {
  login:   (p: LoginPayload) => apiFetch<LoginResult>('/auth/login',   { method: 'POST', body: JSON.stringify(p) }),
  verifyLoginCode: (p: { challenge: string; code: string; rememberDevice: boolean }) =>
    apiFetch<LoginCodeResponse>('/auth/login/verify', { method: 'POST', body: JSON.stringify(p) }),
  resendLoginCode: (p: { challenge: string }) =>
    apiFetch<{ success: boolean }>('/auth/login/resend', { method: 'POST', body: JSON.stringify(p) }),
  refresh: ()                => apiFetch<AuthResponse>('/auth/refresh', { method: 'POST' }),
  logout:  ()                => apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (p: ForgotPasswordPayload) =>
    apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(p) }),

  resetPasswordWithCode: (p: ResetPasswordCodePayload) =>
    apiFetch<{ success: boolean }>('/auth/reset-password-code', { method: 'POST', body: JSON.stringify(p) }),
  resetPassword: (p: ResetPasswordPayload) =>
    apiFetch<{ success: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(p) }),
};
