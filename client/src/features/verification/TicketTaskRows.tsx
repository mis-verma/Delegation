import { memo, useState, type ReactNode } from 'react';
import { Check, X, Ticket as TicketIcon, CheckSquare, ChevronRight, ChevronDown, AlertTriangle, Clock, Paperclip, Film, UserRound } from 'lucide-react';
import { Button, IconChip, PriorityChip, DepartmentChip } from '../../components';
import { SendBackForm } from '../checklist/instance/ReviewActions';
import { cn } from '@/lib/utils';
import { UPLOADS_BASE } from '../../lib/uploadsBase';
import { useTaskQuery } from '../tasks/hook';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { ChecklistCompletionPreview } from './ChecklistCompletionPreview';
import { summarizeChecklists } from './checklistSummary';
import { formatWaiting } from './verificationModel';
import { TicketDetail } from '../tickets/TicketDetail';
import { TaskDetail } from '../tasks/TaskDetail';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

// The ticket and delegation rows of the queue. Each row now carries what a reviewer needs to decide
// without opening it: who raised it, its priority and department, how long it has waited against the
// 24 hour promise, the note it was handed in with, and a strip of the photos attached. Approve and
// Send back go through the page's Undo window (see useDeferredDecisions) instead of firing at once.

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

/** One attached file, reduced to what a thumbnail needs. */
export interface EvidenceFile {
  id: string;
  url: string;
  mimeType: string;
  name: string | null;
}

const HOUR_MS = 3_600_000;

// Against the 24 hour promise: quiet under 12 hours, amber from 12, red past 24.
const waitingLook = (sinceMs: number, now: number) => {
  const hours = (now - sinceMs) / HOUR_MS;
  if (hours >= 24) return { tone: 'bg-danger', text: 'text-danger', suffix: ' · over 24h' };
  if (hours >= 12) return { tone: 'bg-warning', text: 'text-warning', suffix: '' };
  return { tone: 'bg-text-muted', text: undefined, suffix: '' };
};

const MAX_THUMBS = 3;

const EvidenceStrip = ({ files }: { files: EvidenceFile[] }) => {
  if (files.length === 0) return null;
  const shown = files.slice(0, MAX_THUMBS);
  const extra = files.length - shown.length;
  return (
    <div className="flex items-center gap-2 flex-wrap" aria-label={`${files.length} ${files.length === 1 ? 'file' : 'files'} attached`}>
      {shown.map((file) => {
        const src = `${UPLOADS_BASE}${file.url}`;
        const isImage = file.mimeType.startsWith('image/');
        return (
          <a
            key={file.id}
            href={src}
            target="_blank"
            rel="noreferrer"
            title={file.name ?? 'Open attachment'}
            className="flex items-center justify-center size-14 rounded-lg overflow-hidden border border-border/70 bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {isImage ? <img src={src} alt={file.name ?? 'Attachment'} loading="lazy" className="size-full object-cover" /> : <Film size={20} className="text-text-muted" aria-hidden />}
          </a>
        );
      })}
      {extra > 0 && <span className="text-xs font-display font-semibold text-text-muted tabular-nums">+{extra} more</span>}
    </div>
  );
};

interface QueueRowProps {
  icon: ReactNode;
  title: string;
  /** Plain-text facts under the title, e.g. "Raised by Asha · Handled by Ravi". */
  facts: string;
  /** Chips: priority and department, then how long it has waited. */
  chips: ReactNode;
  /** The remark the person handed it in with, if there is one. */
  note: string | null;
  evidence: EvidenceFile[];
  onOpen: () => void;
  onApprove: () => void;
  onSendBack: (note: string) => void;
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
  /** Called when the pointer or focus first lands on the row, so slow data can be fetched early. */
  onWarm?: () => void;
}

const QueueRow = ({ icon, title, facts, chips, note, evidence, onOpen, onApprove, onSendBack, selection, expanded, onToggleExpanded, preview, summary, onWarm }: QueueRowProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [text, setText] = useState('');

  // A flagged item opens the correction panel and drops a reference to itself into the note, so
  // the verifier does not retype what they just read. Flagging the same item twice adds it once.
  const flagForCorrection = (label: string) => {
    setRejecting(true);
    const line = `• ${label}: needs attention`;
    setText((prev) => (prev.includes(line) ? prev : prev ? `${prev}\n${line}` : line));
  };

  const complete = summary && summary.total > 0 && summary.done === summary.total && summary.missingPhotos === 0;
  const attentionNeeded = summary && summary.total > 0 && (summary.done < summary.total || summary.missingPhotos > 0);

  return (
    <div
      onPointerEnter={onWarm}
      onFocus={onWarm}
      className={cn(
        'group flex flex-col gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-colors duration-150',
        selection?.checked ? 'border-primary-500 bg-primary-500/5' : 'border-border/60 bg-surface hover:border-border-hover',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selection && <SelectCheckbox checked={selection.checked} onChange={selection.onToggle} label={`Select ${title}`} />}

          {/* Its own button, not the whole row, so a clickable row never wraps the action buttons
              and the note box. It opens the real ticket or delegation detail. */}
          <button
            type="button"
            onClick={onOpen}
            className="group/info flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <span className="flex items-center justify-center size-9 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300 shrink-0">{icon}</span>
            <span className="flex flex-col gap-1.5 flex-1 min-w-0">
              <span className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">{title}</span>
              <span className="flex items-start gap-1.5 text-xs font-display text-text-muted">
                <UserRound size={12} className="shrink-0 mt-0.5 text-text-light" aria-hidden />
                <span className="min-w-0 line-clamp-2">{facts}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                {chips}
                {evidence.length > 0 && (
                  <IconChip icon={Paperclip} tone="bg-text-muted" label={`${evidence.length} ${evidence.length === 1 ? 'file' : 'files'}`} />
                )}
                {summary && summary.total > 0 && (
                  <span className={cn(
                    'inline-flex items-center gap-1 shrink-0 text-xs font-display font-bold px-1.5 py-0.5 rounded',
                    complete ? 'bg-success/10 text-success' : attentionNeeded ? 'bg-danger/10 text-danger' : 'bg-border/40 text-text-muted',
                  )}>
                    {attentionNeeded && <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />}
                    {summary.done}/{summary.total} done
                    {summary.missingPhotos > 0 && ` · ${summary.missingPhotos} photo${summary.missingPhotos === 1 ? '' : 's'} missing`}
                  </span>
                )}
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={2.5} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 hidden sm:block mt-2" aria-hidden />
          </button>
        </div>

        {!rejecting && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:self-start sm:shrink-0">
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="inline-flex items-center justify-center gap-1 h-11 sm:h-9 px-2.5 w-full sm:w-auto rounded-lg text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ChevronDown size={14} strokeWidth={2.5} className={cn('transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Hide' : 'Checklist'}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none pointer-coarse:min-h-11 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              onClick={() => setRejecting(true)}
            >
              <X size={14} aria-hidden />
              Send back
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none pointer-coarse:min-h-11 bg-success-strong text-white hover:bg-success-strong/90 hover:text-white"
              onClick={onApprove}
            >
              <Check size={14} aria-hidden />
              Approve
            </Button>
          </div>
        )}
      </div>

      {/* What it was handed in with: the person's own words, then the photos they attached. */}
      {(note || evidence.length > 0) && (
        <div className="flex flex-col gap-2.5 sm:pl-12">
          {note && (
            <p className="text-sm font-display text-text-secondary leading-relaxed whitespace-pre-wrap break-words line-clamp-3 border-l-2 border-border pl-3">{note}</p>
          )}
          <EvidenceStrip files={evidence} />
        </div>
      )}

      {expanded && (
        <div className="pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {preview(flagForCorrection)}
        </div>
      )}

      {rejecting && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <SendBackForm
            autoFocus
            quickReasons
            note={text}
            onNoteChange={setText}
            onCancel={() => { setRejecting(false); setText(''); }}
            onSubmit={() => onSendBack(text.trim())}
            canSubmit={text.trim().length > 0}
            isSending={false}
            busy={false}
            submitLabel="Send back"
            placeholder="Say what needs fixing before this can be approved"
          />
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

interface DecisionProps {
  now: number;
  departmentName: string | null;
  raisedByName: string | null;
  onApprove: (id: string, title: string) => void;
  onSendBack: (id: string, title: string, note: string) => void;
}

const asEvidence = (list: { id: string; url: string; mimeType: string; originalFilename: string | null }[]): EvidenceFile[] =>
  list.map((a) => ({ id: a.id, url: a.url, mimeType: a.mimeType, name: a.originalFilename }));

export const TicketRow = memo(function TicketRow({ ticket, now, departmentName, raisedByName, onApprove, onSendBack, selected = false, onToggleSelect }: { ticket: Ticket } & DecisionProps & SelectableProps) {
  // The ticket list already returns full checklist/item/image data, so no extra fetch is needed.
  const [expanded, setExpanded] = useState(false);
  // TicketDetail opens as a side sheet over this page, so the department, filters and scroll
  // position behind it survive a look at one ticket.
  const [showDetail, setShowDetail] = useState(false);

  // The latest hand-in: when it was sent for approval, what was said, and which photos came with it.
  const handIns = ticket.statusUpdates.filter((u) => u.toStatus === 'PENDING_APPROVAL');
  const latest = handIns.length ? handIns.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a)) : null;
  const since = new Date(latest?.createdAt ?? ticket.updatedAt).getTime();
  const look = waitingLook(since, now);
  const files = asEvidence([...(latest?.photos ?? []), ...ticket.attachments.filter((a) => !(latest?.photos ?? []).some((p) => p.id === a.id))]);

  return (
    <>
      <QueueRow
        icon={<TicketIcon size={18} aria-hidden />}
        title={ticket.title}
        facts={[raisedByName ? `Raised by ${raisedByName}` : null, ticket.assignee ? `Handled by ${ticket.assignee.firstName}` : 'Unassigned'].filter(Boolean).join(' · ')}
        chips={
          <>
            <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            <IconChip icon={Clock} tone={look.tone} label={`Waiting ${formatWaiting(since, now)}${look.suffix}`} labelClassName={look.text} />
          </>
        }
        note={latest?.remark?.trim() || null}
        evidence={files}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(ticket.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        summary={summarizeChecklists(ticket.checklists)}
        preview={(flag) => <ChecklistCompletionPreview checklists={ticket.checklists} isLoading={false} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={() => onApprove(ticket.id, ticket.title)}
        onSendBack={(note) => onSendBack(ticket.id, ticket.title, note)}
      />
      {showDetail && <TicketDetail ticket={ticket} onClose={() => setShowDetail(false)} />}
    </>
  );
});

export const TaskRow = memo(function TaskRow({ task, now, departmentName, raisedByName, onApprove, onSendBack, selected = false, onToggleSelect }: { task: Task } & DecisionProps & SelectableProps) {
  // A delegation's LIST response never carries checklist data, only getById does. Fetched when the
  // row expands (or, a moment earlier, when the pointer first lands on it), so opening the queue does
  // not fire a detail request per pending delegation.
  const [expanded, setExpanded] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const { data: fullTask, isPending: isDetailPending } = useTaskQuery(task.id, expanded || warmed);
  const [showDetail, setShowDetail] = useState(false);

  const source = fullTask ?? task;
  const handIns = (fullTask?.statusUpdates ?? []).filter((u) => u.toStatus === 'pending_approval');
  const latest = handIns.length ? handIns.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a)) : null;
  const since = new Date(task.submittedAt ?? latest?.createdAt ?? task.updatedAt).getTime();
  const look = waitingLook(since, now);

  return (
    <>
      <QueueRow
        icon={<CheckSquare size={18} aria-hidden />}
        title={task.title}
        facts={[raisedByName ? `Raised by ${raisedByName}` : null, task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'].filter(Boolean).join(' · ')}
        chips={
          <>
            <PriorityChip meta={PRIORITY_MAP[task.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            <IconChip icon={Clock} tone={look.tone} label={`Waiting ${formatWaiting(since, now)}${look.suffix}`} labelClassName={look.text} />
          </>
        }
        note={latest?.remark?.trim() || null}
        evidence={asEvidence(source.attachments ?? [])}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(task.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        onWarm={() => setWarmed(true)}
        // Once expanded, fullTask.checklists is the fresher source; until then the list endpoint's
        // batched rollup keeps the badge showing without waiting on the per-row fetch.
        summary={expanded && fullTask ? summarizeChecklists(fullTask.checklists) : task.checklistSummary}
        preview={(flag) => <ChecklistCompletionPreview checklists={fullTask?.checklists} isLoading={isDetailPending} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={() => onApprove(task.id, task.title)}
        onSendBack={(note) => onSendBack(task.id, task.title, note)}
      />
      {showDetail && <TaskDetail task={fullTask ?? task} onClose={() => setShowDetail(false)} />}
    </>
  );
});
