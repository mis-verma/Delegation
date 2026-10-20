import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<Tone, string> = {
  info: 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:text-primary-300',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  neutral: 'border-border/60 bg-surface-hover/60 text-text-secondary',
};

interface NoticeBannerProps {
  tone?: Tone;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}

export const NoticeBanner = ({ tone = 'info', icon: Icon, children, className }: NoticeBannerProps) => (
  <div role="status" className={cn('flex items-start gap-2.5 p-3.5 rounded-lg border t-meta font-display leading-relaxed', TONE[tone], className)}>
    <Icon size={16} className="shrink-0 mt-px" aria-hidden />
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);
