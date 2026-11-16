import { useMemo, type CSSProperties } from 'react';
import { Building2, CircleAlert, CircleCheck, MapPinOff, Radio, Store, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp, IconChip, PANEL_CLASS, Skeleton } from '../../../components';
import { useDepartmentsQuery, usePresenceQuery, useUsersQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { countOrg, onlineActive, unplacedCaption } from './orgCounts';

type StatTab = 'users' | 'departments' | 'stores' | 'online';

interface Tile {
  key: string;
  icon: LucideIcon;
  tile: string;
  label: string;
  value: number | null;
  caption: { text: string; tone: 'bg-success' | 'bg-warning' | 'bg-text-muted' | 'bg-primary-600' | 'bg-danger'; icon: LucideIcon } | null;
  tab: StatTab;
}

const TILE = {
  primary: 'bg-primary-800',
  success: 'bg-success',
  coral: 'bg-coral-500',
  info: 'bg-info',
  warning: 'bg-warning',
} as const;

export const DirectoryStats = ({ onOpen }: { onOpen: (tab: StatTab) => void }) => {
  const users = useUsersQuery();
  const departments = useDepartmentsQuery();
  const stores = useStoresQuery();
  const presence = usePresenceQuery();

  const tiles = useMemo<Tile[]>(() => {
    const c = countOrg(users.data, departments.data, stores.data);
    const online = onlineActive(users.data, presence.data);
    const offCaption = (n: number) => (n > 0
      ? { text: `${n} inactive`, tone: 'bg-text-muted' as const, icon: CircleAlert }
      : { text: 'All active', tone: 'bg-success' as const, icon: CircleCheck });
    return [
      {
        key: 'people', icon: Users, tile: TILE.primary, label: 'People', value: users.data ? c.activePeople : null, tab: 'users',
        caption: users.data ? (c.deactivated > 0
          ? { text: `${c.deactivated} deactivated`, tone: 'bg-text-muted', icon: CircleAlert }
          : { text: 'All active', tone: 'bg-success', icon: CircleCheck }) : null,
      },
      {
        key: 'online', icon: Radio, tile: TILE.success, label: 'Online now', value: online, tab: 'online',
        caption: online !== null ? { text: `of ${c.activePeople} active`, tone: 'bg-primary-600', icon: Users } : null,
      },
      {
        key: 'departments', icon: Building2, tile: TILE.coral, label: 'Departments', value: departments.data ? c.activeDepartments : null, tab: 'departments',
        caption: departments.data ? offCaption(c.inactiveDepartments) : null,
      },
      {
        key: 'stores', icon: Store, tile: TILE.info, label: 'Stores', value: stores.data ? c.activeStores : null, tab: 'stores',
        caption: stores.data ? offCaption(c.inactiveStores) : null,
      },
      {
        key: 'unplaced', icon: MapPinOff, tile: c.unplaced ? TILE.warning : TILE.success, label: 'To place', value: users.data ? c.unplaced : null, tab: 'users',
        caption: !users.data ? null : c.unplaced > 0
          ? { text: unplacedCaption(c), tone: 'bg-warning', icon: CircleAlert }
          : { text: 'Everyone placed', tone: 'bg-success', icon: CircleCheck },
      },
    ];
  }, [users.data, departments.data, stores.data, presence.data]);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1" aria-label="Overview">
      {tiles.map((t, index) => {
        const Icon = t.icon;
        const loading = t.value === null && (users.isPending || departments.isPending || stores.isPending);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onOpen(t.tab)}
            style={{ '--stat-delay': `${index * 60}ms` } as CSSProperties}
            className={cn(PANEL_CLASS, 'stat-rise group flex min-w-0 cursor-pointer flex-col gap-2.5 p-3 text-left outline-none transition-all duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:p-4')}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white sm:size-10', t.tile)} aria-hidden="true">
                <Icon className="size-[1.125rem] sm:size-5" strokeWidth={2.25} />
              </span>
              {loading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="t-figure font-display font-extrabold leading-none tabular-nums text-text">
                  {t.value === null ? '-' : <CountUp value={t.value} fromZero />}
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="t-card font-display font-bold text-text">{t.label}</span>
              {t.caption && <IconChip icon={t.caption.icon} tone={t.caption.tone} label={t.caption.text} soft className="self-start" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};
