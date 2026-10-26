import { useCallback, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../../components';
import { ChecklistList } from '../../verification/ChecklistList';
import { ReviewSheet, type SendBackPayload } from '../../verification/ReviewPane';
import { approveRun, rejectRun, sendBackRun } from '../../verification/decisionRequests';
import {
  useChecklistQueueQuery, useChecklistRows, useNow, useQueueLookups, useVisibleChecklistRows, type ChecklistFilters,
} from '../../verification/useChecklistQueue';
import { useDeferredDecisions } from '../../verification/useDeferredDecisions';
import { useRefreshAfterDecision } from '../../verification/useRefreshAfterDecision';
import { useReviewDraft } from '../../verification/useReviewDraft';
import { formatWaiting, type ChecklistRow } from '../../verification/verificationModel';
import type { ChecklistInstance } from '../../../api/checklistInstances';

const NO_INSTANCES: ChecklistInstance[] = [];

const OLDEST_FIRST: ChecklistFilters = { q: '', store: null, dept: null, person: null, age: 'any', attention: false, sort: 'oldest' };

export const ChecklistApprovals = ({ embedded = false }: { embedded?: boolean }) => {
  const now = useNow();
  const query = useChecklistQueueQuery();
  const instances = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? NO_INSTANCES, [query.data]);
  const total = query.data?.pages[0]?.meta?.total ?? instances.length;
  const lookups = useQueueLookups();
  const allRows = useChecklistRows(instances, lookups);

  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });
  const rows = useVisibleChecklistRows(allRows, OLDEST_FIRST, heldIds, now);

  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);
  const draft = useReviewDraft(openRow?.id ?? null);
  const { startSendBackFor } = draft;

  const heldInLoaded = allRows.reduce((n, r) => n + (heldIds.has(r.id) ? 1 : 0), 0);
  const waiting = Math.max(0, total - heldInLoaded);
  const oldest = rows.length ? rows[0].waitingSince : null;

  const approve = useCallback((id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setOpenId(null);
    schedule({ id, verb: 'Approved', label: row.instance.title, run: approveRun(id) });
  }, [rows, schedule]);

  const sendBack = useCallback((row: ChecklistRow, payload: SendBackPayload) => {
    setOpenId(null);
    schedule({
      id: row.id,
      verb: 'Sent back',
      label: row.instance.title,
      run: payload.itemIds.length ? sendBackRun(row.id, payload.itemIds, payload.note) : rejectRun(row.id, payload.note),
    });
  }, [schedule]);

  const approveFromSheet = useCallback((row: ChecklistRow) => approve(row.id), [approve]);
  const startSendBack = useCallback((id: string) => { startSendBackFor(id); setOpenId(id); }, [startSendBackFor]);
  const closeSheet = useCallback(() => setOpenId(null), []);

  const subtitle = query.isPending
    ? <span className="block h-4 w-56 animate-pulse rounded-md bg-surface-active" aria-hidden />
    : query.isError && !query.data
      ? 'The queue could not be loaded.'
      : waiting === 0
        ? 'Your department is completely clear'
        : `${waiting} checklist${waiting !== 1 ? 's' : ''} from your department waiting on review${oldest ? `. Oldest waiting: ${formatWaiting(oldest, now)}` : ''}`;

  return (
    <div className="flex flex-col gap-6 w-full">
      {embedded ? (
        <p className="t-meta font-medium text-text-muted">{subtitle}</p>
      ) : (
        <PageHeader icon={ShieldCheck} title="Checklist approvals" subtitle={subtitle} />
      )}

      <ChecklistList
        rows={rows}
        now={now}
        activeId={openId}
        isPending={query.isPending}
        loadFailed={query.isError && !query.data}
        onRetry={() => { void query.refetch(); }}
        filtersActive={false}
        onClearFilters={() => undefined}
        hasMore={!!query.hasNextPage}
        remaining={Math.max(0, total - instances.length)}
        isFetchingMore={query.isFetchingNextPage}
        onLoadMore={() => { void query.fetchNextPage(); }}
        showDepartment={false}
        inlineActions="always"
        heading="Waiting for review"
        onOpen={setOpenId}
        onApprove={approve}
        onSendBack={startSendBack}
      />

      <ReviewSheet row={openRow} draft={draft} onApprove={approveFromSheet} onSendBack={sendBack} onClose={closeSheet} />
    </div>
  );
};
