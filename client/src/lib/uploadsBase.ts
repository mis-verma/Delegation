export const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export const resolveAvatarUrl = (avatarUrl: string | null | undefined) =>
  avatarUrl ? `${UPLOADS_BASE}${avatarUrl}` : null;

export const resolveLogoUrl = (logoUrl: string | null | undefined) =>
  logoUrl ? `${UPLOADS_BASE}${logoUrl}` : null;
