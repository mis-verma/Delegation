import { useMemo, useState } from 'react';
import { Radio, Users, Search, Building2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Input, Avatar, Skeleton, EmptyState, GradientIconTile } from '../../../components';
import { StatCard } from '../../dashboard';
import { useUsersQuery, useDepartmentsQuery, usePresenceQuery } from '../hook';
import { ROLE_STYLES, ROLE_LABEL } from '../roleBadge';
import { presenceLabel } from '../presenceDisplay';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { AdminUser, UserPresence } from '../../../api/admin';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PresenceRowSkeleton = () => (
  <div className="flex items-center gap-3 px-4 py-3">
    <Skeleton className="size-8 rounded-full shrink-0" />
    <div className="flex-1 flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-3 w-44" />
    </div>
    <Skeleton className="h-5 w-16 rounded-md shrink-0" />
    <Skeleton className="h-3 w-20 shrink-0" />
  </div>
);

// Who's on the web app right now, and when everyone else was last on it — real presence (see
// server/src/modules/presence), not the isActive/inactive account-enabled flag People & Teams
// already shows. That page also got a smaller version of this (a dot on each card); this is the
// dedicated, sortable, all-at-once view.
export const PresenceOverview = () => {
  const { data: users, isPending: usersPending, isError, refetch } = useUsersQuery();
  const { data: presenceRows, isPending: presencePending } = usePresenceQuery();
  const { data: departments } = useDepartmentsQuery();
  const [query, setQuery] = useState('');

  const presenceByUserId = useMemo(
    () => new Map((presenceRows ?? []).map((p) => [p.id, p])),
    [presenceRows]
  );
  const departmentNames = useMemo(
    () => new Map((departments ?? []).map((d) => [d.id, d.name])),
    [departments]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (users ?? [])
      .filter((u) => !q || `${u.firstName} ${u.lastName ?? ''} ${u.email}`.toLowerCase().includes(q))
      .map((user) => ({ user, presence: presenceByUserId.get(user.id) }));

    // Online first, then most-recently-seen — exactly the two things this page exists to answer,
    // in the order someone scanning it actually cares about.
    return list.sort((a, b) => {
      const aOnline = a.presence?.online ?? false;
      const bOnline = b.presence?.online ?? false;
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      const aTime = a.presence?.lastActiveAt ? new Date(a.presence.lastActiveAt).getTime() : 0;
      const bTime = b.presence?.lastActiveAt ? new Date(b.presence.lastActiveAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [users, presenceByUserId, query]);

  const onlineCount = (presenceRows ?? []).filter((p) => p.online).length;
  const isPending = usersPending || presencePending;

  return (
    <div className="flex flex-col gap-5 w-full max-w-(--container-width) mx-auto">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={Radio} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Who's online</h1>
          <p className="text-sm text-text-muted mt-0.5">See who's on the app right now, and when everyone else was last active.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={Radio} label="Active now" value={onlineCount} caption={`of ${users?.length ?? 0} people`} highlight decorative />
        <StatCard icon={Users} label="Total people" value={users?.length ?? 0} caption="In your organization" />
      </div>

      <Input
        id="presence-search"
        icon={Search}
        placeholder="Search people..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isError ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display font-medium">
          <p className="flex-1">Failed to load people.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      ) : isPending ? (
        <div className="flex flex-col rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => <PresenceRowSkeleton key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="Try a different name or email."
        />
      ) : (
        <div className="flex flex-col rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
          {rows.map(({ user, presence }) => (
            <PresenceRow key={user.id} user={user} presence={presence} departmentName={user.departmentId ? departmentNames.get(user.departmentId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
};

const PresenceRow = ({ user, presence, departmentName }: { user: AdminUser; presence?: UserPresence; departmentName?: string }) => (
  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
    <Avatar name={`${user.firstName} ${user.lastName ?? ''}`} src={resolveAvatarUrl(user.avatarUrl)} size="sm" online={presence?.online} />

    <div className="min-w-0 flex-1">
      <p className="text-sm font-display font-semibold text-text truncate">
        {user.firstName} {user.lastName ?? ''}
      </p>
      <p className="text-xs font-display text-text-muted truncate">{user.email}</p>
    </div>

    {departmentName && (
      <div className="hidden sm:flex items-center gap-1 text-[11px] font-display font-medium text-text-muted shrink-0">
        <Building2 className="w-3 h-3 text-text-light" />
        {departmentName}
      </div>
    )}

    {/* Role badge joins department below `sm` — on a phone this row was down to ~2 visible
        characters of name/email (avatar + fixed-width timestamp + this badge left almost nothing
        for the name/email column, which is the actually-identifying part of the row). Both are
        still one tap away on the person's own detail/directory entry. */}
    <span className={cn('hidden sm:inline-flex shrink-0 text-[11px] font-display font-bold px-1.5 py-0.5 rounded-md border', ROLE_STYLES[user.role])}>
      {ROLE_LABEL[user.role]}
    </span>

    {/* No more fixed `w-24` — that reserved a full column's width for every row's timestamp even
        though most are short ("now", "5m ago"), which is exactly the width the name/email column
        needed back on mobile. */}
    <span className={cn('shrink-0 text-[11px] font-display font-medium whitespace-nowrap', presence?.online ? 'text-success' : 'text-text-light')}>
      {presence ? presenceLabel(presence) : ''}
    </span>
  </div>
);
