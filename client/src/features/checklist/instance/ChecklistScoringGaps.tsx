import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, CircleHelp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip, PANEL_CLASS } from '../../../components';
import { useChecklistScoringGapsQuery } from '../hook';
import { RECURRENCE_LABEL } from '../checklistDisplay';

// Answer compliance only counts questions that have a good answer set. This lists the live
// checklists that still have questions without one, so an admin knows exactly where to go to fix
// the "No data" on the tile below. Renders nothing when there is nothing to fix (or while loading,
// and on a failed load: this is a hint, never a blocker).
export const ChecklistScoringGaps = () => {
  const { data: gaps } = useChecklistScoringGapsQuery();
  const [open, setOpen] = useState(false);
  if (!gaps?.length) return null;

  const questionCount = gaps.reduce((sum, g) => sum + g.unscored, 0);

  return (
    <section aria-label="Questions without a good answer" className={cn(PANEL_CLASS, 'flex flex-col')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="scoring-gaps-list"
        className="flex items-center gap-3 p-4 sm:p-5 text-left rounded-xl cursor-pointer outline-none transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className="flex items-center justify-center size-9 rounded-xl bg-warning/10 text-warning shrink-0">
          <Target size={17} aria-hidden />
        </span>
        <span className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-sm font-display font-bold text-text">
            {questionCount} {questionCount === 1 ? 'question has' : 'questions have'} no good answer set
          </span>
          <span className="text-xs font-display text-text-muted leading-relaxed">
            Across {gaps.length} {gaps.length === 1 ? 'checklist' : 'checklists'}. Answer compliance cannot count them until you set the right answer.
          </span>
        </span>
        <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>

      {open && (
        <ul id="scoring-gaps-list" className="flex flex-col divide-y divide-border/50 border-t border-border/60">
          {gaps.map((g) => (
            <li key={g.id}>
              <Link
                to={`/admin/scheduled-checklists/builder/${g.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 min-h-14 outline-none transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
              >
                <span className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{g.name}</span>
                  <span className="text-xs font-display text-text-muted line-clamp-2 leading-relaxed">
                    {g.labels.join(', ')}{g.unscored > g.labels.length ? ` and ${g.unscored - g.labels.length} more` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-display text-text-muted">{RECURRENCE_LABEL[g.recurrence]}</span>
                  <IconChip icon={CircleHelp} tone="bg-warning" label={`${g.unscored} of ${g.scorable} unset`} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
