import { memo } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, DepartmentChip, IconChip, RoleChip, StoreChip } from '../../../components';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import type { PersonNode } from './peopleTree';
import { userKey } from './peopleTree';
import { fullName } from './orgStructureDisplay';

export interface TreeContext {
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onOpen: (userId: string) => void;
  matches: ReadonlySet<string>;
  online: ReadonlySet<string>;
  storeName: (id: string | null) => string | undefined;
  departmentName: (id: string | null) => string | undefined;
}

interface PersonBranchProps {
  node: PersonNode;
  ctx: TreeContext;
}

export const PersonBranch = memo(({ node, ctx }: PersonBranchProps) => {
  const { user } = node;
  const key = userKey(node.id);
  const name = fullName(user);
  const open = node.reports.length > 0 && ctx.isOpen(key);
  const matched = ctx.matches.has(node.id);
  const store = ctx.storeName(user.storeId);
  const department = ctx.departmentName(user.departmentId);

  return (
    <li className="flex flex-col gap-2">
      <div
        id={`org-node-${node.id}`}
        className={cn(
          'flex items-center gap-1 rounded-xl border bg-surface p-2 transition-colors duration-150',
          matched ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-border/60 hover:border-border-hover',
          !user.isActive && 'bg-surface-hover/40',
        )}
      >
        {node.reports.length > 0 ? (
          <button
            type="button"
            onClick={() => ctx.onToggle(key)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name}'s team`}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:size-8"
          >
            <ChevronRight className={cn('size-4 transition-transform duration-150 ease-out', open && 'rotate-90')} aria-hidden />
          </button>
        ) : (
          <span className="size-2 shrink-0 sm:size-4" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => ctx.onOpen(node.id)}
          aria-label={`Open ${name}`}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Avatar name={name} src={resolveAvatarUrl(user.avatarUrl)} size="md" online={ctx.online.has(node.id)} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn('line-clamp-2 break-words t-card font-display font-bold leading-snug', user.isActive ? 'text-text' : 'text-text-secondary')}>{name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <RoleChip role={user.role} compact />
              {store && <StoreChip name={store} />}
              {department && <DepartmentChip name={department} iconOnlyOnMobile />}
              {!user.isActive && <IconChip icon={false} label="Deactivated" />}
            </span>
          </span>
        </button>
        {node.reports.length > 0 && (
          <span className="shrink-0 pr-1" title={`${node.reports.length} direct ${node.reports.length === 1 ? 'report' : 'reports'}`}>
            <IconChip icon={Users} tone="bg-primary-600" label={String(node.reports.length)} labelClassName="tabular-nums" />
          </span>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-2 border-l border-border/60 pl-3 sm:pl-5">
          {node.reports.map((child) => <PersonBranch key={child.id} node={child} ctx={ctx} />)}
        </ul>
      )}
    </li>
  );
});
PersonBranch.displayName = 'PersonBranch';
