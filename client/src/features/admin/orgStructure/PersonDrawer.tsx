import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, ClipboardList, Network, Repeat, Store, Ticket, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SheetGrabHandle } from '@/components/sheetGrabHandle';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../../components/ui/sheet';
import { Avatar, DepartmentChip, IconChip, InlineError, PresenceChip, RoleChip, SelectDropdown, Skeleton, StoreChip } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { useIsMobile } from '../../../lib/useMediaQuery';
import type { Department } from '../../../api/departments';
import type { Store as StoreRow } from '../../../api/stores';
import { useUpdateUserMutation } from '../hook';
import { usePersonAttention } from '../../attention/useAttention';
import { useIsReadOnlyViewer } from '../../owner/useReadOnlyViewer';
import { fullName } from './orgStructureDisplay';
import type { PeopleTree, PersonNode } from './peopleTree';
import { useCustomRoleNames } from '../customRoles/useCustomRoleNames';

const NONE = '';
const MAX_ROWS = 5;
const MAX_CHAIN = 5;

interface PersonDrawerProps {
  userId: string | null;
  tree: PeopleTree;
  stores: readonly StoreRow[];
  departments: readonly Department[];
  online: ReadonlySet<string>;
  onClose: () => void;
  onOpenUser: (userId: string) => void;
}

const Section = ({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-6">
    <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
      <Icon className="size-4 text-text-muted" aria-hidden />
      <span className="min-w-0 flex-1">{title}</span>
      {aside}
    </h3>
    {children}
  </section>
);

const PersonButton = ({ node, onOpen, hint }: { node: PersonNode; onOpen: (id: string) => void; hint?: string }) => (
  <button
    type="button"
    onClick={() => onOpen(node.id)}
    className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]"
  >
    <Avatar name={fullName(node.user)} src={resolveAvatarUrl(node.user.avatarUrl)} size="sm" />
    <span className="min-w-0 flex-1 truncate t-card font-display font-semibold text-text">{fullName(node.user)}</span>
    {hint && <span className="shrink-0 t-meta text-text-muted">{hint}</span>}
  </button>
);

const WorkRow = ({ to, title, meta, tone }: { to: string; title: string; meta: string; tone?: 'danger' }) => (
  <Link
    to={to}
    className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]"
  >
    <span className="min-w-0 flex-1 truncate t-card font-display font-semibold text-text">{title}</span>
    <span className={cn('shrink-0 t-meta font-display font-semibold', tone === 'danger' ? 'text-danger' : 'text-text-muted')}>{meta}</span>
    <ArrowUpRight className="size-3.5 shrink-0 text-text-muted" aria-hidden />
  </Link>
);

export const PersonDrawer = ({ userId, tree, stores, departments, online, onClose, onOpenUser }: PersonDrawerProps) => {
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const readOnly = useIsReadOnlyViewer();
  const node = userId ? tree.userNodes.get(userId) : undefined;
  const user = node?.user;
  const detail = usePersonAttention(userId);
  const update = useUpdateUserMutation({ successMessage: (updated) => `${fullName(updated)} updated` });
  const customRoleNames = useCustomRoleNames();

  const chain: PersonNode[] = [];
  for (let cursor = user?.reportsToId ? tree.userNodes.get(user.reportsToId) : undefined; cursor && chain.length < MAX_CHAIN && !chain.includes(cursor); cursor = cursor.user.reportsToId ? tree.userNodes.get(cursor.user.reportsToId) : undefined) {
    chain.unshift(cursor);
  }

  const storeOptions = [{ value: NONE, label: 'No store' }, ...stores.filter((s) => s.isActive || s.id === user?.storeId).map((s) => ({ value: s.id, label: s.name }))];
  const departmentOptions = [{ value: NONE, label: 'No department' }, ...departments.filter((d) => d.isActive || d.id === user?.departmentId).map((d) => ({ value: d.id, label: d.name }))];

  const changeStore = (next: string) => user && update.mutate({ id: user.id, payload: { storeId: next || null } });
  const changeDepartment = (next: string) => {
    if (!user) return;
    const placeInStore = departments.find((d) => d.id === next)?.storeId;
    update.mutate({ id: user.id, payload: { departmentId: next || null, ...(placeInStore ? { storeId: placeInStore } : {}) } });
  };

  const d = detail.data;
  const runsOpen = d ? d.runs.filter((r) => r.state !== 'submitted' && r.state !== 'upcoming').length : 0;
  const runsDone = d ? d.runs.filter((r) => r.state === 'submitted').length : 0;
  const name = user ? fullName(user) : 'Person';
  const store = stores.find((s) => s.id === user?.storeId)?.name;
  const department = departments.find((x) => x.id === user?.departmentId)?.name;

  return (
    <Sheet open={!!userId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        ref={contentRef}
        side={isMobile ? 'bottom' : 'right'}
        showCloseButton={false}
        className={cn('flex gap-0 overflow-hidden p-0 font-sans shadow-none', isMobile ? 'max-h-[92dvh] rounded-t-2xl' : 'h-full w-full sm:max-w-[480px]')}
      >
        <SheetTitle className="sr-only">{name}</SheetTitle>
        <SheetDescription className="sr-only">Reporting line, store and department, and open work for this person.</SheetDescription>
        {isMobile && <SheetGrabHandle targetRef={contentRef} onClose={onClose} />}

        {user ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <header className="flex items-start gap-3 border-b border-border/60 px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
              <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="lg" online={online.has(user.id)} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="line-clamp-2 break-words t-section font-display font-bold leading-tight text-text">{name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <RoleChip role={user.role} label={user.customRoleId ? customRoleNames.get(user.customRoleId) : undefined} />
                  {store && <StoreChip name={store} />}
                  {department && <DepartmentChip name={department} />}
                  <PresenceChip online={online.has(user.id)} text="" deactivated={!user.isActive} />
                </div>
                <p className="truncate t-meta text-text-muted">{user.email}</p>
              </div>
            </header>

            <Section icon={Network} title="Reporting line" aside={node && node.reports.length > 0 ? <IconChip icon={false} label={`${node.reports.length} direct`} labelClassName="tabular-nums" /> : undefined}>
              {chain.length === 0 && (!node || node.reports.length === 0) && <p className="t-meta font-display text-text-muted">Reports to nobody in this department and has no direct reports.</p>}
              {chain.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="t-meta font-display font-semibold text-text-secondary">Reports to</span>
                  {chain.map((boss, index) => <PersonButton key={boss.id} node={boss} onOpen={onOpenUser} hint={index === chain.length - 1 ? 'Manager' : undefined} />)}
                </div>
              )}
              {node && node.reports.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="t-meta font-display font-semibold text-text-secondary">Direct reports</span>
                  {node.reports.slice(0, MAX_ROWS).map((report) => <PersonButton key={report.id} node={report} onOpen={onOpenUser} />)}
                  {node.reports.length > MAX_ROWS && <span className="t-meta text-text-muted">and {node.reports.length - MAX_ROWS} more</span>}
                </div>
              )}
            </Section>

            <Section icon={Store} title="Store and department">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="t-meta font-display font-semibold text-text-secondary">Store</span>
                  <SelectDropdown aria-label="Store" value={user.storeId ?? NONE} options={storeOptions} onChange={changeStore} disabled={readOnly || update.isPending} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="t-meta font-display font-semibold text-text-secondary">Department</span>
                  <SelectDropdown aria-label="Department" value={user.departmentId ?? NONE} options={departmentOptions} onChange={changeDepartment} disabled={readOnly || update.isPending} />
                </div>
              </div>
              <p className="t-meta font-display text-text-muted">Picking a department also moves them to that department&apos;s store.</p>
            </Section>

            <Section icon={ClipboardList} title="Today's checklists" aside={d ? <IconChip icon={false} label={`${runsDone} done, ${runsOpen} open`} labelClassName="tabular-nums" /> : undefined}>
              {detail.isPending ? <Skeleton className="h-16 rounded-xl" /> : detail.isError ? (
                <InlineError message="Couldn't load their work." onRetry={() => { void detail.refetch(); }} />
              ) : d && d.runs.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {d.runs.slice(0, MAX_ROWS).map((run) => (
                    <WorkRow key={run.id} to={`/checklists/${run.id}`} title={run.title} meta={`${run.doneItems}/${run.totalItems}`} tone={run.state === 'missed' ? 'danger' : undefined} />
                  ))}
                  {d.runs.length > MAX_ROWS && <span className="t-meta text-text-muted">and {d.runs.length - MAX_ROWS} more</span>}
                </div>
              ) : <p className="t-meta font-display text-text-muted">No checklists today.</p>}
            </Section>

            <Section icon={Ticket} title="Open tickets" aside={d ? <IconChip icon={false} label={String(d.tickets.length)} labelClassName="tabular-nums" /> : undefined}>
              {d && d.tickets.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {d.tickets.slice(0, MAX_ROWS).map((t) => <WorkRow key={t.id} to={`/tickets?open=${t.id}`} title={t.title} meta={t.isOverdue ? 'Overdue' : 'Open'} tone={t.isOverdue ? 'danger' : undefined} />)}
                </div>
              ) : <p className="t-meta font-display text-text-muted">{detail.isPending ? 'Loading' : 'No open tickets.'}</p>}
            </Section>

            <Section icon={Repeat} title="Open delegations" aside={d ? <IconChip icon={false} label={String(d.delegations.length)} labelClassName="tabular-nums" /> : undefined}>
              {d && d.delegations.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {d.delegations.slice(0, MAX_ROWS).map((t) => <WorkRow key={t.id} to={`/tasks?open=${t.id}`} title={t.title} meta={t.overdue ? 'Overdue' : 'Open'} tone={t.overdue ? 'danger' : undefined} />)}
                </div>
              ) : <p className="t-meta font-display text-text-muted">{detail.isPending ? 'Loading' : 'No open delegations.'}</p>}
            </Section>

            <div className="flex px-4 py-4 sm:px-6">
              <Link
                to={`/admin/directory?tab=users&q=${encodeURIComponent(user.email)}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <UserRound className="size-4" aria-hidden />
                Open in Users
              </Link>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
