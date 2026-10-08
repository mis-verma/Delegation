import { ShieldCheck, UserCheck } from 'lucide-react';
import { UserMultiSelect } from '../../components';
import { useAssignableUsersQuery } from '../tickets/hook';

interface ReviewersFieldProps {
  /** Scope for who's pickable — same params UserMultiSelect itself takes. A Task passes
   *  `departmentId`; a Ticket (which can also target a store) passes both. */
  departmentId?: string;
  storeId?: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  /** Override the trailing hint — the default names PC/Admin + department head, which fits Task
   *  and Ticket alike (see task.service.ts / ticket.service.ts's assertCanVerify). */
  hint?: string;
}

// Explicit reviewers, additive on top of the role-based verify rule (ADMIN/PC always, the
// department head within their own department) — naming someone here lets them approve/reject
// this specific item regardless of role or department. Shared by TaskForm/TaskDetail and
// TicketForm/TicketDetail; mirrors ChecklistReviewersField's copy and layout so the same concept
// reads identically everywhere it appears. Deliberately no bulk "select everyone" shortcut — a
// reviewer list is meant to stay small and hand-picked.
export const ReviewersField = ({ departmentId, storeId, selected, onChange, className = '', hint }: ReviewersFieldProps) => {
  const hasScope = Boolean(departmentId || storeId);
  const { data: users, isLoading } = useAssignableUsersQuery(departmentId, storeId, undefined, hasScope);

  // Nothing to pick and nobody already picked — in that state this was a whole section (label,
  // picker box, hint paragraph) that only ever said "No assignable users in this scope," on a
  // detail sheet that's already tight on room. Once someone IS named as a reviewer it keeps
  // rendering (removing them is still a real action); while the scope has no candidates at all
  // and nothing's selected, there's nothing here worth the space.
  if (hasScope && !isLoading && !users?.length && selected.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-display font-medium text-text-secondary select-none">
          <ShieldCheck size={14} className="text-text-muted shrink-0" />
          <span>Reviewers <span className="text-text-muted/70 font-medium">(Optional)</span></span>
        </label>

        {selected.length > 0 && (
          <span className="text-[0.6875rem] font-display font-medium text-text-muted flex items-center gap-1">
            <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
            <span>{selected.length} reviewer{selected.length === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>

      <UserMultiSelect departmentId={departmentId} storeId={storeId} selected={selected} onChange={onChange} />

      <p className="text-[0.6875rem] font-display text-text-muted">
        {hint ?? "Anyone you add here can approve or reject this — on top of PC/Admin and the department head."}
      </p>
    </div>
  );
};
