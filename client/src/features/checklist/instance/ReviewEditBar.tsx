import { Lock, Undo2 } from 'lucide-react';
import { Button } from '../../../components';
import { describeAnswer, useReviewEdits } from './reviewEdits';

export const ReviewEditBar = ({ locked }: { locked: boolean }) => {
  const { undoable, undo, saving } = useReviewEdits();

  if (locked) {
    return (
      <p className="flex items-start gap-2 border-t border-border/60 pt-3 t-meta font-display text-text-muted">
        <Lock size={13} className="mt-px shrink-0" aria-hidden />
        This run is approved and locked. An admin can reopen it if an answer has to change.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <p className="t-meta font-display text-text-muted">
        {undoable
          ? `Changed "${undoable.label}". It was ${describeAnswer(undoable)} before.`
          : 'You can set any answer here. Every change is saved straight away and kept in the audit log.'}
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
