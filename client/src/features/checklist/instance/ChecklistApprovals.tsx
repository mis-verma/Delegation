import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ShieldCheck, Check, X, Loader2, Repeat, CheckCircle2 } from 'lucide-react';
import { Button, GradientIconTile, EmptyState } from '../../../components';
import { usePendingVerificationChecklistInstancesQuery, useVerifyChecklistInstanceMutation } from '../hook';
import { formatDate } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

const PAGE_SIZE = 20;

// HOD (MANAGER) equivalent of VerificationQueue's ungrouped Checklists section, scoped to a
// single department — the server already narrows `pending-verification` to instances whose
// assignees belong to the caller's own department for a MANAGER, so this page needs no
// department filter of its own. Deliberately excludes Tickets/Delegations: those stay ADMIN-only
// (see App.tsx's AdminOnlyRoute), this page never widens their access.
const ApprovalRow = ({ instance }: { instance: ChecklistInstance }) => {
  const navigate = useNavigate();
  const verifyMut = useVerifyChecklistInstanceMutation();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <div className="group flex flex-col p-4 rounded-lg border border-border/60 bg-surface/60 hover:bg-surface/90 hover:border-border-hover transition-all duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(`/checklists/${instance.id}`)}
          className="group/info flex items-start sm:items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <div className="flex items-center justify-center text-primary-500 shrink-0">
            <Repeat size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-medium text-text truncate group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">
              {instance.title}
            </p>
            <p className="text-xs font-display text-text-muted truncate mt-0.5">
              {formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)} · every item checked off
            </p>
          </div>
        </button>

        {!rejecting && (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger transition-colors"
              disabled={verifyMut.isPending}
              onClick={() => setRejecting(true)}
            >
              <X size={14} />
              <span className="hidden sm:inline">Reject</span>
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 bg-success hover:bg-success/90 shadow-sm shadow-success/20"
              disabled={verifyMut.isPending}
              onClick={() => verifyMut.mutate({ id: instance.id, payload: { action: 'APPROVE' } })}
            >
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve
            </Button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="flex flex-col gap-3 pt-4 mt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs fixing before this can be approved?"
            rows={2}
            className="w-full px-3.5 py-2.5 text-sm bg-surface/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger/50 resize-none transition-all placeholder:text-text-muted/50"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={verifyMut.isPending}
              onClick={() => { setRejecting(false); setNote(''); }}
              className="text-text-muted hover:text-text"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-danger hover:bg-danger/90 shadow-sm shadow-danger/20"
              disabled={verifyMut.isPending || !note.trim()}
              onClick={() => verifyMut.mutate({ id: instance.id, payload: { action: 'REJECT', note: note.trim() } })}
            >
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Send back for changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const SkeletonRow = () => (
  <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-border/40 bg-surface/30 animate-pulse">
    <div className="size-10 rounded-lg bg-border/50 shrink-0" />
    <div className="flex-1 space-y-2.5 py-1">
      <div className="h-4 bg-border/60 rounded w-1/3 sm:w-1/4" />
      <div className="h-3 bg-border/40 rounded w-1/2 sm:w-1/3" />
    </div>
  </div>
);

export const ChecklistApprovals = () => {
  // Infinite, not a growing flat `limit` — that used to refetch every already-loaded row from
  // offset 0 on each "Load more" click (5 clicks to reach 100 rows transferred 300
  // row-equivalents). useInfiniteQuery fetches and caches each page exactly once.
  const { data, isPending, fetchNextPage, hasNextPage } = usePendingVerificationChecklistInstancesQuery(PAGE_SIZE);
  const instances = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const hasMore = hasNextPage;
  const total = data?.pages[0]?.meta?.total ?? instances.length;

  return (
    <div className="flex flex-col gap-6 w-full max-w-(--container-width) mx-auto">
      <div className="flex items-center gap-4">
        <GradientIconTile icon={ShieldCheck} size="lg" />
        <div>
          <h1 className="text-2xl font-display font-bold text-text tracking-tight">Team checklist approvals</h1>
          <p className="text-sm font-display text-text-muted mt-0.5">
            {total === 0
              ? 'Your department is completely clear'
              : `${total} checklist${total !== 1 ? 's' : ''} from your department waiting on review`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {isPending && (<><SkeletonRow /><SkeletonRow /></>)}
        {!isPending && instances.length === 0 && (
          <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="Nothing waiting on you right now." />
        )}
        {instances.map((instance) => <ApprovalRow key={instance.id} instance={instance} />)}
      </div>

      {!isPending && hasMore && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          className="self-center inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 cursor-pointer"
        >
          Load more ({total - instances.length} remaining)
        </button>
      )}
    </div>
  );
};
