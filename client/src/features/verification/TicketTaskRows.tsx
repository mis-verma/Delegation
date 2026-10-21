import { memo, useState, type ReactNode } from 'react';
import { TicketForm } from '../tickets/TicketForm';
import { Check, CornerUpLeft, TicketPlus, ShieldCheck, Ticket as TicketIcon, CheckSquare, ChevronRight, ChevronDown, AlertTriangle, Clock, Paperclip, Film, UserRound } from 'lucide-react';
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

export interface EvidenceFile {
  id: string;
  url: string;
  mimeType: string;
  name: string | null;
}

const HOUR_MS = 3_600_000;

const waitingLook = (sinceMs: number, now: number) => {
  const hours = (now - sinceMs) / HOUR_MS;
  if (hours >= 24) return { tone: 'bg-danger', text: 'text-danger', suffix: ', over 24h' };
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
      {extra > 0 && <span className="t-meta font-display font-semibold text-text-muted tabular-nums">+{extra} more</span>}
    </div>
  );
};

interface QueueRowProps {
  raiseTicketFrom?: string;
  raiseTicketPath?: string;
  icon: ReactNode;
  title: string;
  facts: string;
  chips: ReactNode;
  note: string | null;
  evidence: EvidenceFile[];
  onOpen: () => void;
  onApprove: () => void;
  approveLabel?: string;
  onSendBack: (note: string) => void;
  selection?: { checked: boolean; onToggle: () => void };
  expanded: boolean;
  onToggleExpanded: () => void;
  preview: (flagForCorrection: (label: string) => void) => ReactNode;
  summary?: { total: number; done: number; missingPhotos: number };
  onWarm?: () => void;
}

const QueueRow = ({ raiseTicketFrom, raiseTicketPath, icon, title, facts, chips, note, evidence, onOpen, onApprove, approveLabel = 'Approve', onSendBack, selection, expanded, onToggleExpanded, preview, summary, onWarm }: QueueRowProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [raising, setRaising] = useState(false);
  const [text, setText] = useState('');

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
        'group flex flex-col gap-3 p-3 sm:p-4 rounded-xl border transition-colors duration-150',
        selection?.checked ? 'border-border-hover bg-surface' : 'border-border/60 bg-surface hover:border-border-hover',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selection && <SelectCheckbox checked={selection.checked} onChange={selection.onToggle} label={`Select ${title}`} />}

          <button
            type="button"
            onClick={onOpen}
            className="group/info flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <span className="flex items-center justify-center size-9 rounded-lg bg-surface-hover text-text-muted shrink-0">{icon}</span>
            <span className="flex flex-col gap-1.5 flex-1 min-w-0">
              <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug">{title}</span>
              <span className="flex items-start gap-1.5 t-meta font-display text-text-muted">
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
                    'inline-flex items-center gap-1 shrink-0 t-meta font-display font-bold px-1.5 py-0.5 rounded',
                    complete ? 'bg-success/10 text-success' : attentionNeeded ? 'bg-danger/10 text-danger' : 'bg-border/40 text-text-muted',
                  )}>
                    {attentionNeeded && <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />}
                    {summary.done}/{summary.total} done
                    {summary.missingPhotos > 0 && `, ${summary.missingPhotos} photo${summary.missingPhotos === 1 ? '' : 's'} missing`}
                  </span>
                )}
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={2.5} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 hidden sm:block mt-2" aria-hidden />
          </button>
        </div>

        {!rejecting && (
          <div role="group" aria-label={`Actions for ${title}`} className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:self-start sm:shrink-0">
            <Button size="sm" variant="ghost" className="col-span-2 h-11 sm:h-9 gap-1.5 sm:col-span-1" onClick={onToggleExpanded} aria-expanded={expanded}>
              <ChevronDown size={15} strokeWidth={2.5} className={cn('transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Hide details' : 'Checklist'}
            </Button>
            {raiseTicketFrom && (
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9 gap-1.5 border-primary-500/30 text-primary-700 hover:border-primary-500/50 hover:bg-primary-500/10 dark:text-primary-300"
                onClick={() => setRaising(true)}
              >
                <TicketPlus size={15} aria-hidden />
                Raise ticket
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-11 sm:h-9 gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              onClick={() => setRejecting(true)}
            >
              <CornerUpLeft size={15} aria-hidden />
              Send back
            </Button>
            <Button
              size="sm"
              className={cn('h-11 sm:h-9 gap-1.5 bg-success-strong text-white hover:bg-success-strong/90 hover:text-white', !raiseTicketFrom && 'col-span-2 sm:col-span-1')}
              onClick={onApprove}
            >
              <Check size={15} strokeWidth={2.75} aria-hidden />
              {approveLabel}
            </Button>
          </div>
        )}
      </div>

      {(note || evidence.length > 0) && (
        <div className="flex flex-col gap-2.5 sm:pl-12">
          {note && (
            <p className="text-sm font-display text-text-secondary leading-relaxed whitespace-pre-wrap break-words line-clamp-3 border-l-2 border-border pl-3">{note}</p>
          )}
          <EvidenceStrip files={evidence} />
        </div>
      )}

      {expanded && (
        <div className="pt-4 border-t border-border/50">
          {preview(flagForCorrection)}
        </div>
      )}

      {raising && raiseTicketFrom && (
        <TicketForm
          onClose={() => setRaising(false)}
          prefill={{ title: `Follow up: ${raiseTicketFrom}`.slice(0, 190), description: `Raised from the Verification Queue about "${raiseTicketFrom}".${raiseTicketPath ? ` Original: ${window.location.origin}${raiseTicketPath}` : ''}` }}
        />
      )}

      {rejecting && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border/50">
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
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const handIns = ticket.statusUpdates.filter((u) => u.toStatus === 'PENDING_APPROVAL');
  const latest = handIns.length ? handIns.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a)) : null;
  const since = new Date(latest?.createdAt ?? ticket.updatedAt).getTime();
  const look = waitingLook(since, now);
  const files = asEvidence([...(latest?.photos ?? []), ...ticket.attachments.filter((a) => !(latest?.photos ?? []).some((p) => p.id === a.id))]);

  return (
    <>
      <QueueRow
        icon={<TicketIcon size={18} aria-hidden />}
        raiseTicketFrom={ticket.title}
        raiseTicketPath={`/tickets?open=${ticket.id}`}
        title={ticket.title}
        facts={[raisedByName ? `Raised by ${raisedByName}` : null, ticket.assignee ? `handled by ${ticket.assignee.firstName}` : 'nobody working on it yet'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}
        chips={
          <>
            <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            {ticket.departmentId && <IconChip icon={ShieldCheck} tone={ticket.approvalStage === 'HOD' ? 'bg-warning' : 'bg-primary-600'} label={ticket.approvalStage === 'HOD' ? 'Head approves first' : ticket.hodApprovedAt ? 'Head approved, final check' : 'Final approval'} />}
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
        approveLabel={ticket.approvalStage === 'HOD' && ticket.departmentId ? 'Approve, send to PC' : 'Approve'}
        onSendBack={(note) => onSendBack(ticket.id, ticket.title, note)}
      />
      {showDetail && <TicketDetail ticket={ticket} onClose={() => setShowDetail(false)} />}
    </>
  );
});

export const TaskRow = memo(function TaskRow({ task, now, departmentName, raisedByName, onApprove, onSendBack, selected = false, onToggleSelect }: { task: Task } & DecisionProps & SelectableProps) {
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
        raiseTicketFrom={task.title}
        raiseTicketPath={`/tasks?open=${task.id}`}
        title={task.title}
        facts={[raisedByName ? `Raised by ${raisedByName}` : null, task.dueDate ? `due ${new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'no due date'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}
        chips={
          <>
            <PriorityChip meta={PRIORITY_MAP[task.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            {task.departmentId && <IconChip icon={ShieldCheck} tone={task.approvalStage === 'HOD' ? 'bg-warning' : 'bg-primary-600'} label={task.approvalStage === 'HOD' ? 'Head approves first' : task.hodApprovedAt ? 'Head approved, final check' : 'Final approval'} />}
            <IconChip icon={Clock} tone={look.tone} label={`Waiting ${formatWaiting(since, now)}${look.suffix}`} labelClassName={look.text} />
          </>
        }
        note={latest?.remark?.trim() || null}
        evidence={asEvidence(source.attachments ?? [])}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(task.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        onWarm={() => setWarmed(true)}
        summary={expanded && fullTask ? summarizeChecklists(fullTask.checklists) : task.checklistSummary}
        preview={(flag) => <ChecklistCompletionPreview checklists={fullTask?.checklists} isLoading={isDetailPending} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={() => onApprove(task.id, task.title)}
        approveLabel={task.approvalStage === 'HOD' && task.departmentId ? 'Approve, send to PC' : 'Approve'}
        onSendBack={(note) => onSendBack(task.id, task.title, note)}
      />
      {showDetail && <TaskDetail task={fullTask ?? task} onClose={() => setShowDetail(false)} />}
    </>
  );
});
