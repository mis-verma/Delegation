import { memo, useMemo } from 'react';
import { AlertTriangle, Camera, Check, CornerUpLeft, Flag, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { itemFlags, needsLookRank } from '../checklist/instance/reviewFlags';
import { answerText } from '../checklist/instance/answerText';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

const SHOWN = 4;

const shortAnswer = (item: ChecklistInstanceItem): string => {
  if (item.isNotApplicable) return 'N/A';
  if (!item.isDone && item.itemType !== 'AUDIT') return 'Not done';
  const text = answerText(item);
  if (!text) return 'Done';
  return text.replace(/^(Answered:?|Entered|Picked|Rated)\s+/, '');
};

interface Look { icon: LucideIcon; chip: string; text: string; row: string; title: string }

const dotFor = (item: ChecklistInstanceItem): Look => {
  const f = itemFlags(item);
  if (f.criticalFailed) return { icon: Flag, chip: 'bg-danger/15 text-danger', text: 'text-danger', row: 'border-danger/40 bg-danger/5', title: 'Critical answer failed' };
  if (f.bad) return { icon: AlertTriangle, chip: 'bg-warning/15 text-warning', text: 'text-warning', row: 'border-warning/40 bg-warning/5', title: 'Wrong answer' };
  if (f.missingPhotos) return { icon: Camera, chip: 'bg-danger/15 text-danger', text: 'text-danger', row: 'border-danger/40 bg-danger/5', title: 'Photos missing' };
  if (f.sentBack) return { icon: CornerUpLeft, chip: 'bg-coral-500/15 text-coral-600 dark:text-coral-300', text: 'text-coral-600 dark:text-coral-300', row: 'border-coral-500/30', title: 'Sent back before' };
  if (item.isNotApplicable) return { icon: Minus, chip: 'bg-border/60 text-text-muted', text: 'text-text-muted', row: 'border-border/50', title: 'Not applicable' };
  if (!item.isDone) return { icon: Minus, chip: 'bg-border/60 text-text-muted', text: 'text-text-muted', row: 'border-border/50', title: 'Not done' };
  return { icon: Check, chip: 'bg-success/15 text-success', text: 'text-text-secondary', row: 'border-border/50', title: 'Answered' };
};

interface QuestionPreviewProps {
  items: ChecklistInstanceItem[];
  onOpen: () => void;
}

export const QuestionPreview = memo(function QuestionPreview({ items, onOpen }: QuestionPreviewProps) {
  const { shown, rest, answered, total, photosHave, photosNeeded } = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const fa = itemFlags(a);
      const fb = itemFlags(b);
      const ra = fa.needsLook ? needsLookRank(fa) : 9;
      const rb = fb.needsLook ? needsLookRank(fb) : 9;
      return ra - rb || a.order - b.order;
    });
    const needPhotos = items.filter((i) => !i.isNotApplicable && i.requiredImageCount > 0);
    return {
      shown: sorted.slice(0, SHOWN),
      rest: Math.max(0, sorted.length - SHOWN),
      answered: items.filter((i) => i.isDone || i.isNotApplicable).length,
      total: items.length,
      photosHave: needPhotos.filter((i) => i.images.length >= i.requiredImageCount).length,
      photosNeeded: needPhotos.length,
    };
  }, [items]);

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-surface-hover/30 p-2.5">
      <p className="flex flex-wrap items-center gap-x-2 t-meta font-display font-semibold text-text-muted">
        <span className="tabular-nums">{answered} of {total} answered</span>
        {photosNeeded > 0 && (
          <span className={cn('inline-flex items-center gap-1 tabular-nums', photosHave < photosNeeded && 'text-danger')}>
            <Camera className="size-3" aria-hidden="true" />
            Photos {photosHave} of {photosNeeded}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-1.5">
        {shown.map((item) => {
          const look = dotFor(item);
          const Icon = look.icon;
          const flagged = look.title !== 'Answered' && look.title !== 'Not applicable' && look.title !== 'Not done';
          return (
            <li key={item.id} className={cn('flex min-w-0 items-start gap-2.5 rounded-lg border p-2', look.row)}>
              <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', look.chip)} aria-hidden="true">
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-meta font-display font-semibold text-text leading-snug line-clamp-2">{item.label}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display">
                  <span className={cn('font-semibold', look.text)}>{shortAnswer(item)}</span>
                  {flagged && <span className={cn('font-medium', look.text)}>· {look.title}</span>}
                  {item.images.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-text-muted tabular-nums" aria-label={`${item.images.length} photos`}>
                      <Camera className="size-3" aria-hidden="true" />
                      {item.images.length}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <button type="button" onClick={onOpen} className="self-start t-meta font-display font-semibold text-primary-600 hover:underline dark:text-primary-300 cursor-pointer">
          +{rest} more {rest === 1 ? 'question' : 'questions'}, open to review
        </button>
      )}
    </div>
  );
});
