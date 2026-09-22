export const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

// Avatar URLs from the API are relative paths (e.g. "/uploads/avatars/<hex>.jpg").
export const resolveAvatarUrl = (avatarUrl: string | null | undefined) =>
  avatarUrl ? `${UPLOADS_BASE}${avatarUrl}` : null;

// Same shape as resolveAvatarUrl, for the org's uploaded logo (e.g. "/uploads/logos/<hex>.png").
export const resolveLogoUrl = (logoUrl: string | null | undefined) =>
  logoUrl ? `${UPLOADS_BASE}${logoUrl}` : null;
