import { memo } from 'react';
import { Link } from 'react-router';
import { Building2, Clock, Mail, Phone, Smartphone, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, Avatar, Skeleton, RoleChip, PresenceChip } from '../../../components';
import type { AdminUser } from '../../../api/admin';
import { ROLE_META, isDepartmentHead } from '../roleBadge';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { formatRelativeTime } from '../../dashboard/dashboardDisplay';
import { UserActionsMenu, type UserActionHandlers } from './UserActionsMenu';
import type { ExplorerRow } from '../../../api/scores';
import { CardChip, ScoreStrip } from '../directory/orgScores';
import { scoresHref } from '../directory/orgScoreData';
import { DepartmentHeadChip } from './UserBits';
import { deactivatedLabel, fullName } from './userDisplay';
import { getAppLink, shareAppLink } from '../../../lib/installPrompt';

interface UserCardProps extends UserActionHandlers {
  user: AdminUser;
  departmentName?: string;
  storeName?: string;
  online?: boolean;
  presenceText: string;
  busy: boolean;
  isSelf: boolean;
  score: ExplorerRow | null | undefined;
  scoreWindow: { from: string; to: string; failed: boolean };
}

const REACH_STRIP = {
  all: 'bg-gradient-to-r from-primary-500 to-primary-700 dark:from-primary-400 dark:to-primary-600',
  department: 'bg-gradient-to-r from-coral-400 to-coral-600 dark:from-coral-400 dark:to-coral-500',
  own: '',
} as const;

const CONTACT_BUTTON =
  'relative z-10 inline-flex items-center justify-center size-8 pointer-coarse:size-11 rounded-full text-text-muted bg-surface-hover/70 hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

const whatsAppAppLink = (phone: string, firstName: string) => {
  const digits = phone.replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  const text = `Hi ${firstName}, install the KaryaOS app here: ${getAppLink()}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

const UserCardComponent = ({
  user, departmentName, storeName, online, presenceText, busy, isSelf, score, scoreWindow,
  onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserCardProps) => {
  const name = fullName(user);
  const muted = !user.isActive;
  const strip = muted ? '' : REACH_STRIP[ROLE_META[user.role].scope];

  return (
    <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-4 overflow-hidden', muted && 'bg-surface-hover/30', busy && 'pointer-events-none')}>
      {strip && <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', strip)} />}

      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar
            name={name}
            src={resolveAvatarUrl(user.avatarUrl)}
            size="lg"
            online={online}
            className={muted ? 'opacity-60 grayscale' : undefined}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={() => onEdit(user)}
                title={name}
                className={cn(
                  'text-left t-card font-display font-bold tracking-tight truncate max-w-full cursor-pointer outline-none transition-colors duration-200',
                  'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/50',
                  user.isActive ? 'text-text group-hover:text-primary-600 dark:group-hover:text-primary-400' : 'text-text-muted',
                )}
              >
                {name}
              </button>
            </h3>
            <p className="t-meta font-display text-text-muted truncate" title={user.email}>{user.email}</p>
          </div>
        </div>

        <UserActionsMenu
          user={user}
          isBusy={busy}
          isSelf={isSelf}
          onEdit={onEdit}
          onResetPassword={onResetPassword}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
          onDelete={onDelete}
        />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <RoleChip role={user.role} />
          {isDepartmentHead(user.role) && <DepartmentHeadChip />}
        </div>
        <PresenceChip online={online} text={presenceText} deactivated={!user.isActive} deactivatedLabel={deactivatedLabel(user)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {user.departmentId && departmentName ? (
          <Link
            viewTransition
            to={scoresHref('department', user.departmentId, departmentName, scoreWindow.from, scoreWindow.to)}
            aria-label={`Open ${departmentName}'s scores`}
            className="relative z-10 max-w-full min-w-0 rounded-md outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <CardChip icon={Building2} tone="primary" label={departmentName} />
          </Link>
        ) : (
          <CardChip icon={Building2} label="No department" />
        )}
        <CardChip icon={Store} tone={storeName ? 'coral' : 'neutral'} label={storeName ?? 'No store'} />
      </div>

      <ScoreStrip kind="person" id={user.id} name={name} row={score} from={scoreWindow.from} to={scoreWindow.to} failed={scoreWindow.failed} />

      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border/60">
        <div className="flex flex-col gap-0.5 min-w-0 t-meta font-display font-medium text-text-light">
          {user.phone && (
            <span className="inline-flex items-center gap-1 text-text-muted tabular-nums truncate">
              <Phone className="size-3 shrink-0" aria-hidden />
              {user.phone}
            </span>
          )}
          <span className="inline-flex items-center gap-1" title={new Date(user.createdAt).toLocaleDateString()}>
            <Clock className="size-3 shrink-0" aria-hidden />
            Joined {formatRelativeTime(user.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {user.isActive && (user.phone ? (
            <a href={whatsAppAppLink(user.phone, user.firstName)} target="_blank" rel="noopener noreferrer" className={CONTACT_BUTTON} aria-label={`Send the app link to ${name} on WhatsApp`} title="Send app link">
              <Smartphone className="size-4" aria-hidden />
            </a>
          ) : (
            <button type="button" onClick={() => void shareAppLink()} className={CONTACT_BUTTON} aria-label={`Share the app link with ${name}`} title="Share app link">
              <Smartphone className="size-4" aria-hidden />
            </button>
          ))}
          {user.phone && (
            <a href={`tel:${user.phone}`} className={CONTACT_BUTTON} aria-label={`Call ${name}`} title="Call">
              <Phone className="size-4" aria-hidden />
            </a>
          )}
          <a href={`mailto:${user.email}`} className={CONTACT_BUTTON} aria-label={`Email ${name}`} title="Email">
            <Mail className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
};

export const UserCard = memo(UserCardComponent);

export const UserCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-4 overflow-hidden')} aria-hidden>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <Skeleton className="size-12 rounded-full shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <Skeleton className="size-8 rounded-lg shrink-0" />
    </div>
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-5 w-20 rounded-md" />
      <Skeleton className="h-4 w-14" />
    </div>
    <div className="flex gap-1.5">
      <Skeleton className="h-5 w-28 rounded-md" />
      <Skeleton className="h-5 w-24 rounded-md" />
    </div>
    <Skeleton className="h-12 w-full rounded-xl" />
    <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border/60">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </div>
  </div>
);
