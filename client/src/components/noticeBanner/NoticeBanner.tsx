import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface ToneLook {
  frame: string;
  iconBox: string;
}

// A long sentence set entirely in the tone colour reads worse than body text; the colour lives
// on the icon badge and the border/background tint, the words stay in the normal reading colour.
const TONE: Record<Tone, ToneLook> = {
  info: { frame: 'border-primary-500/20 bg-primary-500/8', iconBox: 'bg-primary-500/15 text-primary-700 dark:text-primary-300' },
  success: { frame: 'border-success/20 bg-success/8', iconBox: 'bg-success/15 text-success' },
  warning: { frame: 'border-warning/20 bg-warning/8', iconBox: 'bg-warning/15 text-warning' },
  danger: { frame: 'border-danger/20 bg-danger/8', iconBox: 'bg-danger/15 text-danger' },
  neutral: { frame: 'border-border/60 bg-surface-hover/60', iconBox: 'bg-surface-active text-text-muted' },
};

interface NoticeBannerProps {
  tone?: Tone;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}

export const NoticeBanner = ({ tone = 'info', icon: Icon, children, className }: NoticeBannerProps) => {
  const look = TONE[tone];
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-2xl border p-3.5 sm:p-4 t-meta font-display leading-relaxed text-text', look.frame, className)}>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', look.iconBox)} aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </div>
  );
};
