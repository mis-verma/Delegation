import { useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ArrowLeft, ChevronRight, ClipboardList, Store, UserMinus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState, GradientIconTile, PageNav, Skeleton } from '../../../components';
import { useAuditHistoryQuery, useFormerPeopleQuery, usePersonRunsQuery } from '../hook';
import { AuditRowCard } from '../instance/ChecklistHistory';
import { formatDate, VERIFICATION_BADGE_VARIANT, VERIFICATION_STATUS_LABEL } from '../checklistDisplay';
import type { FormerPerson, PersonRun } from '../../../api/checklistInstances';

const fullName = (p: Pick<FormerPerson, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName ?? ''}`.trim();
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', PC: 'PC', MANAGER: 'Manager', SENIOR: 'Senior', APPROVAL_MANAGER: 'Approval manager', USER: 'Staff', AGENT: 'Agent' };

const PersonButton = ({ person, selected, onSelect }: { person: FormerPerson; selected: boolean; onSelect: () => void }) => (
  <li>
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'flex w-full items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        selected ? 'border-primary-500/50 bg-primary-500/10' : 'border-border/60 bg-surface hover:border-border-hover',
      )}
    >
      <span className="flex items-center justify-center size-9 rounded-full bg-surface-hover text-sm font-display font-semibold text-text-secondary shrink-0" aria-hidden>
        {person.firstName[0]?.toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-display font-semibold text-text">
          <span className="truncate">{fullName(person)}</span>
          <span className="shrink-0 text-xs font-medium text-text-muted">(left)</span>
        </span>
        <span className="block text-xs font-display text-text-muted truncate">
          {[person.departmentName, `Left ${formatDate(person.leftAt)}`].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ChevronRight size={15} className="text-text-light shrink-0 lg:hidden" aria-hidden />
    </button>
  </li>
);

const StatTile = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col gap-0.5 p-3.5 rounded-xl border border-border/60 bg-surface">
    <span className="text-xl font-display font-bold text-text tabular-nums">{value}</span>
    <span className="text-xs font-display text-text-muted">{label}</span>
  </div>
);

const RunRow = ({ run }: { run: PersonRun }) => {
  const percent = run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <li>
      <Link
        to={`/checklists/${run.id}`}
        className="flex flex-col gap-2 p-3.5 rounded-xl border border-border/60 bg-surface hover:border-border-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-display font-semibold text-text leading-snug line-clamp-2">{run.title}</p>
            <p className="flex items-center gap-2 mt-0.5 text-xs font-display text-text-muted flex-wrap">
              {run.storeName && <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{run.storeName}</span>}
              <span>{formatDate(run.periodStart)}</span>
            </p>
          </div>
          <Badge variant={VERIFICATION_BADGE_VARIANT[run.verificationStatus]}>{VERIFICATION_STATUS_LABEL[run.verificationStatus]}</Badge>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-display text-text-muted tabular-nums shrink-0">
            {run.done}/{run.total} done · {run.theirs} by them
          </span>
        </div>
      </Link>
    </li>
  );
};

const Loading = () => (
  <div className="flex flex-col gap-2.5">
    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
  </div>
);

const RunsTab = ({ personId }: { personId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = usePersonRunsQuery(personId, page);
  if (isPending) return <Loading />;
  if (isError) return <p className="text-xs font-display text-danger">We couldn't load their checklists. Try again in a moment.</p>;
  if (!data.data.length) return <EmptyState icon={ClipboardList} title="No checklists yet" description="This person was never part of a checklist run." />;
  return (
    <>
      <ul className="flex flex-col gap-2.5">{data.data.map(run => <RunRow key={run.id} run={run} />)}</ul>
      {data.meta.totalPages > 1 && <PageNav page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />}
    </>
  );
};

const AuditsTab = ({ personId }: { personId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useAuditHistoryQuery({ personId }, { page, limit: 10 });
  if (isPending) return <Loading />;
  if (isError) return <p className="text-xs font-display text-danger">We couldn't load their audits. Try again in a moment.</p>;
  if (!data.data.length) return <EmptyState icon={ClipboardList} title="No audits" description="Nobody has audited this person." />;
  return (
    <>
      <div className="flex flex-col gap-2.5">{data.data.map(row => <AuditRowCard key={row.id} row={row} />)}</div>
      {data.meta.totalPages > 1 && <PageNav page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />}
    </>
  );
};

const PersonHistory = ({ person, onBack }: { person: FormerPerson; onBack: () => void }) => {
  const [tab, setTab] = useState<'runs' | 'audits'>('runs');
  const tabs = [
    { value: 'runs' as const, label: 'Checklists' },
    { value: 'audits' as const, label: `Audits on them` },
  ];
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 w-fit h-9 pl-2 pr-3 -ml-2 rounded-full text-sm font-display font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 lg:hidden"
      >
        <ArrowLeft size={16} />
        All former people
      </button>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-display font-semibold text-text">{fullName(person)} <span className="text-sm font-medium text-text-muted">(left)</span></h2>
        <p className="text-xs font-display text-text-muted">
          {[ROLE_LABEL[person.role] ?? person.role, person.departmentName, person.storeName, `Left ${formatDate(person.leftAt)}`].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile value={person.runsAssigned} label="Checklists given" />
        <StatTile value={person.runsWorked} label="Filled in by them" />
        <StatTile value={person.auditsOnThem} label="Audits on them" />
      </div>

      <div role="tablist" aria-label="History" className="flex gap-1.5">
        {tabs.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'h-9 px-3.5 rounded-full border text-xs font-display font-semibold cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              tab === t.value ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keyed by person so switching people starts each tab on page 1. */}
      {tab === 'runs' ? <RunsTab key={person.id} personId={person.id} /> : <AuditsTab key={person.id} personId={person.id} />}
    </div>
  );
};

// Admin > Checklists > Former People: everyone who has been deactivated, with their checklist
// history kept readable after they leave. Lives here (not under Users) on purpose: it is about the
// checklists they worked on, and the Users page stays about current accounts.
export const FormerPeoplePage = () => {
  const { data: people, isPending, isError } = useFormerPeopleQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = people?.find(p => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={UserMinus} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Former People</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Checklist history of people who have left. Their name carries a (left) tag everywhere else.
          </p>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger font-display">
          <AlertCircle size={16} className="shrink-0" />
          We couldn't load the list. Check your connection and try again.
        </div>
      )}

      {isPending && <Loading />}

      {people && people.length === 0 && (
        <EmptyState icon={Users} title="Nobody has left yet" description="People you deactivate from the Users page will show up here with their checklist history." />
      )}

      {people && people.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <ul className={cn('flex flex-col gap-2', selected && 'hidden lg:flex')}>
            {people.map(p => (
              <PersonButton key={p.id} person={p} selected={p.id === selectedId} onSelect={() => setSelectedId(p.id)} />
            ))}
          </ul>

          <div className={cn(!selected && 'hidden lg:block')}>
            {selected ? (
              <PersonHistory person={selected} onBack={() => setSelectedId(null)} />
            ) : (
              <EmptyState icon={UserMinus} title="Pick a person" description="Choose someone on the left to read their checklist history." />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
