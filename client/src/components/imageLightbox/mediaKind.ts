export type MediaKind = 'image' | 'video' | 'pdf' | 'file';

export interface LightboxItem {
  src: string;
  kind: 'image' | 'video' | 'pdf';
  name?: string | null;
}

export const mediaKindFromMime = (mimeType: string | null | undefined): MediaKind => {
  if (!mimeType) return 'image';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
};

export const mediaKindFromSrc = (src: string): LightboxItem['kind'] => {
  const path = src.split(/[?#]/)[0]!.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'video';
  if (path.endsWith('.pdf')) return 'pdf';
  return 'image';
};

export const isViewableKind = (kind: MediaKind): kind is LightboxItem['kind'] => kind !== 'file';
