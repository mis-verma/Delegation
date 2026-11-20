import { useMemo, useState } from 'react';
import { Plus, Tag, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCustomRolesQuery, useUpdateCustomRoleMutation, useDeleteCustomRoleMutation } from '../hook';
import { CustomRoleForm } from './CustomRoleForm';
import {
  Button,
  EmptyState,
  EntityCardActions,
  InlineError,
  RoleChip,
  Skeleton,
  StatusPill,
  useConfirm,
} from '../../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../../components/dataTable';
import type { CustomRole } from '../../../api/customRoles';

const SKELETON_ROWS = 4;

export const CustomRoleList = () => {
  const { data, isPending, isError, refetch } = useCustomRolesQuery();
  const roles = useMemo(() => data ?? [], [data]);
  const updateMut = useUpdateCustomRoleMutation();
  const deleteMut = useDeleteCustomRoleMutation();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);

  const toggleActive = (role: CustomRole) => {
    updateMut.mutate({ id: role.id, payload: { isActive: !role.isActive } });
  };

  const handleDelete = async (role: CustomRole) => {
    if (role.peopleCount > 0) {
      await confirm({
        title: `${role.name} still has people`,
        description: `${role.peopleCount} ${role.peopleCount === 1 ? 'person uses' : 'people use'} this role. Move them to another role first, or turn it off instead.`,
        confirmLabel: 'Got it',
        cancelLabel: 'Close',
      });
      return;
    }
    const ok = await confirm({
      title: `Delete ${role.name}?`,
      description: 'This permanently removes the role and cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(role.id);
  };

  const activeModal = showForm || editingRole;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="t-meta font-display text-text-muted">
          Give people a role name of your own, built on an existing role's access.
        </p>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 shrink-0">
          <Plus size={15} aria-hidden />
          New role
        </Button>
      </div>

      {isError && !data && (
        <InlineError message="Couldn't load roles. Check your connection and try again." onRetry={() => refetch()} />
      )}

      {isPending ? (
        <div className={TABLE_FRAME_CLASS}>
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No custom roles yet"
          description="Create a role to give someone a job title of their own, like Billing Executive, while it quietly behaves like Cashier underneath."
          action={{ label: 'New role', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className={TABLE_FRAME_CLASS}>
          <table className="w-full min-w-[42rem] border-collapse">
            <caption className="sr-only">Custom roles</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Role</th>
                <th scope="col" className={TH_CLASS}>Behaves like</th>
                <th scope="col" className={cn(TH_CLASS, 'text-right')}>People</th>
                <th scope="col" className={TH_CLASS}>Status</th>
                <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const isDeleting = deleteMut.isPending && deleteMut.variables === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setEditingRole(r)}
                    tabIndex={0}
                    onKeyDown={activateOnKey(() => setEditingRole(r))}
                    className={cn(TR_CLASS, isDeleting && 'opacity-50 pointer-events-none')}
                  >
                    <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className={cn('text-sm font-display font-bold line-clamp-2 leading-snug break-words', r.isActive ? 'text-text' : 'text-text-secondary')} title={r.name}>
                          {r.name}
                        </span>
                        {r.description && <span className="t-meta text-text-muted line-clamp-1">{r.description}</span>}
                      </div>
                    </td>

                    <td className={cn(TD_CLASS, 'whitespace-nowrap')}>
                      <RoleChip role={r.baseRole} />
                    </td>

                    <td className={cn(TD_CLASS, 'whitespace-nowrap', NUM_CLASS)}>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users size={12} className="text-text-light" aria-hidden />
                        {r.peopleCount}
                      </span>
                    </td>

                    <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                      <StatusPill
                        active={r.isActive}
                        isUpdating={updateMut.isPending && updateMut.variables?.id === r.id}
                        onToggle={() => toggleActive(r)}
                        ariaLabel={`${r.isActive ? 'Turn off' : 'Turn on'} ${r.name}`}
                      />
                    </td>

                    <td className={cn(TD_CLASS, 'w-24')} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <EntityCardActions
                          onEdit={() => setEditingRole(r)}
                          onDelete={() => handleDelete(r)}
                          isDeleting={isDeleting}
                          editLabel={`Edit ${r.name} role`}
                          deleteLabel={`Delete ${r.name} role`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeModal && (
        <CustomRoleForm
          onClose={() => { setShowForm(false); setEditingRole(null); }}
          customRole={editingRole ?? undefined}
        />
      )}
    </div>
  );
};
