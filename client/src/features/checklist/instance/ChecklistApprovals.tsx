import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { PageHeader, SearchField } from '../../../components';
import { ChecklistApprovalStats, type ApprovalStatKey } from './ChecklistApprovalStats';
import { ChecklistList } from '../../verification/ChecklistList';
import { ReviewSheet, type SendBackPayload } from '../../verification/ReviewPane';
import { approveRun, rejectRun, sendBackRun, type ItemRemark } from '../../verification/decisionRequests';
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

const DAY_MS = 24 * 60 * 60 * 1000;

const isStatKey = (value: string | null): value is ApprovalStatKey => value === 'old' || value === 'attention';

export const ChecklistApprovals = ({ embedded = false }: { embedded?: boolean }) => {
  const now = useNow();
  const query = useChecklistQueueQuery();
  const instances = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? NO_INSTANCES, [query.data]);
  const total = query.data?.pages[0]?.meta?.total ?? instances.length;
  const lookups = useQueueLookups();
  const allRows = useChecklistRows(instances, lookups);

  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });

  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const stat = isStatKey(params.get('show')) ? (params.get('show') as ApprovalStatKey) : null;
  const patch = useCallback((key: string, value: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true }), [setParams]);

  const filters = useMemo<ChecklistFilters>(
    () => ({ ...OLDEST_FIRST, q: search, age: stat === 'old' ? '1' : 'any', attention: stat === 'attention' }),
    [search, stat],
  );
  const rows = useVisibleChecklistRows(allRows, filters, heldIds, now);
  const queueRows = useMemo(() => allRows.filter((row) => !heldIds.has(row.id)), [allRows, heldIds]);
  const counts = useMemo(() => ({
    waiting: queueRows.length,
    old: queueRows.filter((row) => now - row.waitingSince >= DAY_MS).length,
    attention: queueRows.filter((row) => row.risk.needsAttention).length,
  }), [queueRows, now]);

  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);
  const draft = useReviewDraft(openRow?.id ?? null);
  const { startSendBackFor } = draft;

  const heldInLoaded = allRows.reduce((n, r) => n + (heldIds.has(r.id) ? 1 : 0), 0);
  const waiting = Math.max(0, total - heldInLoaded);
  const oldest = rows.length ? rows[0].waitingSince : null;

  const approve = useCallback((id: string, itemRemarks?: ItemRemark[]) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setOpenId(null);
    schedule({ id, kind: 'checklist', verb: 'Approved', label: row.instance.title, run: approveRun(id, itemRemarks) });
  }, [rows, schedule]);

  const sendBack = useCallback((row: ChecklistRow, payload: SendBackPayload) => {
    setOpenId(null);
    schedule({
      id: row.id,
      kind: 'checklist',
      verb: 'Sent back',
      label: row.instance.title,
      run: payload.itemIds.length ? sendBackRun(row.id, payload.itemIds, payload.note, payload.fixByHours, payload.photoOnlyItemIds) : rejectRun(row.id, payload.note, payload.fixByHours),
    });
  }, [schedule]);

  const approveFromSheet = useCallback((row: ChecklistRow, itemRemarks?: ItemRemark[]) => approve(row.id, itemRemarks), [approve]);
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

      <div className="flex flex-col gap-3">
        <ChecklistApprovalStats
          counts={counts}
          active={stat}
          onToggle={(key) => patch('show', key === 'waiting' || key === stat ? '' : key)}
          isLoading={query.isPending && !query.data}
          error={query.isError && !query.data}
          onRetry={() => { void query.refetch(); }}
        />
        <div className="sm:max-w-sm">
          <SearchField value={search} onChange={(value) => patch('q', value)} label="Search checklists" placeholder="Search checklist, store or person..." />
        </div>
      </div>

      <ChecklistList
        rows={rows}
        activeId={openId}
        isPending={query.isPending}
        loadFailed={query.isError && !query.data}
        onRetry={() => { void query.refetch(); }}
        filtersActive={!!search || !!stat}
        onClearFilters={() => setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('q');
          next.delete('show');
          return next;
        }, { replace: true })}
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
