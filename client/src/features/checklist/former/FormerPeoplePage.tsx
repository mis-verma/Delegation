import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, CheckCheck, ChevronRight, ClipboardList, ScanSearch, Search, Store, UserMinus, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Avatar, Button, ChecklistProgressBar, DepartmentChip, ENTITY_CARD_CLASS, EmptyState, IconChip, InlineError, Input, PageHeader, PageNav,
  PANEL_CLASS, Skeleton,
} from '../../../components';
import { useAuditHistoryQuery, useFormerPeopleQuery, usePersonRunsQuery } from '../hook';
import { AuditRowCard } from '../instance/ChecklistHistory';
import { formatDate, VERIFICATION_CHIP, VERIFICATION_STATUS_LABEL } from '../checklistDisplay';
import type { FormerPerson, PersonRun } from '../../../api/checklistInstances';

const fullName = (p: Pick<FormerPerson, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName ?? ''}`.trim();
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', PC: 'PC', MANAGER: 'Manager', SENIOR: 'Senior', APPROVAL_MANAGER: 'Approval manager', USER: 'Staff', AGENT: 'Agent' };
const DAY_MS = 86_400_000;

// "3 weeks ago", for when someone left. Coarse on purpose: the exact date sits beside it.
const ago = (iso: string) => {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
};

const PersonButton = memo(({ person, selected, onSelect }: { person: FormerPerson; selected: boolean; onSelect: (id: string) => void }) => (
  <li>
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      aria-current={selected}
      className={cn(
        PANEL_CLASS,
        'flex w-full items-center gap-3 p-3 min-h-16 text-left cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        selected ? 'border-primary-500/50 bg-primary-500/10' : 'hover:border-border-hover',
      )}
    >
      <Avatar name={fullName(person)} size="md" />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-display font-semibold text-text">
          <span className="truncate">{fullName(person)}</span>
          <span className="shrink-0 text-xs font-medium text-text-muted">(left)</span>
        </span>
        <span className="text-xs font-display text-text-muted truncate">
          {[person.departmentName, `Left ${ago(person.leftAt)}`].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ChevronRight size={15} className="text-text-light shrink-0 lg:hidden" aria-hidden />
    </button>
  </li>
));
PersonButton.displayName = 'PersonButton';

const StatTile = ({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number; label: string; tone: string }) => (
  <div className={cn(PANEL_CLASS, 'flex items-center gap-3 p-3.5')}>
    <span className={cn('flex items-center justify-center size-10 rounded-xl shrink-0', tone)} aria-hidden>
      <Icon size={18} />
    </span>
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xl font-display font-bold text-text tabular-nums leading-none">{value}</span>
      <span className="text-xs font-display text-text-muted leading-snug">{label}</span>
    </div>
  </div>
);

const RunRow = memo(({ run }: { run: PersonRun }) => {
  const verification = VERIFICATION_CHIP[run.verificationStatus];
  return (
    <li>
      <Link
        to={`/checklists/${run.id}`}
        className={cn(ENTITY_CARD_CLASS, 'gap-2 p-3.5 sm:p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm font-display font-semibold text-text leading-snug line-clamp-2">{run.title}</p>
            <p className="flex items-center gap-2 text-xs font-display text-text-muted flex-wrap">
              {run.storeName && <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{run.storeName}</span>}
              <span>{formatDate(run.periodStart)}</span>
            </p>
          </div>
          <IconChip icon={verification.icon} tone={verification.tone} label={VERIFICATION_STATUS_LABEL[run.verificationStatus]} className="shrink-0" />
        </div>
        <div className="flex items-center gap-2.5">
          <ChecklistProgressBar done={run.done} total={run.total} bare thin className="flex-1" />
          <span className="text-xs font-display text-text-muted tabular-nums shrink-0">
            {run.done}/{run.total} done · {run.theirs} by them
          </span>
        </div>
      </Link>
    </li>
  );
});
RunRow.displayName = 'RunRow';

// Row-shaped, same card as a run or audit row, so nothing jumps when the history lands.
const Loading = () => (
  <div className="flex flex-col gap-2.5">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className={cn(PANEL_CLASS, 'flex flex-col gap-2.5 p-3.5 min-h-20')}>
        <Skeleton className="h-4 w-2/3 max-w-72" />
        <Skeleton className="h-3 w-1/3 max-w-40" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    ))}
  </div>
);

// The page's own skeleton: a list column and a detail column, like the real layout.
const PageLoading = () => (
  <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn(PANEL_CLASS, 'flex items-center gap-3 p-3 min-h-16')}>
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
    <div className="hidden lg:flex flex-col gap-4">
      <div className={cn(PANEL_CLASS, 'flex items-center gap-4 p-5')}>
        <Skeleton className="size-14 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={cn(PANEL_CLASS, 'flex items-center gap-3 p-3.5')}>
            <Skeleton className="size-10 rounded-xl shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <Loading />
    </div>
  </div>
);

const RunsTab = ({ personId }: { personId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, isFetching, refetch } = usePersonRunsQuery(personId, page);
  if (isPending) return <Loading />;
  if (isError) return <InlineError message="We couldn't load their checklists. Check your connection and try again." onRetry={() => refetch()} />;
  if (!data.data.length) return <EmptyState icon={ClipboardList} title="No checklists yet" description="This person was never part of a checklist run." />;
  return (
    <div className="flex flex-col gap-4">
      <ul className={cn('flex flex-col gap-2.5 transition-opacity duration-200', isFetching && 'opacity-60')}>
        {data.data.map(run => <RunRow key={run.id} run={run} />)}
      </ul>
      {data.meta.totalPages > 1 && <PageNav page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />}
    </div>
  );
};

const AuditsTab = ({ personId }: { personId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, isFetching, refetch } = useAuditHistoryQuery({ personId }, { page, limit: 10 });
  if (isPending) return <Loading />;
  if (isError) return <InlineError message="We couldn't load their audits. Check your connection and try again." onRetry={() => refetch()} />;
  if (!data.data.length) return <EmptyState icon={ClipboardList} title="No audits" description="Nobody has audited this person." />;
  return (
    <div className="flex flex-col gap-4">
      <div className={cn('flex flex-col gap-2.5 transition-opacity duration-200', isFetching && 'opacity-60')}>
        {data.data.map(row => <AuditRowCard key={row.id} row={row} />)}
      </div>
      {data.meta.totalPages > 1 && <PageNav page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />}
    </div>
  );
};

const PersonHistory = ({ person, onBack }: { person: FormerPerson; onBack: () => void }) => {
  const [tab, setTab] = useState<'runs' | 'audits'>('runs');
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start lg:hidden">
        <ArrowLeft size={16} aria-hidden />
        All former people
      </Button>

      <section className={cn(PANEL_CLASS, 'flex items-center gap-4 p-4 sm:p-5')}>
        <Avatar name={fullName(person)} size="xl" />
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-display font-bold text-text leading-snug">
              {fullName(person)} <span className="text-sm font-medium text-text-muted">(left)</span>
            </h2>
            <p className="text-xs font-display text-text-muted">
              Left {formatDate(person.leftAt)} · {ago(person.leftAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <IconChip icon={false} label={ROLE_LABEL[person.role] ?? person.role} />
            {person.departmentName && <DepartmentChip name={person.departmentName} />}
            {person.storeName && <IconChip icon={Store} tone="bg-success" label={person.storeName} />}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 min-[28rem]:grid-cols-3 gap-2.5">
        <StatTile icon={ClipboardList} value={person.runsAssigned} label="Checklists given" tone="bg-primary-500/10 text-primary-700 dark:text-primary-300" />
        <StatTile icon={CheckCheck} value={person.runsWorked} label="Filled in by them" tone="bg-success/10 text-success" />
        <StatTile icon={ScanSearch} value={person.auditsOnThem} label="Audits on them" tone="bg-warning/10 text-warning" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'runs' | 'audits')} className="gap-4">
        <TabsList aria-label="History" className="max-w-full">
          <TabsTrigger value="runs">Checklists</TabsTrigger>
          <TabsTrigger value="audits">Audits on them</TabsTrigger>
        </TabsList>
        {/* Keyed by person so switching people starts each tab on page 1. */}
        <TabsContent value="runs"><RunsTab key={person.id} personId={person.id} /></TabsContent>
        <TabsContent value="audits"><AuditsTab key={person.id} personId={person.id} /></TabsContent>
      </Tabs>
    </div>
  );
};

// Admin > Checklists > Former People: everyone who has been deactivated, with their checklist
// history kept readable after they leave. Lives here (not under Users) on purpose: it is about the
// checklists they worked on, and the Users page stays about current accounts.
export const FormerPeoplePage = () => {
  const { data: people, isPending, isError, refetch } = useFormerPeopleQuery();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const clearSelection = useCallback(() => setSelectedId(null), []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (people ?? []).filter(p => fullName(p).toLowerCase().includes(q) || (p.departmentName ?? '').toLowerCase().includes(q)) : (people ?? []);
  }, [people, query]);

  // On a wide screen the first person is open straight away, so the right side is never an empty
  // "pick someone" box. On a phone the list comes first and a tap opens the history.
  const selected = useMemo(
    () => (people ?? []).find(p => p.id === selectedId) ?? (isDesktop ? visible[0] ?? null : null),
    [people, selectedId, isDesktop, visible],
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <PageHeader
        icon={UserMinus}
        title="Former People"
        subtitle={
          people?.length
            ? `${people.length} ${people.length === 1 ? 'person has' : 'people have'} left. Their checklist history stays here, and their name carries a (left) tag everywhere else.`
            : 'Checklist history of people who have left. Their name carries a (left) tag everywhere else.'
        }
      />

      {isError && <InlineError message="We couldn't load the list. Check your connection and try again." onRetry={() => refetch()} />}

      {isPending && <PageLoading />}

      {people && people.length === 0 && (
        <EmptyState icon={Users} title="Nobody has left yet" description="People you deactivate from the Users page will show up here with their checklist history." />
      )}

      {people && people.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
          <div className={cn('flex flex-col gap-3', selected && !isDesktop && 'hidden')}>
            {people.length > 5 && (
              <Input
                label="Find a person"
                labelClassName="sr-only"
                icon={Search}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or department"
                className="h-11"
              />
            )}
            {visible.length === 0 ? (
              <p className="text-xs font-display text-text-muted px-1">Nobody matches "{query}".</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map(p => (
                  <PersonButton key={p.id} person={p} selected={p.id === selected?.id} onSelect={setSelectedId} />
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div className="min-w-0">
              <PersonHistory key={selected.id} person={selected} onBack={clearSelection} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
