const AVATAR_PALETTE = [
  'bg-primary-600',
  'bg-coral-600',
  'bg-success',
  'bg-warning',
  'bg-danger',
  'bg-status-verify',
];

export const avatarColorClass = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};
