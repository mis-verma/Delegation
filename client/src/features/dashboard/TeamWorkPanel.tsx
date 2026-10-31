import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { InlineError } from '../../components/inlineError';
import { WaitChip, StatusBadge } from '../../components';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import { AttentionPersonRow, AttentionRowSkeleton } from '../attention/AttentionParts';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { remindedRecently } from '../attention/attentionDisplay';
import { useAttentionPeople, useNow, useRemindMutation } from '../attention/useAttention';
import { ACTIVITY_CATEGORY_LABEL, type ActivityCategory } from './dashboardDisplay';
import { CATEGORY_PILL } from './categoryLook';
import { useApprovalSources } from './useApprovalSources';

const PEOPLE_PREVIEW = 4;
const APPROVAL_PEOPLE_PREVIEW = 5;
const UNKNOWN = 'Someone';

interface Waiting {
  name: string;
  counts: Record<ActivityCategory, number>;
  since: string;
}

const emptyCounts = (): Record<ActivityCategory, number> => ({ checklist: 0, delegation: 0, ticket: 0, todo: 0 });

const countLabel = (category: ActivityCategory, n: number) => `${n} ${ACTIVITY_CATEGORY_LABEL[category].toLowerCase()}${n === 1 ? '' : 's'}`;

interface WaitingRow {
  category: ActivityCategory;
  person: string | null | undefined;
  since: string;
}

const groupWaiting = (rows: WaitingRow[]): Waiting[] => {
  const byPerson = new Map<string, Waiting>();
  for (const row of rows) {
    const name = row.person?.trim() || UNKNOWN;
    const entry = byPerson.get(name) ?? { name, counts: emptyCounts(), since: row.since };
    entry.counts[row.category] += 1;
    if (new Date(row.since).getTime() < new Date(entry.since).getTime()) entry.since = row.since;
    byPerson.set(name, entry);
  }
  return [...byPerson.values()].sort((x, y) => new Date(x.since).getTime() - new Date(y.since).getTime());
};

export const TeamWorkPanel = () => {
  const people = useAttentionPeople();
  const remind = useRemindMutation();
  const sources = useApprovalSources();
  const now = useNow();
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAllApprovals, setShowAllApprovals] = useState(false);

  const waiting = useMemo<Waiting[]>(
    () => groupWaiting([
      ...(sources.tickets.data?.rows ?? []).map((t): WaitingRow => ({ category: 'ticket', person: t.submittedBy, since: t.waitingSince })),
      ...(sources.tasks.data?.rows ?? []).map((t): WaitingRow => ({ category: 'delegation', person: t.submittedBy, since: t.waitingSince })),
      ...(sources.checklists.data?.rows ?? []).map((c): WaitingRow => ({ category: 'checklist', person: c.submittedBy ?? c.storeName, since: c.waitingSince })),
    ]),
    [sources.tickets.data, sources.tasks.data, sources.checklists.data],
  );

  const peopleRows = people.data ?? [];
  const approvalTotal = sources.total;
  const approvalsHref = sources.queueHref ?? '/tickets/approvals';
  const nothing = !people.isPending && !sources.isPending && peopleRows.length === 0 && waiting.length === 0;

  return (
    <section aria-labelledby="team-work-heading" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <h2 id="team-work-heading" className="t-section font-display font-bold tracking-tight text-text">Your team today</h2>
        {!people.isPending && !sources.isPending && (approvalTotal > 0 || peopleRows.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {approvalTotal > 0 && <StatusBadge variant="neutral" icon={false} label={`${approvalTotal} to approve`} />}
            {peopleRows.length > 0 && <StatusBadge variant="critical" icon={false} label={`${peopleRows.length} behind`} />}
          </div>
        )}
      </div>

      {sources.hasError && (
        <div className="px-4 pb-3">
          <InlineError message="Some approvals didn't load, so this list may be incomplete." />
        </div>
      )}

      {people.isPending || sources.isPending ? (
        <div className="flex flex-col divide-y divide-border/60 border-t border-border/60" role="status" aria-label="Loading your team">
          <AttentionRowSkeleton />
          <AttentionRowSkeleton />
        </div>
      ) : people.isError && !people.data ? (
        <div className="border-t border-border/60 px-4 py-3">
          <InlineError message="Couldn't load your team." onRetry={() => void people.refetch()} />
        </div>
      ) : nothing ? (
        <div className="flex flex-col items-center gap-1 border-t border-border/60 px-4 py-8 text-center">
          <p className="t-card font-display font-semibold text-text">Your team is on track</p>
          <p className="t-meta text-text-muted">Nobody is behind and nothing waits for your approval.</p>
        </div>
      ) : (
        <>
          {waiting.length > 0 && (
            <div className="flex flex-col border-t border-border/60">
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
                <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
                  Waiting for your approval
                  <span className="t-meta font-semibold text-text-muted tabular-nums">{approvalTotal}</span>
                </h3>
                <Link to={approvalsHref} viewTransition className="inline-flex min-h-9 items-center rounded-full border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11">
                  Open
                </Link>
              </div>
              <ul className="flex flex-col divide-y divide-border/60">
                {(showAllApprovals ? waiting : waiting.slice(0, APPROVAL_PEOPLE_PREVIEW)).map((entry) => (
                  <li key={entry.name}>
                    <Link
                      to={approvalsHref}
                      viewTransition
                      className="flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover active:bg-surface-hover"
                    >
                      <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-full t-card font-display font-bold text-white', avatarColorClass(entry.name))}>
                        {getInitials(entry.name).slice(0, 2)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="line-clamp-1 t-card font-display font-semibold text-text">{entry.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {(Object.keys(entry.counts) as ActivityCategory[]).filter((c) => entry.counts[c] > 0).map((c) => (
                            <span key={c} className={cn('rounded-full px-2 py-0.5 t-meta font-display font-bold', CATEGORY_PILL[c])}>{countLabel(c, entry.counts[c])}</span>
                          ))}
                          <WaitChip since={entry.since} now={now} />
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              {waiting.length > APPROVAL_PEOPLE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllApprovals((open) => !open)}
                  aria-expanded={showAllApprovals}
                  className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 t-meta font-display font-semibold text-vivid-blue-text outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
                >
                  {showAllApprovals ? 'Show fewer people' : `Show ${waiting.length - APPROVAL_PEOPLE_PREVIEW} more people`}
                  <ChevronRight className={cn('size-3.5 transition-transform duration-200', showAllApprovals ? '-rotate-90' : 'rotate-90')} aria-hidden />
                </button>
              )}
              {approvalTotal > waiting.reduce((sum, w) => sum + Object.values(w.counts).reduce((a, b) => a + b, 0), 0) && (
                <p className="px-4 pb-2.5 t-meta text-text-muted">The oldest of each type are shown. Open the queue to see all {approvalTotal}.</p>
              )}
            </div>
          )}

          {peopleRows.length > 0 && (
            <div className="flex flex-col border-t border-border/60">
              <h3 className="flex items-center gap-2 px-4 pt-3 pb-1 t-card font-display font-bold text-text">
                People behind
                <span className="t-meta font-semibold text-text-muted tabular-nums">{peopleRows.length}</span>
              </h3>
              <div className="flex flex-col divide-y divide-border/60">
                {peopleRows.slice(0, PEOPLE_PREVIEW).map((p) => (
                  <AttentionPersonRow
                    key={p.userId}
                    person={p}
                    onOpen={setOpenPerson}
                    onRemind={(userId) => remind.mutate([userId])}
                    reminding={remind.isPending}
                    reminded={remindedRecently(p.lastRemindedAt, now)}
                    minimal
                  />
                ))}
              </div>
              {peopleRows.length > PEOPLE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 t-meta font-display font-semibold text-vivid-blue-text outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
                >
                  See all {peopleRows.length} people
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </>
      )}

      <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
      <AttentionAllSheet open={showAll} onClose={() => setShowAll(false)} people={peopleRows} onOpenPerson={setOpenPerson} />
    </section>
  );
};
