import { useAuth } from '../../context/AuthContext';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { TicketForm } from '../tickets/TicketForm';
import { Check, TicketPlus, ShieldCheck, Ticket as TicketIcon, CheckSquare, ChevronDown, AlertTriangle, Paperclip, UserRound, type LucideIcon } from 'lucide-react';
import { IconChip, PriorityChip, DepartmentChip } from '../../components';
import { DecisionButtons, ROW_LINK, ROW_META, ROW_SURFACE, ROW_TITLE, WaitingTag } from './ChecklistQueueRow';
import { CorrectionDialog } from './CorrectionDialog';
import { previewCorrectionItems, type CorrectionItem, type SendBackPayload } from './correctionItems';
import { useReviewDraft } from './useReviewDraft';
import type { ChecklistCorrection } from './decisionRequests';
import type { PreviewChecklist } from './checklistSummary';
import { cn } from '@/lib/utils';
import { PhotoThumbs } from './PhotoThumbs';
import { useTaskQuery } from '../tasks/hook';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { ChecklistCompletionPreview } from './ChecklistCompletionPreview';
import { PhotoReviewContext } from '../checklist/instance/photoReviewContext';
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

interface WaitingInfo {
  label: string;
  title: string;
  tone: 'normal' | 'slow' | 'late';
}

const waitingInfo = (sinceMs: number, now: number): WaitingInfo => {
  const hours = (now - sinceMs) / HOUR_MS;
  const label = formatWaiting(sinceMs, now);
  if (hours >= 24) return { label, title: `Waiting ${label}, over 24h`, tone: 'late' };
  return { label, title: `Waiting ${label}`, tone: hours >= 12 ? 'slow' : 'normal' };
};

const MAX_THUMBS = 4;

const headsStillWaiting = (task: Task): number => (task.departmentApprovals ?? []).filter((a) => a.completion === 'pending').length;

const EvidenceStrip = ({ files }: { files: EvidenceFile[] }) => (files.length === 0 ? null : <PhotoThumbs files={files} label="Attachment" max={MAX_THUMBS} />);

interface QueueRowProps {
  raiseTicketFrom?: string;
  raiseTicketPath?: string;
  icon: LucideIcon;
  title: string;
  waiting: WaitingInfo;
  facts: string;
  chips: ReactNode;
  note: string | null;
  evidence: EvidenceFile[];
  onOpen: () => void;
  onApprove: () => void;
  approveLabel?: string;
  onSendBack: (note: string, correction: ChecklistCorrection) => void;
  rowId: string;
  correctionItems: CorrectionItem[];
  workerNames: string[];
  selection?: { checked: boolean; onToggle: () => void };
  expanded: boolean;
  onToggleExpanded: () => void;
  preview: (flagForCorrection: (itemId: string) => void) => ReactNode;
  summary?: { total: number; done: number; missingPhotos: number };
  onWarm?: () => void;
}

const QueueRow = ({ raiseTicketFrom, raiseTicketPath, icon: Icon, title, waiting, facts, chips, note, evidence, onOpen, onApprove, approveLabel = 'Approve', onSendBack, rowId, correctionItems, workerNames, selection, expanded, onToggleExpanded, preview, summary, onWarm }: QueueRowProps) => {
  const [raising, setRaising] = useState(false);
  const draft = useReviewDraft(rowId);

  const flagForCorrection = (itemId: string) => {
    onWarm?.();
    draft.startPickFor(rowId, itemId);
  };

  const startCorrection = () => {
    onWarm?.();
    draft.setSending(true);
  };

  const sendCorrection = ({ itemIds, note: text, photoOnlyItemIds = [] }: SendBackPayload) => {
    onSendBack(text.trim(), { correctionItemIds: itemIds.filter((id) => !photoOnlyItemIds.includes(id)), photoOnlyItemIds });
    draft.reset();
  };

  const complete = summary && summary.total > 0 && summary.done === summary.total && summary.missingPhotos === 0;
  const attentionNeeded = summary && summary.total > 0 && (summary.done < summary.total || summary.missingPhotos > 0);

  return (
    <div
      onPointerEnter={onWarm}
      onFocus={onWarm}
      className={cn(ROW_SURFACE, selection?.checked ? 'border-border-hover' : 'border-border/60 hover:border-border-hover')}
    >
      <div className="flex items-start gap-2">
        {selection && <SelectCheckbox checked={selection.checked} onChange={selection.onToggle} label={`Select ${title}`} />}

        <button
          type="button"
          onClick={onOpen}
          className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Icon size={14} aria-hidden className="mt-0.5 shrink-0 text-text-light" />
          <span className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="flex items-start justify-between gap-3">
              <span className={cn(ROW_TITLE, 'font-semibold')}>{title}</span>
              <WaitingTag label={waiting.label} title={waiting.title} tone={waiting.tone} />
            </span>
            <span className={ROW_META}>
              <span className="inline-flex items-start gap-1 min-w-0">
                <UserRound size={11} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0 line-clamp-2">{facts}</span>
              </span>
            </span>
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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
      </div>

      {(note || evidence.length > 0) && (
        <div className="flex flex-col gap-2">
          {note && (
            <p className="text-sm font-display text-text-secondary leading-relaxed whitespace-pre-wrap break-words line-clamp-3 border-l-2 border-border pl-3">{note}</p>
          )}
          <EvidenceStrip files={evidence} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" aria-expanded={expanded} onClick={onToggleExpanded} className={ROW_LINK}>
          <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
          {expanded ? 'Hide checklist' : 'Show checklist'}
        </button>
        {raiseTicketFrom && (
          <button type="button" onClick={() => setRaising(true)} className={ROW_LINK}>
            <TicketPlus size={14} aria-hidden />
            Raise ticket
          </button>
        )}
      </div>

      {expanded && (
        <div className="pt-3 border-t border-border/50">
          {preview(flagForCorrection)}
        </div>
      )}

      <div role="group" aria-label={`Actions for ${title}`}>
        <DecisionButtons onSendBack={startCorrection} onApprove={onApprove} approveLabel={approveLabel} />
      </div>

      {raising && raiseTicketFrom && (
        <TicketForm
          onClose={() => setRaising(false)}
          prefill={{ title: `Follow up: ${raiseTicketFrom}`.slice(0, 190), description: `Raised from the Verification Queue about "${raiseTicketFrom}".${raiseTicketPath ? ` Original: ${window.location.origin}${raiseTicketPath}` : ''}` }}
        />
      )}

      <CorrectionDialog
        items={correctionItems}
        assigneeNames={workerNames}
        draft={draft}
        onSend={sendCorrection}
        allowFixBy={false}
        wholeLabel="It goes back as a whole, nothing is reopened."
      />
    </div>
  );
};

const flatItems = (checklists: PreviewChecklist[] | undefined) => (checklists ?? []).flatMap((c) => c.items);

interface SelectableProps {
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

interface DecisionProps {
  now: number;
  departmentName: string | null;
  raisedByName: string | null;
  onApprove: (id: string, title: string) => void;
  onSendBack: (id: string, title: string, note: string, correction?: ChecklistCorrection) => void;
}

const asEvidence = (list: { id: string; url: string; mimeType: string; originalFilename: string | null }[]): EvidenceFile[] =>
  list.map((a) => ({ id: a.id, url: a.url, mimeType: a.mimeType, name: a.originalFilename }));

export const TicketRow = memo(function TicketRow({ ticket, now, departmentName, raisedByName, onApprove, onSendBack, selected = false, onToggleSelect }: { ticket: Ticket } & DecisionProps & SelectableProps) {
  const { user: signedIn } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const ticketCorrections = useMemo(() => previewCorrectionItems(flatItems(ticket.checklists)), [ticket.checklists]);

  const handIns = ticket.statusUpdates.filter((u) => u.toStatus === 'PENDING_APPROVAL');
  const latest = handIns.length ? handIns.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a)) : null;
  const since = new Date(latest?.createdAt ?? ticket.updatedAt).getTime();
  const waiting = waitingInfo(since, now);
  const files = asEvidence([...(latest?.photos ?? []), ...ticket.attachments.filter((a) => !(latest?.photos ?? []).some((p) => p.id === a.id))]);

  return (
    <>
      <QueueRow
        icon={TicketIcon}
        raiseTicketFrom={ticket.title}
        raiseTicketPath={`/tickets?open=${ticket.id}`}
        title={ticket.title}
        waiting={waiting}
        facts={[raisedByName ? `Sent by ${raisedByName}` : null, ticket.assignee ? `handled by ${ticket.assignee.firstName}` : 'nobody working on it yet'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}
        chips={
          <>
            <PriorityChip meta={PRIORITY_CONFIG[ticket.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            {ticket.departmentId && <IconChip icon={ShieldCheck} tone={ticket.approvalStage === 'HOD' ? 'bg-warning' : 'bg-primary-600'} label={ticket.approvalStage === 'HOD' ? 'Head approves first' : ticket.hodApprovedAt ? 'Head approved, final check' : 'Final approval'} />}
          </>
        }
        note={latest?.remark?.trim() || null}
        evidence={files}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(ticket.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        summary={summarizeChecklists(ticket.checklists)}
        preview={(flag) => (
          <PhotoReviewContext.Provider value={{ kind: 'ticket', ownerId: ticket.id }}>
            <ChecklistCompletionPreview checklists={ticket.checklists} isLoading={false} onFlagItem={(item) => flag(item.id)} />
          </PhotoReviewContext.Provider>
        )}
        onOpen={() => setShowDetail(true)}
        onApprove={() => onApprove(ticket.id, ticket.title)}
        approveLabel={ticket.approvalStage === 'HOD' && ticket.departmentId ? (signedIn?.role === 'ADMIN' ? 'Approve now' : 'Approve, send to PC') : 'Approve'}
        onSendBack={(text, correction) => onSendBack(ticket.id, ticket.title, text, correction)}
        rowId={ticket.id}
        correctionItems={ticketCorrections}
        workerNames={ticket.assignee ? [ticket.assignee.firstName] : []}
      />
      {showDetail && <TicketDetail ticket={ticket} onClose={() => setShowDetail(false)} />}
    </>
  );
});

export const TaskRow = memo(function TaskRow({ task, now, departmentName, raisedByName, onApprove, onSendBack, selected = false, onToggleSelect }: { task: Task } & DecisionProps & SelectableProps) {
  const { user: signedIn } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const { data: fullTask, isPending: isDetailPending } = useTaskQuery(task.id, expanded || warmed);
  const [showDetail, setShowDetail] = useState(false);

  const source = fullTask ?? task;
  const taskCorrections = useMemo(() => previewCorrectionItems(flatItems(fullTask?.checklists)), [fullTask?.checklists]);
  const handIns = (fullTask?.statusUpdates ?? []).filter((u) => u.toStatus === 'pending_approval');
  const latest = handIns.length ? handIns.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a)) : null;
  const since = new Date(task.submittedAt ?? latest?.createdAt ?? task.updatedAt).getTime();
  const waiting = waitingInfo(since, now);

  return (
    <>
      <QueueRow
        icon={CheckSquare}
        raiseTicketFrom={task.title}
        raiseTicketPath={`/tasks?open=${task.id}`}
        title={task.title}
        waiting={waiting}
        facts={[raisedByName ? `Sent by ${raisedByName}` : null, task.dueDate ? `due ${new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'no due date'].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}
        chips={
          <>
            <PriorityChip meta={PRIORITY_MAP[task.priority]} />
            {departmentName && <DepartmentChip name={departmentName} />}
            {task.departmentId && <IconChip icon={ShieldCheck} tone={task.approvalStage === 'HOD' ? 'bg-warning' : 'bg-primary-600'} label={task.approvalStage === 'HOD' ? (headsStillWaiting(task) > 1 ? `${headsStillWaiting(task)} heads approve first` : 'Head approves first') : task.hodApprovedAt ? 'Head approved, final check' : 'Final approval'} />}
          </>
        }
        note={latest?.remark?.trim() || null}
        evidence={asEvidence(source.attachments ?? [])}
        selection={onToggleSelect ? { checked: selected, onToggle: () => onToggleSelect(task.id) } : undefined}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        onWarm={() => setWarmed(true)}
        summary={expanded && fullTask ? summarizeChecklists(fullTask.checklists) : task.checklistSummary}
        preview={(flag) => (
          <PhotoReviewContext.Provider value={{ kind: 'task', ownerId: task.id }}>
            <ChecklistCompletionPreview checklists={fullTask?.checklists} isLoading={isDetailPending} onFlagItem={(item) => flag(item.id)} />
          </PhotoReviewContext.Provider>
        )}
        onOpen={() => setShowDetail(true)}
        onApprove={() => onApprove(task.id, task.title)}
        approveLabel={task.approvalStage === 'HOD' && task.departmentId ? (signedIn?.role === 'ADMIN' ? 'Approve now (skips the head)' : headsStillWaiting(task) > 1 ? 'Approve for my department' : 'Approve, send to PC') : 'Approve'}
        onSendBack={(text, correction) => onSendBack(task.id, task.title, text, correction)}
        rowId={task.id}
        correctionItems={taskCorrections}
        workerNames={[]}
      />
      {showDetail && <TaskDetail task={fullTask ?? task} onClose={() => setShowDetail(false)} />}
    </>
  );
});
