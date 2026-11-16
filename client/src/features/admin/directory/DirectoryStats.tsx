import { memo, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Building2, MapPinOff, Radio, Store, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp, PANEL_CLASS, Skeleton } from '../../../components';
import { useDepartmentsQuery, usePresenceQuery, useUsersQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { useLeaveQuery } from '../../leave/hook';
import { useOrgToday } from '../../checklist/useOrgToday';
import { buildOrgSnapshot, type OrgSnapshot, type SnapshotRow } from './orgSnapshot';

type TileKey = 'people' | 'online' | 'departments' | 'stores' | 'toPlace';
type PartTone = 'neutral' | 'warning' | 'live';

interface Part {
  key: string;
  label: string;
  value: number | null;
  to: string;
  tone: PartTone;
}

interface TileSchema {
  label: string;
  icon: LucideIcon;
  tile: string;
  to: string;
  total: (s: OrgSnapshot) => number | null;
  parts: (s: OrgSnapshot) => Part[];
  alert?: (s: OrgSnapshot) => boolean;
}

const href = (tab: string, filters: Record<string, string> = {}): string => `?${new URLSearchParams({ tab, ...filters }).toString()}`;

const rowParts = (rows: readonly SnapshotRow[], to: (row: SnapshotRow) => string, tone: PartTone = 'neutral'): Part[] =>
  rows.map((row) => ({ key: row.id, label: row.label, value: row.count, to: to(row), tone }));

const TILES: Record<TileKey, TileSchema> = {
  people: {
    label: 'People',
    icon: Users,
    tile: 'bg-primary-800',
    to: href('users', { status: 'active' }),
    total: (s) => s.counts.activePeople,
    parts: (s) => [
      { key: 'active', label: 'Active', value: s.counts.activePeople, to: href('users', { status: 'active' }), tone: 'neutral' },
      { key: 'inactive', label: 'Deactivated', value: s.counts.deactivated, to: href('users', { status: 'inactive' }), tone: 'neutral' },
      { key: 'leave', label: 'On leave', value: s.onLeave, to: '/leave', tone: 'neutral' },
    ],
  },
  online: {
    label: 'Online now',
    icon: Radio,
    tile: 'bg-success',
    to: href('online'),
    total: (s) => s.online,
    parts: (s) => rowParts(s.onlineByStore, (row) => href('online', { store: row.id }), 'live'),
  },
  departments: {
    label: 'Departments',
    icon: Building2,
    tile: 'bg-coral-500',
    to: href('departments', { status: 'active' }),
    total: (s) => s.counts.activeDepartments,
    parts: (s) => rowParts(s.topDepartments, (row) => href('users', { dept: row.id, status: 'active' })),
  },
  stores: {
    label: 'Stores',
    icon: Store,
    tile: 'bg-info',
    to: href('stores', { status: 'active' }),
    total: (s) => s.counts.activeStores,
    parts: (s) => rowParts(s.storeHeadcounts, (row) => href('users', { store: row.id, status: 'active' })),
  },
  toPlace: {
    label: 'To place',
    icon: MapPinOff,
    tile: 'bg-success',
    to: href('users', { status: 'active' }),
    total: (s) => s.counts.unplaced,
    alert: (s) => s.counts.unplaced > 0,
    parts: (s) => [
      { key: 'nostore', label: 'No store', value: s.counts.noStore, to: href('users', { status: 'active', nostore: '1' }), tone: s.counts.noStore > 0 ? 'warning' : 'neutral' },
      { key: 'nodept', label: 'No department', value: s.counts.noDepartment, to: href('users', { status: 'active', nodept: '1' }), tone: s.counts.noDepartment > 0 ? 'warning' : 'neutral' },
      { key: 'invited', label: 'Not signed in yet', value: s.notSignedIn, to: href('users', { status: 'active', invited: '1' }), tone: (s.notSignedIn ?? 0) > 0 ? 'warning' : 'neutral' },
    ],
  },
};

const TILE_ORDER: readonly TileKey[] = ['people', 'online', 'departments', 'stores', 'toPlace'];

const ROW_CLASS = 'relative z-10 -mx-1 flex min-h-8 min-w-0 items-center justify-between gap-2 rounded-md px-1 t-meta outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-fine:min-h-6';

const COUNT_TONE: Record<PartTone, string> = {
  neutral: 'text-text',
  warning: 'rounded-md bg-warning/15 px-1.5 text-warning',
  live: 'text-success',
};

const PartRow = ({ part, loading }: { part: Part; loading: boolean }) => (
  <Link to={part.to} replace className={ROW_CLASS}>
    <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
      {part.tone === 'live' && <span className="live-dot size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />}
      <span className="min-w-0 truncate">{part.label}</span>
    </span>
    {loading || part.value === null
      ? <Skeleton className="h-3.5 w-5 shrink-0" />
      : <span className={cn('shrink-0 font-bold tabular-nums', part.value === 0 ? 'text-text-light' : COUNT_TONE[part.tone])}>{part.value}</span>}
  </Link>
);

interface StatTileProps {
  schema: TileSchema;
  snapshot: OrgSnapshot;
  loading: boolean;
  index: number;
}

const StatTile = memo(({ schema, snapshot, loading, index }: StatTileProps) => {
  const Icon = schema.icon;
  const total = schema.total(snapshot);
  const alert = schema.alert?.(snapshot) ?? false;
  const parts = schema.parts(snapshot);
  return (
    <div
      style={{ '--stat-delay': `${index * 60}ms` } as CSSProperties}
      className={cn(PANEL_CLASS, 'stat-rise relative flex min-h-44 min-w-0 flex-col justify-between gap-3 p-3 transition-colors duration-150 ease-out hover:border-border-hover sm:p-4')}
    >
      <Link
        to={schema.to}
        replace
        aria-label={`${schema.label}${total === null ? '' : `, ${total}`}`}
        className="absolute inset-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50"
      />
      <span className="pointer-events-none flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', alert ? 'bg-warning' : schema.tile)} aria-hidden="true">
            <Icon className="size-[1.125rem]" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 truncate t-card font-display font-bold text-text">{schema.label}</span>
        </span>
        {loading ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <span className={cn('t-figure font-display font-extrabold leading-none tabular-nums', alert ? 'rounded-lg bg-warning/15 px-2 py-1 text-warning' : 'text-text')}>
            {total === null ? '-' : <CountUp value={total} fromZero />}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 border-t border-border/50 pt-2">
        {parts.length === 0 && !loading
          ? <span className="t-meta text-text-muted">Nothing yet</span>
          : parts.map((part) => <PartRow key={part.key} part={part} loading={loading} />)}
      </span>
    </div>
  );
});
StatTile.displayName = 'StatTile';

export const DirectoryStats = () => {
  const users = useUsersQuery();
  const departments = useDepartmentsQuery();
  const stores = useStoresQuery();
  const presence = usePresenceQuery();
  const leave = useLeaveQuery();
  const today = useOrgToday();

  const snapshot = useMemo(
    () => buildOrgSnapshot(users.data, departments.data, stores.data, presence.data, leave.data, today),
    [users.data, departments.data, stores.data, presence.data, leave.data, today],
  );
  const loading = users.isPending || departments.isPending || stores.isPending;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1" aria-label="Overview">
      {TILE_ORDER.map((key, index) => (
        <StatTile key={key} schema={TILES[key]} snapshot={snapshot} loading={loading} index={index} />
      ))}
    </div>
  );
};
