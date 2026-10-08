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
  /** Omit for the compact variant's single-line form. */
  description?: string;
  /** 'success' is the "queue actually cleared" read (Verification Queue, checklist approvals) —
   *  everything else (nothing here yet, nothing matched a filter) stays neutral. */
  tone?: 'neutral' | 'success';
  /** Only ever shown on the default size — a compact board-column slot has no room for it, and
   *  showing a "clear filters" action mid-board would fight the column header's own filter bar. */
  action?: EmptyStateAction;
  /** 'default' is the full page-level treatment (icon tile, bold title, generous padding) used
   *  wherever an empty state is the main thing on screen. 'compact' is the single-line form for
   *  tight spaces — a board column, a filtered-out table. */
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

/**
 * One shared "nothing to show" pattern for every list/board/queue in the app — before this,
 * Delegations, Tickets, Checklists, and the Verification Queue each hand-rolled their own (three
 * different icon treatments, three different title/copy weights, padding anywhere from py-7 to
 * py-24), so the exact same "empty" moment read as a different app depending which page you were
 * on. Icon and copy stay caller-supplied — only the wrapper, sizing, and typography are fixed.
 */
export const EmptyState = ({ icon: Icon, title, description, tone = 'neutral', action, size = 'default', className = '' }: EmptyStateProps) => {
  if (size === 'compact') {
    return (
      <div className={`flex flex-col items-center justify-center gap-1.5 h-28 px-4 text-center border-2 border-dashed border-border/40 rounded-xl bg-surface/30 ${className}`}>
        <Icon size={16} className={TONE_COMPACT_ICON_CLASS[tone]} strokeWidth={1.75} />
        <p className="text-xs font-display font-medium text-text-muted">{title}</p>
        {description && <p className="text-[0.6875rem] font-display text-text-light">{description}</p>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center bg-surface/30 rounded-2xl border border-dashed border-border/80 ${className}`}>
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
