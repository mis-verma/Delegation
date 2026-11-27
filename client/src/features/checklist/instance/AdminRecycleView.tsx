import { useState } from 'react';
import { RotateCcw, Store, Trash2 } from 'lucide-react';
import {
  ApprovalStatusChip, Button, EmptyState, ENTITY_CARD_CLASS, Input, InlineError, PageHeader, PageNav, Skeleton,
} from '../../../components';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/confirmDialog';
import { useRecycledChecklistRunsQuery, useRestoreChecklistRunMutation } from '../hook';
import { formatDateTime, formatDate } from '../checklistDisplay';
import type { RecycledRun } from '../../../api/checklistInstances';

const RecycledRunRow = ({ run }: { run: RecycledRun }) => {
  const confirm = useConfirm();
  const restore = useRestoreChecklistRunMutation();

  const doRestore = async () => {
    const ok = await confirm({
      title: 'Restore this run?',
      description: `"${run.title}" goes back to its normal lists and reports, exactly as it was when it was deleted.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Keep it recycled',
    });
    if (ok) restore.mutate({ id: run.id });
  };

  return (
    <li className={cn(ENTITY_CARD_CLASS, 'gap-2 p-3.5 sm:p-3.5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-display font-semibold text-text leading-snug line-clamp-2">{run.title}</p>
          <p className="flex flex-wrap items-center gap-2 t-meta font-display text-text-muted">
            {run.storeName && <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{run.storeName}</span>}
            <span>{formatDate(run.periodStart)}</span>
          </p>
        </div>
        <ApprovalStatusChip status={run.verificationStatus} className="shrink-0" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        <span className="t-meta text-text-muted">Deleted {formatDateTime(run.deletedAt)}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={restore.isPending && restore.variables?.id !== run.id}
          isLoading={restore.isPending && restore.variables?.id === run.id}
          onClick={() => void doRestore()}
        >
          {!(restore.isPending && restore.variables?.id === run.id) && <RotateCcw size={13} aria-hidden />}
          Restore
        </Button>
      </div>
    </li>
  );
};

export const AdminRecycleView = () => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const { data, isPending, isError, isFetching, refetch } = useRecycledChecklistRunsQuery({ page, limit: 20, q: q || undefined });

  return (
    <div className="view-enter flex flex-col gap-4 sm:gap-5 pt-2.5 w-full max-w-3xl mx-auto">
      <PageHeader
        icon={Trash2}
        title="Recycle bin"
        subtitle="Checklist runs an admin deleted. Restore one to put it back exactly as it was, or leave it here."
      />

      <Input
        value={q}
        onChange={(e) => { setPage(1); setQ(e.target.value); }}
        placeholder="Search by title"
        aria-label="Search recycled runs"
      />

      {isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : isError ? (
        <InlineError message="We couldn't load the recycle bin. Check your connection and try again." onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing recycled" description="Deleted checklist runs show up here, so nothing is ever lost for good." />
      ) : (
        <>
          <ul className={cn('flex flex-col gap-3', isFetching && 'opacity-60')}>
            {data.data.map((run) => <RecycledRunRow key={run.id} run={run} />)}
          </ul>
          {data.meta.totalPages > 1 && <PageNav page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
};
