import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Modal } from '../../../components';
import { cn } from '@/lib/utils';
import { TicketPriorityChipPicker } from '../../tickets/form/TicketPriorityChipPicker';
import type { TicketPriority } from '../../tickets/form/formConstants';
import { useRaiseChecklistTicketMutation } from '../hook';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

const MIN_NOTE = 5;

const PRIORITY_WORD: Record<TicketPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };

const TAT_OPTIONS = [
  { hours: 4, label: '4 hours' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
] as const;

const LABEL_CLASS = 'flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary';

type Item = Pick<ChecklistInstanceItem, 'id' | 'instanceId' | 'label' | 'isDone' | 'isNotApplicable' | 'completedByName' | 'reviewTicketId'>;

export const RaiseTicketAction = ({ item, canRaise }: { item: Item; canRaise: boolean }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [tatHours, setTatHours] = useState<number>(24);
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const raise = useRaiseChecklistTicketMutation();
  const trimmed = note.trim();

  if (item.reviewTicketId) {
    return (
      <Link
        to={`/tickets?open=${item.reviewTicketId}`}
        className="inline-flex min-h-11 items-center rounded-full px-3 t-meta font-display font-semibold text-primary-700 transition-colors duration-150 outline-none hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300 sm:min-h-8"
      >
        Open ticket
      </Link>
    );
  }

  if (!canRaise || !item.isDone || item.isNotApplicable) return null;

  const close = () => {
    if (raise.isPending) return;
    setOpen(false);
    setNote('');
  };
  const submit = () => {
    if (trimmed.length < MIN_NOTE) return;
    raise.mutate(
      { id: item.instanceId, itemId: item.id, note: trimmed, tatHours, priority },
      { onSuccess: () => { setOpen(false); setNote(''); } },
    );
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="pointer-coarse:min-h-11">
        Raise ticket
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="md"
        title="Raise a ticket"
        description="This question counts as a failed check."
        footer={
          <div className="flex w-full flex-col gap-2">
            <p className="t-meta font-display text-text-secondary">
              {`${PRIORITY_WORD[priority]} priority ticket for ${item.completedByName ?? 'the person who answered it'}, to fix within ${TAT_OPTIONS.find((o) => o.hours === tatHours)?.label ?? `${tatHours} hours`}.`}
            </p>
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={raise.isPending}>Cancel</Button>
              <Button onClick={submit} isLoading={raise.isPending} disabled={trimmed.length < MIN_NOTE}>
                Raise ticket
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-surface-hover/50 px-3 py-2">
            <p className="t-card font-display font-semibold text-text">{item.label}</p>
            <p className="t-meta font-display text-text-muted">To {item.completedByName ?? 'the person who answered it'}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`raise-note-${item.id}`} className={LABEL_CLASS}>What to fix</label>
            <textarea
              id={`raise-note-${item.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="For example: the counter was not cleaned. Clean it and add a new photo."
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
            />
            <p className="t-meta text-text-muted">{trimmed.length < MIN_NOTE ? `At least ${MIN_NOTE} characters.` : `${trimmed.length} of 2000`}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS}>Fix within</span>
            <div role="radiogroup" aria-label="Fix within" className="flex flex-wrap gap-1.5">
              {TAT_OPTIONS.map((o) => {
                const on = o.hours === tatHours;
                return (
                  <button
                    key={o.hours}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTatHours(o.hours)}
                    className={cn(
                      'h-9 pointer-coarse:h-10 px-3 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]',
                      on ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS}>Priority</span>
            <TicketPriorityChipPicker value={priority} onChange={setPriority} />
          </div>
        </div>
      </Modal>
    </>
  );
};
