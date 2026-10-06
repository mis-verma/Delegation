import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardCheck, Ticket as TicketIcon, Users } from 'lucide-react';
import { Combobox, type ComboboxOption } from '../../components';
import { SemiGauge } from '../../components/semiGauge/SemiGauge';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { scoreApi, type PersonScores } from '../../api/scores';
import { useAssignableUsersQuery } from '../tickets/hook';
import { PeriodTabControl } from './PeriodTabControl';
import {
  COMPLIANCE_PERIOD_OPTIONS, DASHBOARD_CARD_CLASS, PERIOD_TAB_LABEL, bucketKeyFor, periodStartDate, rateTone, shiftPeriod,
  type CompliancePeriod, type RateTone,
} from './dashboardDisplay';

const RING: Record<RateTone, [string, string]> = {
  success: ['var(--color-success)', 'var(--color-success)'],
  warning: ['var(--color-warning)', 'var(--color-warning)'],
  danger: ['var(--color-danger)', 'var(--color-danger)'],
  neutral: ['var(--color-primary-400)', 'var(--color-primary-700)'],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The calendar window a period tab means, from its first day to its last (both included).
const windowFor = (period: CompliancePeriod, offset: number) => {
  const start = periodStartDate(period, shiftPeriod(period, new Date(), offset));
  const end = new Date(start);
  if (period === 'week') end.setDate(end.getDate() + 6);
  else if (period === 'month') end.setMonth(end.getMonth() + 1, 0);
  else if (period === 'year') end.setMonth(11, 31);
  const label =
    period === 'day' ? (offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`)
    : period === 'week' ? `${start.getDate()} ${MONTHS[start.getMonth()]} to ${end.getDate()} ${MONTHS[end.getMonth()]}`
    : period === 'month' ? `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    : String(start.getFullYear());
  return { from: bucketKeyFor('day', start), to: bucketKeyFor('day', end), label };
};

interface ScoreTileProps {
  title: string;
  icon: typeof Users;
  score: number | null;
  total: number;
  detail: string;
}

const ScoreTile = ({ title, icon: Icon, score, total, detail }: ScoreTileProps) => {
  const [from, to] = RING[score === null ? 'neutral' : rateTone(score, total)];
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-hover/30 px-2 pt-3 pb-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-display font-bold text-text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{title}</span>
      </div>
      <SemiGauge percent={score ?? 0} showFill={score !== null} gradientFrom={from} gradientTo={to} ariaLabel={score === null ? `${title}: no data` : `${title}: ${score} percent`} className="max-w-48">
        <span className="font-display text-xl sm:text-2xl font-extrabold leading-none text-text">{score === null ? '–' : `${score}%`}</span>
      </SemiGauge>
      <p className="text-xs font-display text-text-muted text-center">{detail}</p>
    </div>
  );
};

/**
 * One person's checklist, ticket and delegation score for a day, week, month or year. Everyone sees
 * their own. Admin and PC can open anyone, a department head anyone in their department.
 */
export const MyScoresCard = () => {
  const { user } = useAuth();
  const canPick = !!user && !OWN_SCOPE_ROLES.includes(user.role);
  const [period, setPeriod] = useState<CompliancePeriod>('month');
  const [offset, setOffset] = useState(0);
  const [personId, setPersonId] = useState('');

  const people = useAssignableUsersQuery();
  const options = useMemo<ComboboxOption[]>(
    () => (people.data ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim() })),
    [people.data],
  );

  const range = windowFor(period, offset);
  const targetId = canPick && personId ? personId : undefined;
  const queryClient = useQueryClient();
  const scoreQuery = (userId: string | undefined, from: string, to: string) => ({
    queryKey: ['scores', 'person', userId ?? 'me', from, to],
    queryFn: () => scoreApi.person({ userId, from, to }),
    staleTime: 60_000,
  });
  const query = useQuery<PersonScores>({
    ...scoreQuery(targetId, range.from, range.to),
    // Keep the last numbers on screen while the next window loads, but only for the same person, so
    // switching person never shows someone else's score under the new name.
    placeholderData: (previous) => (previous && previous.userId === (targetId ?? user?.id ?? previous.userId) ? previous : undefined),
  });
  const data = query.data;

  // Warm the neighbouring windows so the arrows and tabs feel instant.
  useEffect(() => {
    const around = [offset - 1, ...(offset < 0 ? [offset + 1] : [])];
    for (const o of around) {
      const w = windowFor(period, o);
      void queryClient.prefetchQuery(scoreQuery(targetId, w.from, w.to));
    }
    // scoreQuery is recreated each render and closes over nothing that changes.
  }, [period, offset, targetId, queryClient]);

  return (
    <section className={`${DASHBOARD_CARD_CLASS} flex flex-col gap-4`} aria-label="Scores">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-text truncate">{targetId ? `${data?.name ?? 'Selected person'}'s scores` : 'Your scores'}</h2>
          <p className="text-xs font-display text-text-muted">Work that fell due in this {period}</p>
        </div>
        <PeriodTabControl value={period} options={COMPLIANCE_PERIOD_OPTIONS} labels={PERIOD_TAB_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {canPick && (
          <Combobox value={personId} onChange={setPersonId} options={options} emptyOptionLabel="Me" placeholder="Pick a person" isLoading={people.isPending} className="w-full sm:w-56" />
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-28 text-center text-xs font-display font-bold text-text">{range.label}</span>
          <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text disabled:opacity-40 disabled:hover:border-border">
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {query.isError && !data ? (
        <div className="rounded-lg border border-border px-4 py-6 text-center text-sm font-display text-text-muted">
          Could not load the scores.{' '}
          <button type="button" onClick={() => void query.refetch()} className="font-bold text-primary-600 dark:text-primary-400 hover:underline">Try again</button>
        </div>
      ) : (
        <div className={`grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5 transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
          <ScoreTile title="Checklist" icon={ClipboardCheck} score={data?.checklist.score ?? null} total={data?.checklist.assigned ?? 0} detail={data ? `${data.checklist.completed} of ${data.checklist.assigned} done${data.checklist.submitted ? `, ${data.checklist.approved} of ${data.checklist.submitted} approved` : ''}` : 'Loading'} />
          <ScoreTile title="Tickets" icon={TicketIcon} score={data?.ticket.score ?? null} total={data?.ticket.due ?? 0} detail={data ? `${data.ticket.onTime} of ${data.ticket.due} on time` : 'Loading'} />
          <ScoreTile title="Delegations" icon={Users} score={data?.delegation.score ?? null} total={data?.delegation.due ?? 0} detail={data ? `${data.delegation.done} of ${data.delegation.due} done` : 'Loading'} />
        </div>
      )}
    </section>
  );
};
