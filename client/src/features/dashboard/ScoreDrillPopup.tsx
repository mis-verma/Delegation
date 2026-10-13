import { CheckCheck, ChevronRight, Clock, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { cn } from '@/lib/utils';
import { rateToneClass } from '../checklist/checklistDisplay';
import { SERIES_LABEL, type ModuleKey, type SeriesKey } from './scoreMetrics';
import { complianceLabel } from '../../lib/scoreLabels';
import { HowCalculated } from '../scores/HowCalculated';
import { formatPct } from '../../lib/percent';

interface ScoreDrillPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Which module the figures are for: names the second measure right (Answers right, or Met deadline) and says how each is calculated. */
  module: ModuleKey;
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
      'group flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40',
      'border-border bg-surface hover:border-border-hover',
    )}
  >
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg', primary ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-secondary')}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block t-card font-display font-semibold text-text">{label}</span>
      <span className="block t-meta text-text-muted">{hint}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />
  </button>
);

/**
 * What a tapped score is made of, in a small popup: the three figures with the counts behind them, and one
 * tap to the finished items or the late ones. It replaces jumping straight to the late list, which hid the
 * score you had tapped and gave no way to see what was done.
 */
export const ScoreDrillPopup = ({ open, onOpenChange, title, module, windowLabel, subject, figures, completedHref, lateHref, onGo }: ScoreDrillPopupProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/* px/pt only on a phone: a plain p-5 overrode the sheet's safe-area bottom padding and sat the
        buttons on the iPhone home bar. Our own close button, 44px on touch (the built-in one is 40px). */}
    <DialogContent showCloseButton={false} className="sm:max-w-sm gap-4 px-5 pt-5 sm:p-6">
      <DialogClose
        aria-label="Close"
        className="absolute top-3 right-3 z-10 flex size-10 pointer-coarse:size-11 items-center justify-center rounded-full text-text-muted outline-none transition-colors hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <X size={18} strokeWidth={2.5} aria-hidden="true" />
      </DialogClose>
      <div className="flex flex-col gap-0.5 pr-12">
        <DialogTitle className="t-section font-display font-bold text-text">{title}</DialogTitle>
        <DialogDescription className="t-meta text-text-muted">{subject ? `${subject}, ${windowLabel}` : windowLabel}</DialogDescription>
      </div>

      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
        {figures.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-0.5 t-card font-display font-semibold text-text">
                {f.key === 'compliance' ? complianceLabel(module) : SERIES_LABEL[f.key]}
                <HowCalculated figure={f.key === 'ontime' ? 'onTime' : f.key} module={module} />
              </span>
              <span className="block t-meta text-text-muted">{f.note}</span>
            </span>
            <span className={cn('t-figure font-display font-bold tabular-nums', f.value === null ? 'text-text-light' : rateToneClass(f.value))}>
              {formatPct(f.value)}
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
