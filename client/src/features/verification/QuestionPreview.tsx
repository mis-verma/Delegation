import { memo, useMemo } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { itemFlags, needsLookRank } from '../checklist/instance/reviewFlags';
import { answerText } from '../checklist/instance/answerText';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

const SHOWN = 4;

// The answer in as few words as fit on the right of a row: "Yes", "4 of 5", "₹ 1200", "Done", "N/A", "Not done".
const shortAnswer = (item: ChecklistInstanceItem): string => {
  if (item.isNotApplicable) return 'N/A';
  if (!item.isDone && item.itemType !== 'AUDIT') return 'Not done';
  const text = answerText(item);
  if (!text) return 'Done';
  return text.replace(/^(Answered:?|Entered|Picked|Rated)\s+/, '');
};

/** What each dot means, worst first. */
const dotFor = (item: ChecklistInstanceItem): { dot: string; text: string; title: string } => {
  const f = itemFlags(item);
  if (f.criticalFailed) return { dot: 'bg-danger', text: 'text-danger', title: 'Critical question, not an acceptable answer' };
  if (f.bad) return { dot: 'bg-warning', text: 'text-warning', title: 'Not an acceptable answer' };
  if (f.missingPhotos) return { dot: 'bg-danger', text: 'text-danger', title: 'Photos missing' };
  if (f.sentBack) return { dot: 'bg-coral-500', text: 'text-coral-600 dark:text-coral-300', title: 'Sent back before' };
  if (item.isNotApplicable) return { dot: 'bg-border-hover', text: 'text-text-muted', title: 'Not applicable' };
  if (!item.isDone) return { dot: 'bg-border-hover', text: 'text-text-muted', title: 'Not done' };
  return { dot: 'bg-success', text: 'text-text-secondary', title: 'Answered' };
};

interface QuestionPreviewProps {
  items: ChecklistInstanceItem[];
  /** Opens the full review (the same as tapping the title). */
  onOpen: () => void;
}

/**
 * The run's questions right on its queue row, so a reviewer sees what was answered without opening it: a count line
 * ("8 of 10 answered · photos 2 of 3"), then the first few questions with their answers, the ones that need a look
 * first, each with a coloured dot (red critical or missing photo, orange bad answer, violet sent back, green fine).
 */
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
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-hover/30 px-2.5 py-2">
      <p className="flex flex-wrap items-center gap-x-2 t-meta font-display font-semibold text-text-muted">
        <span className="tabular-nums">{answered} of {total} answered</span>
        {photosNeeded > 0 && (
          <span className={cn('inline-flex items-center gap-1 tabular-nums', photosHave < photosNeeded && 'text-danger')}>
            <Camera className="size-3" aria-hidden="true" />
            Photos {photosHave} of {photosNeeded}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-1">
        {shown.map((item) => {
          const look = dotFor(item);
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-2" title={look.title}>
              <span className={cn('size-1.5 shrink-0 rounded-full', look.dot)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate t-meta text-text">{item.label}</span>
              {item.images.length > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 t-meta text-text-light tabular-nums" aria-label={`${item.images.length} photos`}>
                  <Camera className="size-3" aria-hidden="true" />
                  {item.images.length}
                </span>
              )}
              <span className={cn('max-w-[40%] shrink-0 truncate t-meta font-display font-semibold', look.text)}>{shortAnswer(item)}</span>
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
