import type { LucideIcon } from 'lucide-react';
import { Button } from '../button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: 'neutral' | 'success';
  action?: EmptyStateAction;
  size?: 'default' | 'compact';
  className?: string;
}

const TONE_TILE_CLASS = {
  neutral: 'bg-surface border-border text-text-muted',
  success: 'bg-success/10 border-success/25 text-success',
} as const;

const TONE_COMPACT_ICON_CLASS = {
  neutral: 'text-text-muted/60',
  success: 'text-success',
} as const;

export const EmptyState = ({ icon: Icon, title, description, tone = 'neutral', action, size = 'default', className = '' }: EmptyStateProps) => {
  if (size === 'compact') {
    return (
      <div className={`flex flex-col items-center justify-center gap-1.5 min-h-28 px-4 py-4 text-center border border-border rounded-xl bg-surface/30 ${className}`}>
        <Icon size={16} className={TONE_COMPACT_ICON_CLASS[tone]} strokeWidth={1.75} />
        <p className="t-meta font-display font-medium text-text-muted">{title}</p>
        {description && <p className="t-meta font-display text-text-light">{description}</p>}
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick} className="min-h-11 sm:min-h-0 rounded-full font-medium">
            {action.icon && <action.icon size={13} />}
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center bg-surface/30 rounded-2xl border border-border/80 ${className}`}>
      <div className={`flex items-center justify-center mb-4 size-14 rounded-full border ${TONE_TILE_CLASS[tone]}`}>
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-display font-bold text-text tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm font-display text-text-muted mt-2 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className="mt-5 rounded-full font-medium">
          {action.icon && <action.icon size={13} />}
          {action.label}
        </Button>
      )}
    </div>
  );
};
