import { CheckCheck, ChevronRight, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { cn } from '@/lib/utils';
import { rateToneClass } from '../checklist/checklistDisplay';
import { SERIES_LABEL, type SeriesKey } from './scoreMetrics';

interface ScoreDrillPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** "Oct 1 to Oct 9", "This month": the window the figures are for. */
  windowLabel: string;
  /** Whose scores these are, when it is not the signed-in person. */
  subject?: string;
  figures: { key: SeriesKey; value: number | null; note: string }[];
  /** Where the finished items live. Left out where the list cannot be narrowed to this subject. */
  completedHref: string | null;
  /** Where the late items live. */
  lateHref: string | null;
  onGo: (href: string) => void;
}

const GoButton = ({ icon: Icon, label, hint, primary, onClick }: { icon: typeof Clock; label: string; hint: string; primary?: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'group flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40',
      primary ? 'border-primary-500/40 bg-primary-500/10 hover:bg-primary-500/15' : 'border-border bg-surface hover:border-border-hover hover:bg-surface-hover/50',
    )}
  >
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg', primary ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-secondary')}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-display font-semibold text-text">{label}</span>
      <span className="block t-meta text-text-muted">{hint}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
  </button>
);

/**
 * What a tapped score is made of, in a small popup: the three figures with the counts behind them, and one
 * tap to the finished items or the late ones. It replaces jumping straight to the late list, which hid the
 * score you had tapped and gave no way to see what was done.
 */
export const ScoreDrillPopup = ({ open, onOpenChange, title, windowLabel, subject, figures, completedHref, lateHref, onGo }: ScoreDrillPopupProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-sm gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-0.5 pr-10">
        <DialogTitle className="text-lg font-display font-bold text-text">{title}</DialogTitle>
        <DialogDescription className="t-meta text-text-muted">{subject ? `${subject}, ${windowLabel}` : windowLabel}</DialogDescription>
      </div>

      <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60 bg-surface-hover/30">
        {figures.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-display font-semibold text-text">{SERIES_LABEL[f.key]}</span>
              <span className="block t-meta text-text-muted">{f.note}</span>
            </span>
            <span className={cn('text-lg font-display font-bold tabular-nums', f.value === null ? 'text-text-light' : rateToneClass(f.value))}>
              {f.value === null ? '-' : `${f.value}%`}
            </span>
          </li>
        ))}
      </ul>

      {(completedHref || lateHref) && (
        <div className="flex flex-col gap-2">
          {completedHref && <GoButton primary icon={CheckCheck} label="See completed" hint="What was finished" onClick={() => onGo(completedHref)} />}
          {lateHref && <GoButton icon={Clock} label="See late items" hint="What is overdue or still open" onClick={() => onGo(lateHref)} />}
        </div>
      )}
    </DialogContent>
  </Dialog>
);
