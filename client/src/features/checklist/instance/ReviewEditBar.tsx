import { Lock, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../../components';
import { describeAnswer, useReviewEdits } from './reviewEdits';

const DIVIDED = 'border-t border-border/60 pt-3';

export const ReviewEditBar = ({ locked, className = DIVIDED }: { locked: boolean; className?: string }) => {
  const { undoable, undo, saving } = useReviewEdits();

  if (locked) {
    return (
      <p className={cn('flex items-start gap-2 t-meta font-display text-text-muted', className)}>
        <Lock size={13} className="mt-px shrink-0" aria-hidden />
        This run is approved and locked. An admin can reopen it if an answer has to change.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <p className="min-w-0 flex-1 t-meta font-display text-text-muted">
        {undoable ? (
          `Changed "${undoable.label}". It was ${describeAnswer(undoable)} before.`
        ) : (
          <>
            You can set any answer here.
            <span className="hidden sm:inline"> Every change is saved straight away and kept in the audit log.</span>
          </>
        )}
      </p>
      {undoable && (
        <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={undo} disabled={saving}>
          <Undo2 size={13} aria-hidden />
          Undo
        </Button>
      )}
    </div>
  );
};
