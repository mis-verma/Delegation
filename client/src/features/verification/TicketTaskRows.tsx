import { memo, useState, type ReactNode } from 'react';
import { Check, X, Loader2, Ticket as TicketIcon, CheckSquare, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { useVerifyTicketMutation } from '../tickets/hook';
import { useVerifyTaskMutation, useTaskQuery } from '../tasks/hook';
import { ChecklistCompletionPreview } from './ChecklistCompletionPreview';
import { summarizeChecklists } from './checklistSummary';
import { TicketDetail } from '../tickets/TicketDetail';
import { TaskDetail } from '../tasks/TaskDetail';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

// The ticket and delegation rows of the queue: approve, send back with a note, an inline checklist
// preview, and the real detail overlay on top of this page. Unchanged in behaviour; the rows are
// memoised now and the selection checkbox is driven by a flag plus one stable toggle.

/** Visually-hidden native checkbox + styled box, same pattern StoreMultiSelect.tsx uses. */
const SelectCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <label className="relative flex items-center justify-center size-11 sm:size-6 shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} aria-label={label} />
    <div
      className={cn(
        'flex items-center justify-center size-5 rounded-md border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/50',
        checked ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-border hover:border-primary-400',
      )}
    >
      <Check size={13} strokeWidth={3} className={cn('transition-all duration-150', checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50')} />
    </div>
  </label>
);

interface QueueRowProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onOpen: () => void;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
  isPending: boolean;
  /** Bulk-select checkbox, only inside a department's ticket/delegation list. */
  selection?: { checked: boolean; onToggle: () => void };
  /** Checklist completion (done/not-done, photo evidence), the thing a verifier needs to check
   *  before approving. Controlled by the parent: a delegation's checklist has to be fetched the
   *  first time it opens, keyed off the same flag. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Render-prop so the preview's per-item flag button can reach this row's correction note. */
  preview: (flagForCorrection: (label: string) => void) => ReactNode;
  /** Done / total / missing-photo rollup, shown as a badge before the row is expanded. */
  summary?: { total: number; done: number; missingPhotos: number };
}

const QueueRow = ({ icon, title, subtitle, onOpen, onApprove, onReject, isPending, selection, expanded, onToggleExpanded, preview, summary }: QueueRowProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // A flagged item opens the correction panel and drops a reference to itself into the note, so
  // the verifier does not retype what they just read. Flagging the same item twice adds it once.
  const flagForCorrection = (label: string) => {
    setRejecting(true);
    const line = `• ${label}: needs attention`;
    setNote((prev) => (prev.includes(line) ? prev : prev ? `${prev}\n${line}` : line));
  };

  const complete = summary && summary.total > 0 && summary.done === summary.total && summary.missingPhotos === 0;
  const attentionNeeded = summary && summary.total > 0 && (summary.done < summary.total || summary.missingPhotos > 0);

  return (
    <div className={cn(
      'group flex flex-col gap-4 p-3.5 sm:p-4 rounded-lg border transition-colors duration-150',
      selection?.checked ? 'border-primary-500 bg-primary-500/5' : 'border-border/60 bg-surface hover:border-border-hover',
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selection && <SelectCheckbox checked={selection.checked} onChange={selection.onToggle} label={`Select ${title}`} />}

          {/* Its own button, not the whole row, so a clickable row never wraps the action buttons
              and the note box. It opens the real ticket or delegation detail. */}
          <button
            type="button"
            onClick={onOpen}
            className="group/info flex items-start sm:items-center gap-3 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <span className="flex items-center justify-center text-primary-500 shrink-0">{icon}</span>
            <span className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-sm font-display font-medium text-text line-clamp-2 leading-snug group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">{title}</span>
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-display text-text-muted">{subtitle}</span>
                {summary && summary.total > 0 && (
                  <span className={cn(
                    'inline-flex items-center gap-1 shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded',
                    complete ? 'bg-success/10 text-success' : attentionNeeded ? 'bg-danger/10 text-danger' : 'bg-border/40 text-text-muted',
                  )}>
                    {attentionNeeded && <AlertTriangle size={10} strokeWidth={2.5} />}
                    {summary.done}/{summary.total} done
                    {summary.missingPhotos > 0 && ` · ${summary.missingPhotos} photo${summary.missingPhotos === 1 ? '' : 's'} missing`}
                  </span>
                )}
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={2.5} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 hidden sm:block" aria-hidden />
          </button>
        </div>

        {!rejecting && (
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 h-11 sm:h-9 px-2.5 rounded-lg text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ChevronDown size={14} strokeWidth={2.5} className={cn('transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Hide' : 'Checklist'}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              disabled={isPending}
              onClick={() => setRejecting(true)}
            >
              <X size={14} aria-hidden />
              Send back
            </Button>
            <Button
              size="sm"
              className="bg-success text-white hover:bg-success/90 hover:text-white"
              disabled={isPending}
              onClick={() => onApprove()}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
              Approve
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {preview(flagForCorrection)}
        </div>
      )}

      {rejecting && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="What needs fixing"
            placeholder="Say what needs fixing before this can be approved"
            rows={2}
            className="w-full px-3.5 py-2.5 text-sm font-display bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger/50 resize-none transition-colors placeholder:text-text-light"
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setRejecting(false); setNote(''); }}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" disabled={isPending || !note.trim()} onClick={() => onReject(note.trim())}>
              {isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Send back for changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

interface SelectableProps {
  selected?: boolean;
  /** One stable toggle for the whole list; the row passes its own id back. Omit to hide the checkbox. */
  onToggleSelect?: (id: string) => void;
}

export const TicketRow = memo(function TicketRow({ ticket, selected = false, onToggleSelect }: { ticket: Ticket } & SelectableProps) {
  const verifyMut = useVerifyTicketMutation();
  // The ticket list already returns full checklist/item/image data, so no extra fetch is needed.
  const [expanded, setExpanded] = useState(false);
  // TicketDetail opens as a side sheet over this page, so the department, filters and scroll
  // position behind it survive a look at one ticket.
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <QueueRow
        icon={<TicketIcon size={18} aria-hidden />}
        title={ticket.title}
        subtitle={ticket.assignee ? `Handled by ${ticket.assignee.firstName}` : 'Unassigned'}
        isPending={verifyMut.isPending}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(ticket.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        summary={summarizeChecklists(ticket.checklists)}
        preview={(flag) => <ChecklistCompletionPreview checklists={ticket.checklists} isLoading={false} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={(note) => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE', note } })}
        onReject={(note) => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } })}
      />
      {showDetail && <TicketDetail ticket={ticket} onClose={() => setShowDetail(false)} />}
    </>
  );
});

export const TaskRow = memo(function TaskRow({ task, selected = false, onToggleSelect }: { task: Task } & SelectableProps) {
  const verifyMut = useVerifyTaskMutation();
  // A delegation's LIST response never carries checklist data, only getById does. Fetched when the
  // row expands, so opening the queue does not fire a detail request per pending delegation.
  const [expanded, setExpanded] = useState(false);
  const { data: fullTask, isPending: isDetailPending } = useTaskQuery(task.id, expanded);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <QueueRow
        icon={<CheckSquare size={18} aria-hidden />}
        title={task.title}
        subtitle={task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'}
        isPending={verifyMut.isPending}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(task.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        // Once expanded, fullTask.checklists is the fresher source; until then the list endpoint's
        // batched rollup keeps the badge showing without waiting on the per-row fetch.
        summary={expanded && fullTask ? summarizeChecklists(fullTask.checklists) : task.checklistSummary}
        preview={(flag) => <ChecklistCompletionPreview checklists={fullTask?.checklists} isLoading={isDetailPending} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={(note) => verifyMut.mutate({ id: task.id, payload: { action: 'APPROVE', note } })}
        onReject={(note) => verifyMut.mutate({ id: task.id, payload: { action: 'REJECT', note } })}
      />
      {showDetail && <TaskDetail task={fullTask ?? task} onClose={() => setShowDetail(false)} />}
    </>
  );
});
