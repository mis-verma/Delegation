import { memo, useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Radio, Users, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Input, Avatar, Skeleton, EmptyState, InlineError, PANEL_CLASS, SelectDropdown, ToggleChip, DepartmentChip, StoreChip, RoleChip, PresenceChip } from '../../../components';
import { useUsersQuery, useDepartmentsQuery, usePresenceQuery } from '../hook';
import { ROLE_LABEL } from '../roleBadge';
import { useStoresQuery } from '../../tickets/hook';
import { presenceLabel } from '../presenceDisplay';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { Role } from '../../../api/admin';
import { useCustomRoleNames } from '../customRoles/useCustomRoleNames';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LIST_CLASS = cn(PANEL_CLASS, 'flex flex-col divide-y divide-border/60 overflow-hidden');

const ROW_CLASS = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_9rem_9.5rem] md:gap-x-4';
const CHIPS_CLASS = 'col-span-2 flex flex-wrap items-center gap-1.5 md:contents';
const CHIP_CLASS = 'min-w-0 max-w-full justify-self-start';
const MISSING_CLASS = 'hidden md:block t-meta font-display font-medium text-text-light';

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
  roleLabel?: string;
  departmentName: string | undefined;
  storeName: string | undefined;
  isActive: boolean;
  online: boolean | undefined;
  statusText: string;
}

const PresenceRow = memo(({ name, email, avatarSrc, role, roleLabel, departmentName, storeName, isActive, online, statusText }: PresenceRowProps) => (
  <div className={cn(ROW_CLASS, 'hover:bg-surface-hover transition-colors')}>
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={name} src={avatarSrc} size="sm" online={isActive ? online : undefined} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-display font-semibold truncate', isActive ? 'text-text' : 'text-text-secondary')}>{name}</p>
        <p className="t-meta font-display text-text-muted truncate">{email}</p>
      </div>
    </div>

    <div className={CHIPS_CLASS}>
      {departmentName ? <DepartmentChip name={departmentName} className={CHIP_CLASS} /> : <span className={MISSING_CLASS}>No department</span>}
      {storeName ? <StoreChip name={storeName} className={CHIP_CLASS} /> : <span className={MISSING_CLASS}>No store</span>}
      <RoleChip role={role} label={roleLabel} className={CHIP_CLASS} />
    </div>

    <div className="col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
      <PresenceChip online={online} text={statusText} deactivated={!isActive} className="max-w-full" />
    </div>
  </div>
));
PresenceRow.displayName = 'PresenceRow';

export const PresenceOverview = () => {
  const customRoleNames = useCustomRoleNames();
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery();
  const { data: presenceRows, isError: presenceError, refetch: refetchPresence } = usePresenceQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [params, setParams] = useSearchParams();
  const storeFilter = params.get('store') ?? '';
  const setStoreFilter = (next: string) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (next) out.set('store', next); else out.delete('store');
    return out;
  }, { replace: true });

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

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => showDeactivated || u.isActive)
      .filter((u) => !storeFilter || u.storeId === storeFilter)
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
  }, [users, presenceByUserId, deferredQuery, onlineOnly, showDeactivated, storeFilter]);

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
            roleLabel={user.customRoleId ? customRoleNames.get(user.customRoleId) : undefined}
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
        <div className="w-full sm:w-52">
          <SelectDropdown aria-label="Filter by store" value={storeFilter} options={[{ value: '', label: 'All stores' }, ...(stores ?? []).filter((st) => st.isActive).map((st) => ({ value: st.id, label: st.name }))]} onChange={setStoreFilter} />
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
