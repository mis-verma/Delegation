import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ShieldCheck, Repeat, CheckCircle2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ENTITY_CARD_CLASS, EmptyState, InlineError, PageHeader, Skeleton } from '../../../components';
import { usePendingVerificationChecklistInstancesQuery, useVerifyChecklistInstanceMutation, useSendBackChecklistInstanceMutation } from '../hook';
import { formatDate } from '../checklistDisplay';
import { ReviewActions, SendBackForm } from './ReviewActions';
import { InstanceReviewPanel } from './InstanceReviewPanel';
import type { ChecklistInstance } from '../../../api/checklistInstances';

const PAGE_SIZE = 20;

// Same card shape for the real row and its skeleton, so nothing shifts when the data arrives.
const ROW_CLASS = cn(ENTITY_CARD_CLASS, 'justify-start gap-4 sm:p-4');

// HOD (MANAGER) equivalent of VerificationQueue's ungrouped Checklists section, scoped to a
// single department — the server already narrows `pending-verification` to instances whose
// assignees belong to the caller's own department for a MANAGER, so this page needs no
// department filter of its own. Deliberately excludes Tickets/Delegations: those stay ADMIN-only
// (see App.tsx's AdminOnlyRoute), this page never widens their access.
const ApprovalRow = memo(({ instance }: { instance: ChecklistInstance }) => {
  const navigate = useNavigate();
  const verifyMut = useVerifyChecklistInstanceMutation();
  const sendBackMut = useSendBackChecklistInstanceMutation();
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Questions the reviewer ticked to send back on their own; empty means "the whole checklist".
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const togglePicked = useCallback((itemId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    }), []);
  const { id } = instance;
  const { mutate } = verifyMut;
  const busy = verifyMut.isPending || sendBackMut.isPending;

  const openDetail = () => navigate(`/checklists/${id}`);
  const cancel = () => { setSendingBack(false); setNote(''); };
  const startSendBack = () => setSendingBack(true);
  const approve = () => mutate({ id, payload: { action: 'APPROVE' } });
  const sendBack = () => {
    if (picked.size > 0) {
      sendBackMut.mutate({ id, payload: { itemIds: [...picked], note: note.trim() } }, { onSuccess: () => setPicked(new Set()) });
    } else {
      mutate({ id, payload: { action: 'REJECT', note: note.trim() } });
    }
  };

  // verifyMut.variables tells which of the two requests is the one in flight.
  const approving = verifyMut.isPending && verifyMut.variables?.payload.action === 'APPROVE';
  const sending = (verifyMut.isPending && verifyMut.variables?.payload.action === 'REJECT') || sendBackMut.isPending;

  return (
    <div className={ROW_CLASS}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={openDetail}
          className="group/info flex items-start sm:items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Repeat size={18} className="text-primary-500 shrink-0" aria-hidden />
          <span className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-sm font-display font-medium text-text truncate group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">
              {instance.title}
            </span>
            <span className="text-xs font-display text-text-muted truncate">
              {formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)} · every item checked off
            </span>
          </span>
        </button>

        {!sendingBack && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="gap-1"
            >
              <ChevronDown size={14} className={cn('transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Hide questions' : 'Review questions'}
            </Button>
            <ReviewActions onSendBack={startSendBack} onApprove={approve} busy={busy} approving={approving} pickedCount={picked.size} />
          </div>
        )}
      </div>

      {expanded && (
        <div className="pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <InstanceReviewPanel items={instance.items} selected={picked} onToggle={togglePicked} disabled={busy} />
        </div>
      )}

      {sendingBack && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <SendBackForm
            autoFocus
            note={note}
            onNoteChange={setNote}
            onCancel={cancel}
            onSubmit={sendBack}
            canSubmit={note.trim().length > 0}
            isSending={sending}
            busy={busy}
            submitLabel={picked.size > 0 ? `Send back ${picked.size} ${picked.size === 1 ? 'question' : 'questions'}` : 'Send back for changes'}
            placeholder={picked.size > 0 ? 'What needs fixing on these questions?' : 'What needs fixing before this can be approved?'}
          />
        </div>
      )}
    </div>
  );
});
ApprovalRow.displayName = 'ApprovalRow';

// Mirrors ApprovalRow: same card, a 18px icon, two text lines and the two action buttons.
const SkeletonRow = () => (
  <div className={ROW_CLASS} aria-hidden>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <Skeleton className="size-[18px] rounded-md shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-1/2 sm:w-1/3" />
          <Skeleton className="h-3 w-2/3 sm:w-1/2" />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-8 pointer-coarse:h-11 w-24 rounded-md" />
        <Skeleton className="h-8 pointer-coarse:h-11 w-24 rounded-md" />
      </div>
    </div>
  </div>
);

export const ChecklistApprovals = () => {
  // Infinite, not a growing flat `limit` — that used to refetch every already-loaded row from
  // offset 0 on each "Load more" click (5 clicks to reach 100 rows transferred 300
  // row-equivalents). useInfiniteQuery fetches and caches each page exactly once.
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePendingVerificationChecklistInstancesQuery(PAGE_SIZE);
  const instances = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? instances.length;

  // Never claim "completely clear" until the queue has actually loaded.
  const subtitle = isPending
    ? <span className="block h-4 w-56 animate-pulse rounded-md bg-surface-active" aria-hidden />
    : isError && !data
      ? 'The queue could not be loaded.'
      : total === 0
        ? 'Your department is completely clear'
        : `${total} checklist${total !== 1 ? 's' : ''} from your department waiting on review`;

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <PageHeader icon={ShieldCheck} title="Team Checklist Approvals" subtitle={subtitle} />

      {isError && (
        <InlineError message="We couldn't load the approvals queue. Check your connection and try again." onRetry={() => refetch()} />
      )}

      <div className="flex flex-col gap-3">
        {isPending && (<><SkeletonRow /><SkeletonRow /></>)}
        {!isPending && !isError && instances.length === 0 && (
          <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="Nothing waiting on you right now." />
        )}
        {instances.map((instance) => <ApprovalRow key={instance.id} instance={instance} />)}
      </div>

      {!isPending && hasNextPage && (
        <Button variant="outline" size="sm" className="self-center" isLoading={isFetchingNextPage} onClick={() => fetchNextPage()}>
          Load more ({total - instances.length} remaining)
        </Button>
      )}
    </div>
  );
};
