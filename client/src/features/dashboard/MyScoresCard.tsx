import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardCheck, Ticket as TicketIcon, Users } from 'lucide-react';
import { Combobox, type ComboboxOption } from '../../components';
import { SemiGauge } from '../../components/semiGauge/SemiGauge';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { scoreApi, type Scores, type ScoreScope } from '../../api/scores';
import { useAssignableUsersQuery, useDepartmentsQuery, useStoresQuery } from '../tickets/hook';
import { PeriodTabControl } from './PeriodTabControl';
import { DASHBOARD_CARD_CLASS, bucketKeyFor, rateTone, type RateTone } from './dashboardDisplay';

type ScorePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
const PERIODS: readonly ScorePeriod[] = ['day', 'week', 'month', 'quarter', 'year'];
const PERIOD_LABEL: Record<ScorePeriod, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };
const SCOPE_LABEL: Record<ScoreScope, string> = { person: 'Person', department: 'Department', store: 'Store' };
const PICK_PLACEHOLDER: Record<ScoreScope, string> = { person: 'Me', department: 'Pick a department', store: 'Pick a store' };

const RING: Record<RateTone, [string, string]> = {
  success: ['var(--color-success)', 'var(--color-success)'],
  warning: ['var(--color-warning)', 'var(--color-warning)'],
  danger: ['var(--color-danger)', 'var(--color-danger)'],
  neutral: ['var(--color-primary-400)', 'var(--color-primary-700)'],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The calendar window a period tab means, first day to last day (both included), `offset` periods back.
const windowFor = (period: ScorePeriod, offset: number) => {
  const now = new Date();
  let start: Date;
  let end: Date;
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    end = start;
  } else if (period === 'week') {
    const monday = now.getDate() - ((now.getDay() + 6) % 7);
    start = new Date(now.getFullYear(), now.getMonth(), monday + offset * 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (period === 'quarter') {
    start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + offset * 3, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear(), 11, 31);
  }
  const quarterNo = Math.floor(start.getMonth() / 3) + 1;
  const label =
    period === 'day' ? (offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`)
    : period === 'week' ? (offset === 0 ? 'This week' : `${start.getDate()} ${MONTHS[start.getMonth()]} to ${end.getDate()} ${MONTHS[end.getMonth()]}`)
    : period === 'month' ? `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    : period === 'quarter' ? `Q${quarterNo} ${start.getFullYear()}`
    : String(start.getFullYear());
  return { from: bucketKeyFor('day', start), to: bucketKeyFor('day', end), label };
};

const scoreQuery = (scope: ScoreScope, id: string | undefined, from: string, to: string) => ({
  queryKey: ['scores', scope, id ?? 'me', from, to],
  queryFn: () => scoreApi.get({ scope, id, from, to }),
  staleTime: 60_000,
});

interface ScoreTileProps {
  title: string;
  icon: typeof Users;
  score: number | null;
  total: number;
  detail: string;
  loading: boolean;
}

const TONE_PILL: Record<RateTone, { label: string; className: string } | null> = {
  success: { label: 'Good', className: 'bg-success/10 text-success' },
  warning: { label: 'Fair', className: 'bg-warning/10 text-warning' },
  danger: { label: 'Low', className: 'bg-danger/10 text-danger' },
  neutral: null,
};

const ScoreTile = ({ title, icon: Icon, score, total, detail, loading }: ScoreTileProps) => {
  const tone = score === null ? 'neutral' : rateTone(score, total);
  const [from, to] = RING[tone];
  const pill = TONE_PILL[tone];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-hover/30 p-3.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-display font-bold text-text">{title}</span>
        </div>
        {pill && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-display font-bold ${pill.className}`}>{pill.label}</span>}
      </div>
      <SemiGauge percent={score ?? 0} showFill={score !== null} gradientFrom={from} gradientTo={to} ariaLabel={score === null ? `${title}: no data` : `${title}: ${score} percent`} className="mx-auto max-w-64">
        <span className="font-display text-2xl sm:text-3xl font-extrabold leading-none text-text">{score === null ? '–' : `${score}%`}</span>
      </SemiGauge>
      <p className="text-xs font-display text-text-muted text-center min-h-8">{loading ? 'Loading' : score === null ? 'Nothing was due' : detail}</p>
    </div>
  );
};

/**
 * Checklist, ticket and delegation score for a day, week, month, quarter or year. Everyone sees their
 * own. A department head can also open their own department. Admin and PC can open any person,
 * department or store.
 */
export const MyScoresCard = () => {
  const { user } = useAuth();
  const role = user?.role;
  const orgWide = role === 'ADMIN' || role === 'PC';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  const scopes = useMemo<ScoreScope[]>(
    () => (orgWide ? ['person', 'department', 'store'] : isHod ? ['person', 'department'] : ['person']),
    [orgWide, isHod],
  );
  const canPickPerson = !!role && !OWN_SCOPE_ROLES.includes(role);

  const [scope, setScope] = useState<ScoreScope>('person');
  const [period, setPeriod] = useState<ScorePeriod>('month');
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState('');

  const people = useAssignableUsersQuery();
  const departments = useDepartmentsQuery(scopes.includes('department'));
  const stores = useStoresQuery(scope === 'store');

  const options = useMemo<ComboboxOption[]>(() => {
    if (scope === 'person') return (people.data ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName ?? ''}`.trim() }));
    if (scope === 'department') {
      return (departments.data ?? []).filter((d) => orgWide || d.id === user?.departmentId).map((d) => ({ value: d.id, label: d.name }));
    }
    return (stores.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  }, [scope, people.data, departments.data, stores.data, orgWide, user?.departmentId]);

  // A head opens their own department straight away instead of seeing an empty picker.
  const effectivePick = picked || (scope === 'department' && isHod ? user?.departmentId ?? '' : '');
  const ready = scope === 'person' || !!effectivePick;
  const targetId = effectivePick || undefined;

  const range = windowFor(period, offset);
  const queryClient = useQueryClient();
  const query = useQuery<Scores>({
    ...scoreQuery(scope, targetId, range.from, range.to),
    enabled: ready,
    // Keep the last numbers on screen while the next window loads, but only for the same subject, so
    // switching person, department or store never shows one under another's name.
    placeholderData: (previous: Scores | undefined) => (previous && previous.scope === scope && (!targetId || previous.id === targetId) ? previous : undefined),
  });
  const data = ready ? query.data : undefined;
  const loading = ready && !data && query.isPending;

  // Warm the neighbouring windows so the arrows feel instant.
  useEffect(() => {
    if (!ready) return;
    for (const o of [offset - 1, ...(offset < 0 ? [offset + 1] : [])]) {
      const w = windowFor(period, o);
      void queryClient.prefetchQuery(scoreQuery(scope, targetId, w.from, w.to));
    }
  }, [ready, period, offset, scope, targetId, queryClient]);

  const heading = scope === 'person' && !targetId ? 'Your scores' : `${data?.name ?? SCOPE_LABEL[scope]} scores`;
  const showPicker = scope === 'person' ? canPickPerson : !(scope === 'department' && isHod);

  return (
    <section className={`${DASHBOARD_CARD_CLASS} flex flex-col gap-4`} aria-label="Scores">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-text truncate">{heading}</h2>
            <p className="text-xs font-display text-text-muted">Work that fell due in the window, and how much was done on time</p>
          </div>
          {scopes.length > 1 && (
            <PeriodTabControl value={scope} options={scopes} labels={SCOPE_LABEL} onChange={(next) => { setScope(next); setPicked(''); }} />
          )}
        </div>

        {showPicker && (
          <Combobox
            value={picked}
            onChange={setPicked}
            options={options}
            emptyOptionLabel={scope === 'person' ? 'Me' : undefined}
            placeholder={PICK_PLACEHOLDER[scope]}
            isLoading={scope === 'person' ? people.isPending : scope === 'department' ? departments.isPending : stores.isPending}
            className="w-full sm:w-72"
          />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <PeriodTabControl value={period} options={PERIODS} labels={PERIOD_LABEL} onChange={(next) => { setPeriod(next); setOffset(0); }} fill />
          <div className="flex items-center justify-between sm:justify-end gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-32 text-center text-xs font-display font-bold text-text">{range.label}</span>
            <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label={`Next ${period}`} className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-hover hover:text-text disabled:opacity-40 disabled:hover:border-border">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {!ready ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm font-display text-text-muted">
          Pick a {SCOPE_LABEL[scope].toLowerCase()} above to see its scores.
        </div>
      ) : query.isError && !data ? (
        <div className="rounded-lg border border-border px-4 py-6 text-center text-sm font-display text-text-muted">
          Could not load the scores.{' '}
          <button type="button" onClick={() => void query.refetch()} className="font-bold text-primary-600 dark:text-primary-400 hover:underline">Try again</button>
        </div>
      ) : (
        <div className={`grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5 transition-opacity ${query.isFetching && data ? 'opacity-60' : ''}`}>
          <ScoreTile loading={loading} title="Checklist" icon={ClipboardCheck} score={data?.checklist.score ?? null} total={data?.checklist.assigned ?? 0} detail={data ? `${data.checklist.completed} of ${data.checklist.assigned} done${data.checklist.submitted ? `, ${data.checklist.approved} of ${data.checklist.submitted} approved` : ''}` : ''} />
          <ScoreTile loading={loading} title="Tickets" icon={TicketIcon} score={data?.ticket.score ?? null} total={data?.ticket.due ?? 0} detail={data ? `${data.ticket.onTime} of ${data.ticket.due} on time` : ''} />
          <ScoreTile loading={loading} title="Delegations" icon={Users} score={data?.delegation.score ?? null} total={data?.delegation.due ?? 0} detail={data ? `${data.delegation.done} of ${data.delegation.due} done` : ''} />
        </div>
      )}
    </section>
  );
};
