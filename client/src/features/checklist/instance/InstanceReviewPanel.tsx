import { memo, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, CheckCheck, ChevronDown, CornerUpLeft, Flag, History, ShieldCheck, Timer } from 'lucide-react';
import { IconChip } from '../../../components';
import { cn } from '@/lib/utils';
import { answerVerdict, runScores } from '../checklistCompliance';
import { complianceToneClass, formatDateTime } from '../checklistDisplay';
import { EvidenceThumb } from './EvidenceThumb';
import { WaiveAction } from './WaiveAction';
import { RaiseTicketAction } from './RaiseTicketAction';
import { useChecklistItemHistoryQuery } from '../hook';
import { generalPhotoCount, itemFlags, needsLookRank, type ItemFlags } from './reviewFlags';
import { answerText } from './answerText';
import type { ChecklistInstanceItem, ChecklistInstanceItemSubmission } from '../../../api/checklistInstances';

const QUESTION_NOTE_MAX = 200;

const personName = (s: ChecklistInstanceItemSubmission) =>
  `${s.userId.firstName}${s.userId.lastName ? ` ${s.userId.lastName}` : ''}${s.userId.isActive === false ? ' (left)' : ''}`;

const AuditPeople = ({ item }: { item: ChecklistInstanceItem }) => {
  const [open, setOpen] = useState(false);
  if (item.submissions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start min-h-11 sm:min-h-8 -mx-1.5 px-1.5 rounded-lg t-meta font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')} />
        {open ? 'Hide people' : `Show each person (${item.submissions.length})`}
      </button>
      {open && (
        <ul className="flex flex-col gap-2">
          {item.submissions.map((sub) => {
            const state = sub.isNotApplicable ? 'Not applicable' : sub.isDone ? 'Checked' : 'Not checked';
            return (
              <li key={sub.id} className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-hover/30 p-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-display font-medium text-text">{personName(sub)}</span>
                  <span className={cn('t-meta font-display font-semibold', sub.isNotApplicable ? 'text-text-muted' : sub.isDone ? 'text-success' : 'text-warning')}>
                    {state}
                  </span>
                </div>
                <p className="t-meta font-display text-text-muted">
                  {sub.completedAt ? formatDateTime(sub.completedAt) : 'No time recorded'}
                  {sub.dressType ? ` \u00b7 Wearing: ${sub.dressType.name}` : ''}
                </p>
                {sub.remarks && (
                  <p className="t-meta font-display text-text-muted whitespace-pre-wrap break-words">
                    {sub.isNotApplicable ? 'Reason' : 'Remark'}: {sub.remarks}
                  </p>
                )}
                {sub.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sub.images.map((img) => <EvidenceThumb key={img.id} image={img} fallbackAlt={`Evidence for ${personName(sub)}`} />)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const ItemHistoryList = ({ item }: { item: ChecklistInstanceItem }) => {
  const { data, isPending, isError } = useChecklistItemHistoryQuery(item.instanceId, true);
  const events = (data ?? []).filter((e) => e.itemId === item.id);
  if (isPending) return <p className="t-meta font-display text-text-muted">Loading history...</p>;
  if (isError) return <p className="t-meta font-display text-danger">Could not load the history. Try again in a moment.</p>;
  if (events.length === 0) return <p className="t-meta font-display text-text-muted">No changes recorded for this question.</p>;
  return (
    <ol className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col">
          <span className="t-meta font-display font-medium text-text-secondary">{e.summary}</span>
          <span className="t-meta font-display text-text-muted">{e.actorName} &middot; {formatDateTime(e.at)}</span>
        </li>
      ))}
    </ol>
  );
};

interface ReviewRowProps {
  item: ChecklistInstanceItem;
  canWaive: boolean;
  canRaiseTicket: boolean;
  flags: ItemFlags;
  selected: boolean;
  disabled: boolean;
  onToggle: (itemId: string) => void;
  note: string;
  onNoteChange?: (itemId: string, note: string) => void;
  previousNote: string | null;
  deadlineMs: number | null;
  index: number;
}

const ReviewRow = memo(function ReviewRow({ item, canWaive, canRaiseTicket, flags, selected, disabled, onToggle, note, onNoteChange, previousNote, deadlineMs, index }: ReviewRowProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const answer = item.isNotApplicable ? null : answerText(item);
  const answerValue = answer ? answer.replace(/^(Answered:?|Entered|Picked|Rated)\s+/, '') : null;
  const answeredLate = deadlineMs != null && item.isDone && !!item.completedAt && new Date(item.completedAt).getTime() > deadlineMs;
  const verdict = answerVerdict(item);
  const wrong = flags.bad || flags.sentBack || flags.missingPhotos;
  const right = verdict === 'good' && !flags.sentBack && !flags.missingPhotos;
  const StatusIcon = flags.critical && flags.bad ? Flag : wrong ? AlertTriangle : item.isNotApplicable || !item.isDone ? Ban : Check;
  const statusTone = selected || (flags.critical && flags.bad)
    ? 'bg-danger/15 text-danger'
    : wrong
      ? 'bg-warning/15 text-warning'
      : right
        ? 'bg-success/15 text-success'
        : 'bg-border/60 text-text-muted';
  const meta = item.itemType === 'AUDIT'
    ? 'Audit question'
    : !item.isDone || !item.completedAt
      ? 'Not done'
      : `${item.isNotApplicable ? 'Marked not applicable' : 'Done'} · ${formatDateTime(item.completedAt)}${item.completedByName ? ` by ${item.completedByName}` : ''}`;

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3 sm:p-3.5 transition-colors duration-150',
        selected ? 'border-danger/50 bg-danger/10 dark:bg-danger/20' : wrong ? 'border-danger/25 bg-danger/5 dark:bg-danger/10' : 'border-border/70 bg-surface',
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', statusTone)} aria-hidden>
          <StatusIcon size={15} strokeWidth={2.5} />
        </span>
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className="flex items-start justify-between gap-x-3 gap-y-1.5 flex-wrap">
            <p className="text-sm font-display font-semibold text-text leading-snug min-w-0 flex-1 basis-56">
              <span className="text-text-light tabular-nums">{index}. </span>
              {item.label}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {answeredLate && <IconChip icon={Timer} tone="bg-warning" label="Answered late" title="Completed after the run's closing time" />}
              {flags.critical && <IconChip icon={Flag} tone="bg-danger" label="Critical" title="Marked critical by the checklist author" />}
              {item.isNotApplicable && <IconChip icon={Ban} tone="bg-text-muted" label="Not applicable" />}
              {flags.bad && <IconChip icon={AlertTriangle} tone="bg-warning" label="Not an acceptable answer" />}
              {flags.sentBack && (
                <IconChip
                  icon={CornerUpLeft}
                  tone="bg-danger"
                  label={item.reviewTicketId && item.sendBackCount === 1 ? 'Ticket raised' : item.sendBackCount === 1 ? 'Sent back once' : `Sent back ${item.sendBackCount} times`}
                  title="Counts against compliance"
                />
              )}
              {flags.fixed && <IconChip icon={CheckCheck} tone="bg-success" label="Fixed after send-back" />}
              {flags.waived && <IconChip icon={ShieldCheck} tone="bg-primary-600" label="Waived" title={item.waiveReason ?? 'Excused by a reviewer'} />}
              {flags.missingPhotos && <IconChip icon={AlertTriangle} tone="bg-danger" label={`Photos ${generalPhotoCount(item)}/${item.requiredImageCount}`} />}
            </div>
          </div>

          {answerValue && (
            <p className="flex items-baseline gap-2 text-sm font-display">
              <span className="t-meta font-semibold text-text-muted">Answer</span>
              <span className={cn('font-bold', wrong ? 'text-warning' : 'text-text')}>{answerValue}</span>
            </p>
          )}
          <p className="t-meta font-display text-text-muted">{meta}</p>

          {item.remarks && (
            <p className="t-meta font-display text-text-secondary whitespace-pre-wrap break-words border-l-2 border-border pl-2.5">
              {item.isNotApplicable ? 'Reason' : 'Remark'}: {item.remarks}
            </p>
          )}
          {flags.waived && item.waiveReason && (
            <p className="t-meta font-display text-text-muted whitespace-pre-wrap break-words border-l-2 border-primary-500/40 pl-2.5">
              Waived: {item.waiveReason}
            </p>
          )}
          {flags.fixed && previousNote && (
            <p className="t-meta font-display text-text-muted whitespace-pre-wrap break-words border-l-2 border-border pl-2.5">
              You sent it back with: {previousNote}
            </p>
          )}
          {item.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.images.map(img => <EvidenceThumb key={img.id} image={img} fallbackAlt={`Evidence for ${item.label}`} />)}
            </div>
          )}
          {item.itemType === 'AUDIT' && <AuditPeople item={item} />}
          {historyOpen && item.itemType !== 'AUDIT' && <ItemHistoryList item={item} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
        <label
          className={cn(
            'relative inline-flex h-11 sm:h-9 select-none items-center gap-2 rounded-lg border px-3 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-danger/40',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            selected ? 'border-danger/60 bg-danger/10 text-danger' : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(item.id)}
            aria-label={`Send back: ${item.label}`}
          />
          <span
            className={cn('flex size-4.5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150', selected ? 'border-danger bg-danger text-white' : 'border-border-hover bg-surface')}
            aria-hidden
          >
            <Check size={12} strokeWidth={3} className={cn('transition-opacity duration-150', selected ? 'opacity-100' : 'opacity-0')} />
          </span>
          <span className="t-meta font-display font-semibold">{selected ? 'Sending back' : 'Send back'}</span>
        </label>
        {(canRaiseTicket || item.reviewTicketId) && <RaiseTicketAction item={item} canRaise={canRaiseTicket} />}
        {canWaive && (flags.bad || flags.sentBack || flags.waived) && <WaiveAction instanceId={item.instanceId} item={item} />}
        {item.itemType !== 'AUDIT' && (
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="ml-auto inline-flex h-11 sm:h-9 items-center gap-1.5 rounded-lg px-2.5 t-meta font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <History size={13} aria-hidden />
            {historyOpen ? 'Hide history' : 'History'}
          </button>
        )}
      </div>

      {selected && onNoteChange && (
        <input
          type="text"
          value={note}
          maxLength={QUESTION_NOTE_MAX}
          disabled={disabled}
          onChange={(e) => onNoteChange(item.id, e.target.value)}
          placeholder="Note for this question (optional)"
          aria-label={`Note for: ${item.label}`}
          className="w-full h-11 sm:h-9 px-3 rounded-lg border border-border bg-surface text-sm font-display text-text placeholder:text-text-light transition-colors duration-150 outline-none hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      )}
    </li>
  );
});

interface InstanceReviewPanelProps {
  items: ChecklistInstanceItem[];
  canWaive?: boolean;
  canRaiseTicket?: boolean;
  selected: ReadonlySet<string>;
  onToggle: (itemId: string) => void;
  disabled?: boolean;
  notes?: Readonly<Record<string, string>>;
  onNoteChange?: (itemId: string, note: string) => void;
  lastSendBackNote?: string | null;
  showScores?: boolean;
  deadlineMs?: number | null;
}

const SectionTitle = ({ children }: { children: string }) => (
  <h3 className="t-card font-display font-semibold text-text">{children}</h3>
);

export const InstanceReviewPanel = memo(function InstanceReviewPanel({
  items, canWaive = false, canRaiseTicket = false, selected, onToggle, disabled = false, notes, onNoteChange, lastSendBackNote = null, showScores = true, deadlineMs = null,
}: InstanceReviewPanelProps) {
  const scores = useMemo(() => (showScores ? runScores(items) : null), [items, showScores]);
  const [showRest, setShowRest] = useState(false);

  const { look, rest } = useMemo(() => {
    const withFlags = items.map(item => ({ item, flags: itemFlags(item) }));
    return {
      look: withFlags.filter(r => r.flags.needsLook).sort((a, b) => needsLookRank(a.flags) - needsLookRank(b.flags)),
      rest: withFlags.filter(r => !r.flags.needsLook),
    };
  }, [items]);

  const orderOf = useMemo(() => new Map(items.map((i, n) => [i.id, n + 1])), [items]);

  const renderRow = ({ item, flags }: { item: ChecklistInstanceItem; flags: ItemFlags }) => (
    <ReviewRow
      key={item.id}
      item={item}
      canWaive={canWaive}
      canRaiseTicket={canRaiseTicket}
      flags={flags}
      selected={selected.has(item.id)}
      disabled={disabled}
      onToggle={onToggle}
      note={notes?.[item.id] ?? ''}
      onNoteChange={onNoteChange}
      previousNote={lastSendBackNote}
      deadlineMs={deadlineMs}
      index={orderOf.get(item.id) ?? 0}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {scores && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap t-meta font-display">
          <span className="font-semibold text-text-secondary tabular-nums">{scores.completion}% complete</span>
          <span className="text-text-muted tabular-nums">{scores.done} of {scores.total} questions done</span>
          {scores.compliance !== null && (
            <span className={cn('font-semibold tabular-nums', complianceToneClass(scores.compliance))}>
              Compliance {scores.compliance}%
            </span>
          )}
        </div>
      )}
      <p className="t-meta font-display text-text-muted leading-relaxed">
        Tick a question that was not done properly to send only that one back. It also counts against compliance.
      </p>

      <section className="flex flex-col gap-3" aria-label="Needs a look">
        <SectionTitle>{`Needs a look (${look.length})`}</SectionTitle>
        {look.length > 0 ? (
          <ul className="flex flex-col gap-2">{look.map(renderRow)}</ul>
        ) : (
          <p className="t-meta font-display text-text-muted">Nothing stands out. Every answer was within its rule and photos are in.</p>
        )}
      </section>

      {rest.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Everything else">
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            aria-expanded={showRest}
            className="flex items-center gap-1.5 self-start min-h-11 sm:min-h-8 -mx-1.5 px-1.5 rounded-lg text-sm font-display font-semibold text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200', showRest ? 'rotate-0' : '-rotate-90')} />
            {`Everything else (${rest.length} ${rest.length === 1 ? 'question' : 'questions'})`}
          </button>
          {showRest && <ul className="flex flex-col gap-2">{rest.map(renderRow)}</ul>}
        </section>
      )}
    </div>
  );
});
