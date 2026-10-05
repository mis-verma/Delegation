import {
  Eye, LayoutGrid, UserPen, UserCheck, Rows3, ArrowUpDown, Building2, User,
  CircleDot, Flag, Tag as TagIcon, Users, type LucideIcon,
} from 'lucide-react';
import {
  OptionsSheet, OptionSection, OptionSegmented, OptionSelect,
  ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../components/optionsSheet';
import { getStatusChipMeta, type StatusChipStatus } from '../../components/statusChip';
import { STATUS_CONFIG, PRIORITY_CONFIG } from './ticketDisplay';
import { SORT_LABEL, SORT_ICON } from './list/ticketSort';
import { SCOPE_FILTERS, type ScopeFilter } from './list/ticketFilters';
import { toggleValue } from '../../lib/toggleValue';
import { labelDotClass } from '../../lib/labelColors';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import type { useTicketOrganizer } from './useTicketOrganizer';
import type { Ticket } from '../../api/ticket';
import type { Department } from '../../api/departments';
import type { AssignableUser } from '../../api/users';
import type { Tag } from '../../api/tags';

const SCOPE_ICON: Record<ScopeFilter, LucideIcon> = {
  ALL: LayoutGrid,
  CREATED_BY_ME: UserPen,
  ASSIGNED_TO_ME: UserCheck,
};

const STATUS_ORDER: Ticket['status'][] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_APPROVAL', 'CLOSED'];
const PRIORITY_ORDER: Ticket['priority'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

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

/**
 * Tickets' Filter and sort sheet: who you're looking at, how the list is grouped and sorted, then
 * every filter as icon chips (status and priority circles, label dots, name chips with avatars).
 * Changes apply as you tap; the footer button shows how many tickets match.
 */
export const TicketSettingsMenu = ({
  isOpen, setIsOpen, organizer, departments, assignableUsers, tags, canExport, onExport,
}: TicketSettingsMenuProps) => {
  const { filters } = organizer;
  const patch = (next: Partial<typeof filters>) => {
    organizer.setFilters((prev) => ({ ...prev, ...next }));
    organizer.setPage(1);
  };
  const people = (assignableUsers ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName ?? ''}`.trim(), first: u.firstName }));
  const resultCount = organizer.sorted.length;

  const personChips = (selected: string[], onChange: (ids: string[]) => void) => (
    <ChoiceWrap>
      {people.map((p) => (
        <ChoiceChip
          key={p.id}
          active={selected.includes(p.id)}
          onClick={() => onChange(toggleValue(selected, p.id))}
          lead={
            <span className={`flex items-center justify-center size-5 sm:size-6 rounded-full text-white text-[9px] font-bold shrink-0 ${avatarColorClass(p.name)}`}>
              {getInitials(p.name)}
            </span>
          }
        >
          {p.first}
        </ChoiceChip>
      ))}
    </ChoiceWrap>
  );

  return (
    <OptionsSheet
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      activeCount={organizer.activeCount}
      subtitle={`${resultCount} of ${organizer.scopedTotal} tickets`}
      onReset={organizer.handleResetFilters}
      canReset={organizer.activeCount > 0 || organizer.scopeFilter !== 'ALL'}
      onExport={canExport ? onExport : undefined}
      showLabel={`Show ${resultCount} ${resultCount === 1 ? 'ticket' : 'tickets'}`}
    >
      <OptionSection icon={Eye} label="Show">
        <OptionSegmented
          options={SCOPE_FILTERS.map((f) => ({ value: f.key, label: f.label, icon: SCOPE_ICON[f.key] }))}
          value={organizer.scopeFilter}
          onChange={(v) => { organizer.setScopeFilter(v); organizer.setPage(1); }}
        />
      </OptionSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {organizer.view === 'list' && (
          <OptionSection icon={Rows3} label="Group by">
            <OptionSegmented
              options={[
                { value: 'department' as const, label: 'Department', icon: Building2 },
                { value: 'assignee' as const, label: 'Person', icon: User },
              ]}
              value={organizer.groupBy}
              onChange={organizer.setGroupBy}
            />
          </OptionSection>
        )}

        <OptionSection icon={ArrowUpDown} label="Sort by">
          <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={organizer.sort} onChange={organizer.setSort} />
        </OptionSection>
      </div>

      <OptionSection icon={CircleDot} label="Status" aside={filters.status !== 'all' && <ChoiceClear onClick={() => patch({ status: 'all' })} />}>
        <ChoiceWrap>
          {STATUS_ORDER.map((s) => {
            const meta = getStatusChipMeta(s.toLowerCase() as StatusChipStatus);
            return (
              <ChoiceChip
                key={s}
                active={filters.status === s}
                onClick={() => patch({ status: filters.status === s ? 'all' : s })}
                lead={<ChoiceIcon icon={meta.icon} tone={meta.tone} />}
              >
                {STATUS_CONFIG[s].label}
              </ChoiceChip>
            );
          })}
        </ChoiceWrap>
      </OptionSection>

      <OptionSection icon={Flag} label="Priority" aside={filters.priority.length > 0 && <ChoiceClear onClick={() => patch({ priority: [] })} />}>
        <ChoiceWrap>
          {PRIORITY_ORDER.map((p) => (
            <ChoiceChip
              key={p}
              active={filters.priority.includes(p)}
              onClick={() => patch({ priority: toggleValue(filters.priority, p) })}
              lead={<ChoiceIcon icon={PRIORITY_CONFIG[p].icon} tone={PRIORITY_CONFIG[p].solid} />}
            >
              {PRIORITY_CONFIG[p].label}
            </ChoiceChip>
          ))}
        </ChoiceWrap>
      </OptionSection>

      {!!tags?.length && (
        <OptionSection icon={TagIcon} label="Labels" aside={filters.labelIds.length > 0 && <ChoiceClear onClick={() => patch({ labelIds: [] })} />}>
          <ChoiceWrap>
            {tags.map((tag) => (
              <ChoiceChip
                key={tag.id}
                active={filters.labelIds.includes(tag.id)}
                onClick={() => patch({ labelIds: toggleValue(filters.labelIds, tag.id) })}
                lead={<span className="flex items-center justify-center size-5 sm:size-6 shrink-0"><span className={`size-2.5 rounded-full ${labelDotClass(tag.name)}`} /></span>}
              >
                {tag.name}
              </ChoiceChip>
            ))}
          </ChoiceWrap>
        </OptionSection>
      )}

      {!!departments?.length && (
        <OptionSection icon={Building2} label="Department" aside={!!filters.departmentId && <ChoiceClear onClick={() => patch({ departmentId: '' })} />}>
          <ChoiceWrap>
            {departments.map((d) => (
              <ChoiceChip
                key={d.id}
                active={filters.departmentId === d.id}
                onClick={() => patch({ departmentId: filters.departmentId === d.id ? '' : d.id })}
                lead={<ChoiceIcon icon={Building2} tone="bg-primary-600 dark:bg-primary-400" />}
              >
                {d.name}
              </ChoiceChip>
            ))}
          </ChoiceWrap>
        </OptionSection>
      )}

      {!!people.length && (
        <OptionSection icon={UserCheck} label="Assigned to" aside={filters.assigneeIds.length > 0 && <ChoiceClear onClick={() => patch({ assigneeIds: [] })} />}>
          {personChips(filters.assigneeIds, (assigneeIds) => patch({ assigneeIds }))}
        </OptionSection>
      )}

      {!!people.length && (
        <OptionSection icon={Users} label="Raised by" aside={filters.raisedByIds.length > 0 && <ChoiceClear onClick={() => patch({ raisedByIds: [] })} />}>
          {personChips(filters.raisedByIds, (raisedByIds) => patch({ raisedByIds }))}
        </OptionSection>
      )}
    </OptionsSheet>
  );
};
