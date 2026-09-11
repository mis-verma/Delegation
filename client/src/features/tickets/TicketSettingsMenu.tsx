import { Building2, User, LayoutGrid, UserPen, UserCheck } from 'lucide-react';
import { OptionsDialog, SortOptionRow, OptionRow } from '../../components';
import { TicketFilterFields } from './list/TicketFilterFields';
import { SORT_LABEL, SORT_ICON } from './list/ticketSort';
import { SCOPE_FILTERS, type ScopeFilter } from './list/ticketFilters';
import type { useTicketOrganizer } from './useTicketOrganizer';
import type { Department } from '../../api/departments';
import type { AssignableUser } from '../../api/users';
import type { Tag } from '../../api/tags';

const SCOPE_ICON: Record<ScopeFilter, typeof LayoutGrid> = {
  ALL: LayoutGrid,
  CREATED_BY_ME: UserPen,
  ASSIGNED_TO_ME: UserCheck,
};

interface TicketSettingsMenuProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  organizer: ReturnType<typeof useTicketOrganizer>;
  departments?: Department[];
  assignableUsers?: AssignableUser[];
  tags?: Tag[];
  canExport: boolean;
  onExport: () => void;
}

// The dialog shell and Sort row come from components/optionsDialog, shared with Delegation's own
// Options dialog. The view toggle lives in the toolbar now, not here (see TicketList.tsx) — same
// as Delegation, it changes what the whole page looks like rather than narrowing the list, so it
// reads as a place you are rather than a setting you configured. What stays here is genuinely
// ticket-specific: the scope filter and grouping.
export const TicketSettingsMenu = ({
  isOpen, setIsOpen, organizer, departments, assignableUsers, tags, canExport, onExport
}: TicketSettingsMenuProps) => {
  return (
    <OptionsDialog
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Ticket options"
      activeCount={organizer.activeCount}
      onClearAll={organizer.handleResetFilters}
      canExport={canExport}
      onExport={onExport}
    >
      <OptionRow label="Scope">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-hover/50 border border-border/40 w-fit flex-wrap">
          {SCOPE_FILTERS.map((f) => {
            const Icon = SCOPE_ICON[f.key];
            return (
              <button
                key={f.key}
                onClick={() => { organizer.setScopeFilter(f.key); organizer.setPage(1); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${
                  organizer.scopeFilter === f.key ? 'bg-background text-text shadow-sm ring-1 ring-border/50' : 'text-text-muted hover:bg-surface-active/50'
                }`}
              >
                <Icon size={14} /> {f.label}
              </button>
            );
          })}
        </div>
      </OptionRow>

      {organizer.view === 'list' && (
        <OptionRow label="Group by">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-hover/50 border border-border/40 w-fit">
            <button onClick={() => organizer.setGroupBy('department')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${organizer.groupBy === 'department' ? 'bg-background shadow-sm' : 'text-text-muted'}`}>
              <Building2 size={14} /> Department
            </button>
            <button onClick={() => organizer.setGroupBy('assignee')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${organizer.groupBy === 'assignee' ? 'bg-background shadow-sm' : 'text-text-muted'}`}>
              <User size={14} /> Person
            </button>
          </div>
        </OptionRow>
      )}

      <SortOptionRow labels={SORT_LABEL} icons={SORT_ICON} value={organizer.sort} onChange={organizer.setSort} />

      <TicketFilterFields
        filters={organizer.filters}
        onChange={(patch) => { organizer.setFilters((prev) => ({ ...prev, ...patch })); organizer.setPage(1); }}
        departments={departments}
        assignableUsers={assignableUsers}
        tags={tags}
      />
    </OptionsDialog>
  );
};
