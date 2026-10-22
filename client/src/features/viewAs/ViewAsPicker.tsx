import { useMemo, useState } from 'react';
import { Eye, Search, SearchX, X } from 'lucide-react';
import { Avatar, EmptyState, Input, Modal, RoleChip, Skeleton, DepartmentChip } from '../../components';
import { resolveAvatarUrl } from '../../lib/uploadsBase';
import { useDepartmentsQuery, useUsersQuery } from '../admin/hook';
import { fullName } from '../admin/users/userDisplay';
import { useStartPreview } from './useStartPreview';

const MAX_SHOWN = 40;

export const ViewAsPicker = ({ onClose }: { onClose: () => void }) => {
  const [text, setText] = useState('');
  const { data: users, isPending } = useUsersQuery();
  const { data: departments } = useDepartmentsQuery();
  const { start, busyId } = useStartPreview();

  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => u.isActive && u.role !== 'ADMIN')
      .filter((u) => !q || `${fullName(u)} ${u.email}`.toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [users, text]);

  const pick = async (id: string) => {
    if (await start(id)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={<Eye className="size-5" />}
      title="Preview as a person"
      description="See the app exactly as they see it. It is read only, and your Admin account is not changed."
      size="lg"
      draggable
    >
      <div className="flex flex-col gap-3">
        <Input
          id="view-as-search"
          aria-label="Search people to preview"
          placeholder="Search by name or email"
          autoComplete="off"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          suffix={text ? (
            <button type="button" onClick={() => setText('')} aria-label="Clear search" className="flex size-8 items-center justify-center rounded-md text-text-light hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 cursor-pointer">
              <X size={15} />
            </button>
          ) : <Search size={15} aria-hidden />}
        />

        {isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading people">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState size="compact" icon={SearchX} title="No one matches" description="Only active people who are not admins can be previewed." />
        ) : (
          <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {matches.slice(0, MAX_SHOWN).map((u) => {
              const name = fullName(u);
              const department = u.departmentId ? departmentNames.get(u.departmentId) : undefined;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => void pick(u.id)}
                    disabled={busyId !== null}
                    className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left outline-none transition-all duration-150 cursor-pointer hover:border-primary-300 hover:bg-primary-500/5 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Avatar name={name} src={resolveAvatarUrl(u.avatarUrl)} size="md" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate t-card font-display font-bold text-text">{name}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <RoleChip role={u.role} />
                        {department && <DepartmentChip name={department} />}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">
                      <Eye className="size-4" aria-hidden />
                      {busyId === u.id ? 'Opening' : 'Preview'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {matches.length > MAX_SHOWN && <p className="t-meta font-medium text-text-muted">Showing {MAX_SHOWN} of {matches.length}. Type a name to narrow it down.</p>}
      </div>
    </Modal>
  );
};
