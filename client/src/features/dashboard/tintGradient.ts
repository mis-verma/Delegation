const TINT_GRADIENT: Record<string, string> = {
  primary: 'from-primary-500 to-primary-700',
  coral: 'from-coral-500 to-coral-600',
  success: 'from-success to-success-strong',
  warning: 'from-warning to-warning/70',
  danger: 'from-danger to-danger/70',
};

export const tintGradient = (iconTint?: string) => {
  const key = iconTint ? Object.keys(TINT_GRADIENT).find((k) => iconTint.includes(k)) : undefined;
  return TINT_GRADIENT[key ?? 'primary'];
};
