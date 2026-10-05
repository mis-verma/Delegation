import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Radio, Users, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Input, Avatar, Skeleton, EmptyState, InlineError, PageHeader, PANEL_CLASS, ToggleChip, DepartmentChip, StoreChip, RoleChip, PresenceChip } from '../../../components';
import { StatCard } from '../../dashboard';
import { useUsersQuery, useDepartmentsQuery, usePresenceQuery } from '../hook';
import { ROLE_LABEL } from '../roleBadge';
import { useStoresQuery } from '../../tickets/hook';
import { presenceLabel } from '../presenceDisplay';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { Role } from '../../../api/admin';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LIST_CLASS = cn(PANEL_CLASS, 'flex flex-col divide-y divide-border/60 overflow-hidden');

// One grid for the whole row. Phone: person and presence chip on the first line, the role,
// department and store chips wrap under them. md and up: five aligned columns (person, department,
// store, role, presence), so every chip lines up down the list.
const ROW_CLASS = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_9rem_9.5rem] md:gap-x-4';
const CHIPS_CLASS = 'col-span-2 flex flex-wrap items-center gap-1.5 md:contents';
const CHIP_CLASS = 'min-w-0 max-w-full justify-self-start';
const MISSING_CLASS = 'hidden md:block text-[11px] font-display font-medium text-text-light';

const PresenceRowSkeleton = () => (
  <div className={ROW_CLASS}>
    <div className="flex items-center gap-3 min-w-0">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
    </div>
    <div className={CHIPS_CLASS}>
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
    <Skeleton className="h-6 w-24 rounded-full justify-self-end col-start-2 row-start-1 md:col-start-auto md:row-start-auto" />
  </div>
);

interface PresenceRowProps {
  name: string;
  email: string;
  avatarSrc: string | null | undefined;
  role: Role;
  departmentName: string | undefined;
  storeName: string | undefined;
  isActive: boolean;
  /** undefined while live status is unknown; the avatar then shows no dot at all. */
  online: boolean | undefined;
  statusText: string;
}

// Primitive props only, so a 20-second poll that changes nothing for a person re-renders nothing for them.
const PresenceRow = memo(({ name, email, avatarSrc, role, departmentName, storeName, isActive, online, statusText }: PresenceRowProps) => (
  <div className={cn(ROW_CLASS, 'hover:bg-surface-hover transition-colors')}>
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={name} src={avatarSrc} size="sm" online={isActive ? online : undefined} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-display font-semibold truncate', isActive ? 'text-text' : 'text-text-secondary')}>{name}</p>
        <p className="text-xs font-display text-text-muted truncate">{email}</p>
      </div>
    </div>

    <div className={CHIPS_CLASS}>
      {departmentName ? <DepartmentChip name={departmentName} className={CHIP_CLASS} /> : <span className={MISSING_CLASS}>No department</span>}
      {storeName ? <StoreChip name={storeName} className={CHIP_CLASS} /> : <span className={MISSING_CLASS}>No store</span>}
      <RoleChip role={role} className={CHIP_CLASS} />
    </div>

    {/* On a phone this sits on the first line, right of the name; from md it is the last column. */}
    <div className="col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
      <PresenceChip online={online} text={statusText} deactivated={!isActive} className="max-w-full" />
    </div>
  </div>
));
PresenceRow.displayName = 'PresenceRow';

// Who's on the web app right now, and when everyone else was last on it: real presence (see
// server/src/modules/presence), not the isActive/inactive account-enabled flag People & Teams
// already shows.
export const PresenceOverview = () => {
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery();
  const { data: presenceRows, isPending: presencePending, isError: presenceError, refetch: refetchPresence } = usePresenceQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [showDeactivated, setShowDeactivated] = useState(false);

  const presenceByUserId = useMemo(
    () => new Map((presenceRows ?? []).map((p) => [p.id, p])),
    [presenceRows]
  );
  const departmentNames = useMemo(
    () => new Map((departments ?? []).map((d) => [d.id, d.name])),
    [departments]
  );

  const storeNames = useMemo(
    () => new Map((stores ?? []).map((st) => [st.id, st.name])),
    [stores]
  );

  const deactivatedCount = useMemo(() => (users ?? []).filter((u) => !u.isActive).length, [users]);
  const activeCount = (users?.length ?? 0) - deactivatedCount;
  const onlineCount = useMemo(() => {
    const activeIds = new Set((users ?? []).filter((u) => u.isActive).map((u) => u.id));
    return (presenceRows ?? []).filter((p) => p.online && activeIds.has(p.id)).length;
  }, [users, presenceRows]);

  // The order only depends on who is online and on names, never on "last seen", so rows do not
  // reshuffle every time the 20-second poll returns a new timestamp. Someone going online or
  // offline is the one thing that moves a row.
  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => showDeactivated || u.isActive)
      .filter((u) => !q || `${u.firstName} ${u.lastName ?? ''} ${u.email} ${ROLE_LABEL[u.role]}`.toLowerCase().includes(q))
      .map((user) => {
        const presence = presenceByUserId.get(user.id);
        return {
          user,
          name: `${user.firstName} ${user.lastName ?? ''}`.trim(),
          online: presence ? presence.online : undefined,
          statusText: presenceLabel(presence),
        };
      })
      .filter((row) => !onlineOnly || row.online === true)
      .sort((a, b) => {
        const aOnline = a.online === true;
        const bOnline = b.online === true;
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [users, presenceByUserId, deferredQuery, onlineOnly, showDeactivated]);

  const renderList = () => {
    if (usersPending) {
      return (
        <div className={LIST_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => <PresenceRowSkeleton key={i} />)}
        </div>
      );
    }

    if (usersError && !users) {
      return <InlineError message="Couldn't load people. Check your connection and try again." onRetry={() => refetchUsers()} />;
    }

    if (rows.length === 0) {
      if (deferredQuery.trim()) {
        return (
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try a different name, email or role."
            action={{ label: 'Clear search', onClick: () => setQuery('') }}
          />
        );
      }
      if (onlineOnly) {
        return (
          <EmptyState
            icon={Radio}
            title="Nobody is online right now"
            description="This list refreshes every few seconds."
            action={{ label: 'Show everyone', onClick: () => setOnlineOnly(false) }}
          />
        );
      }
      return <EmptyState icon={Users} title="No people yet" description="People you add will show up here with their live status." />;
    }

    return (
      <div className={LIST_CLASS}>
        {rows.map(({ user, name, online, statusText }) => (
          <PresenceRow
            key={user.id}
            name={name}
            email={user.email}
            avatarSrc={resolveAvatarUrl(user.avatarUrl)}
            role={user.role}
            departmentName={user.departmentId ? departmentNames.get(user.departmentId) : undefined}
            storeName={user.storeId ? storeNames.get(user.storeId) : undefined}
            isActive={user.isActive}
            online={online}
            statusText={statusText}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader
        icon={Radio}
        title="Who's online"
        subtitle="See who is on the app right now, and when everyone else was last active."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          icon={Radio}
          label="Active now"
          value={presenceRows && users ? onlineCount : 'No data'}
          caption={users ? `of ${activeCount} active ${activeCount === 1 ? 'person' : 'people'}` : undefined}
          isLoading={presencePending || usersPending}
          compact
          highlight
          decorative
        />
        <StatCard
          icon={Users}
          label="Total people"
          value={users ? activeCount : 'No data'}
          caption={deactivatedCount > 0 ? `${deactivatedCount} deactivated` : 'In your organization'}
          isLoading={usersPending}
          compact
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 basis-64">
          <Input
            id="presence-search"
            type="search"
            icon={Search}
            aria-label="Search people"
            placeholder="Search people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ToggleChip on={onlineOnly} onClick={() => setOnlineOnly((v) => !v)}>
          Online only
        </ToggleChip>
        {(deactivatedCount > 0 || showDeactivated) && (
          <ToggleChip on={showDeactivated} onClick={() => setShowDeactivated((v) => !v)}>
            Show deactivated{deactivatedCount > 0 ? ` (${deactivatedCount})` : ''}
          </ToggleChip>
        )}
      </div>

      {/* Live status failing never hides the people; the list stays, just without fresh dots. */}
      {presenceError && (
        <InlineError message="Live status isn't loading. Showing last known." onRetry={() => refetchPresence()} />
      )}
      {usersError && users && (
        <InlineError message="Couldn't refresh people. Showing the last list we loaded." onRetry={() => refetchUsers()} />
      )}

      {renderList()}
    </div>
  );
};
