import { lazy, Suspense, useState } from 'react';
import {
  Eye, Users, UserCheck, Send, Columns3, ArrowUpDown, LayoutGrid, Shapes, AlertTriangle, CheckSquare,
  CircleDot, Flag, Tag as TagIcon, Store, Building2, UserPlus, FileEdit, type LucideIcon,
} from 'lucide-react';
import {
  OptionsSheet, OptionSection, OptionSegmented, OptionSelect,
  ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../components/optionsSheet';
import { getStatusChipMeta, type StatusChipStatus } from '../../components/statusChip';
import { STATUS_LABEL, PRIORITY_MAP } from './taskDisplay';
import { SORT_LABEL, SORT_ICON, type TaskSortKey, type TaskFilters, type CategoryFilterKey } from './taskFilters';
import { BOARD_GROUP_LABEL, BOARD_GROUP_ICON, type BoardGroupBy } from './taskBoardGroups';
import { type TaskViewKey } from './taskViews';
import { CARD_FIELD_CONFIG, type CardFieldKey, type CardFieldVisibility } from './cardFields';
import { toggleValue } from '../../lib/toggleValue';
import { labelDotClass } from '../../lib/labelColors';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import type { Task } from '../../api/task';
import type { AssignableUser } from '../../api/users';
import type { Tag } from '../../api/tags';

const UserForm = lazy(() =>
  import('../admin/users/UserForm').then((m) => ({ default: m.UserForm })),
);

interface TaskOptionsDialogProps {
  isOpen:           boolean;
  setIsOpen:        (open: boolean) => void;
  filters:          TaskFilters;
  onChange:         (patch: Partial<TaskFilters>) => void;
  onClearAll:       () => void;
  activeCount:      number;
  /** How many delegations match right now, and out of how many — header subtitle + footer button. */
  resultCount:      number;
  totalCount:       number;
  sort:             TaskSortKey;
  onSortChange:     (key: TaskSortKey) => void;
  /** Read-only here — the view is switched from the toolbar strip. Used only to hide rows that
   *  don't apply to the current view. */
  view:             TaskViewKey;
  groupBy:          BoardGroupBy;
  onGroupByChange:  (key: BoardGroupBy) => void;
  fieldVisibility:  CardFieldVisibility;
  onToggleField:    (key: CardFieldKey) => void;
  assignableUsers?: AssignableUser[];
  tags?:            Tag[];
  /** Already filtered to active stores by TaskList. */
  storeOptions:     { id: string; name: string }[];
  /** Already narrowed to the selected store's departments by TaskList. */
  departmentOptions: { id: string; name: string }[];
  isAdmin?:         boolean;
  canExport:        boolean;
  onExport:         () => void;
  /** Omit the Category section — for a page already locked to one category (Smart Delegations). */
  hideCategory?:    boolean;
  /** Omitted when there's no signed-in user to scope by — the section is then not rendered. */
  scope?: {
    value:    TaskScopeKey;
    onChange: (next: TaskScopeKey) => void;
  };
}

export type TaskScopeKey = 'all' | 'mine' | 'byMe';

const CATEGORY_CHIPS: { value: Exclude<CategoryFilterKey, 'all'>; label: string; icon: LucideIcon; tone: string }[] = [
  { value: 'issue', label: 'Issue', icon: AlertTriangle, tone: 'bg-danger' },
  { value: 'delegation', label: 'Delegation', icon: Send, tone: 'bg-primary-600' },
  { value: 'task', label: 'Direct Task', icon: CheckSquare, tone: 'bg-success' },
];

// Same palette the card and detail header use for each status.
const STATUS_CHIP_KEY: Record<Task['status'], StatusChipStatus | null> = {
  draft: null,
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

const STATUS_ORDER: Task['status'][] = ['todo', 'in_progress', 'on_hold', 'pending_approval', 'done', 'draft'];
const PRIORITY_ORDER: Task['priority'][] = ['high', 'medium', 'low'];

/**
 * Delegation's Filter and sort sheet — same shell and chip language as Tickets' (see
 * TicketSettingsMenu): who you're looking at, how the board groups and sorts, what the cards show,
 * then every filter as icon chips. Changes apply as you tap; the footer says how many match.
 */
export const TaskOptionsDialog = ({
  isOpen, setIsOpen, filters, onChange, onClearAll, activeCount, resultCount, totalCount,
  sort, onSortChange, view, groupBy, onGroupByChange, fieldVisibility, onToggleField,
  assignableUsers, tags, storeOptions, departmentOptions, isAdmin = false, canExport, onExport, scope,
  hideCategory = false,
}: TaskOptionsDialogProps) => {
  const [showAddUser, setShowAddUser] = useState(false);
  const people = (assignableUsers ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName ?? ''}`.trim(), first: u.firstName }));

  const scopeValue: TaskScopeKey = scope?.value ?? 'all';

  const personChips = (selected: string[], onPick: (ids: string[]) => void) => (
    <ChoiceWrap>
      {people.map((p) => (
        <ChoiceChip
          key={p.id}
          active={selected.includes(p.id)}
          onClick={() => onPick(toggleValue(selected, p.id))}
          lead={
            <span className={`flex items-center justify-center size-7 rounded-full text-white text-xs font-bold shrink-0 ${avatarColorClass(p.name)}`}>
              {getInitials(p.name)}
            </span>
          }
        >
          {p.first}
        </ChoiceChip>
      ))}
    </ChoiceWrap>
  );

  const allFieldsOn = CARD_FIELD_CONFIG.every(({ key }) => fieldVisibility[key]);

  return (
    <>
      <OptionsSheet
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        activeCount={activeCount}
        subtitle={`${resultCount} of ${totalCount} delegations`}
        onReset={onClearAll}
        canReset={activeCount > 0 || scopeValue !== 'all'}
        onExport={canExport ? onExport : undefined}
        showLabel={`Show ${resultCount} ${resultCount === 1 ? 'delegation' : 'delegations'}`}
      >
        {scope && (
          <OptionSection icon={Eye} label="Show">
            <OptionSegmented
              options={[
                { value: 'all' as const, label: 'Everyone', icon: Users },
                { value: 'mine' as const, label: 'Assigned to me', icon: UserCheck },
                { value: 'byMe' as const, label: 'Assigned by me', icon: Send },
              ]}
              value={scopeValue}
              onChange={(next) => scope.onChange(next)}
            />
          </OptionSection>
        )}

        {/* Group is board-only (columns are the board's structure); Timeline lays bars on a date
            axis, so it ignores sort and neither control shows there. */}
        {view !== 'timeline' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {view === 'board' && (
              <OptionSection icon={Columns3} label="Group board by">
                <OptionSelect labels={BOARD_GROUP_LABEL} icons={BOARD_GROUP_ICON} value={groupBy} onChange={onGroupByChange} />
              </OptionSection>
            )}
            <OptionSection icon={ArrowUpDown} label="Sort by">
              <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={onSortChange} />
            </OptionSection>
          </div>
        )}

        <OptionSection
          icon={LayoutGrid}
          label="Show on cards"
          aside={!allFieldsOn && (
            <button
              type="button"
              onClick={() => CARD_FIELD_CONFIG.forEach(({ key }) => { if (!fieldVisibility[key]) onToggleField(key); })}
              className="text-xs font-semibold text-text-muted hover:text-primary-600 px-1.5 py-0.5 rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Show all
            </button>
          )}
        >
          <ChoiceWrap>
            {CARD_FIELD_CONFIG.map(({ key, label, icon }) => (
              <ChoiceChip
                key={key}
                active={fieldVisibility[key]}
                onClick={() => onToggleField(key)}
                lead={<ChoiceIcon icon={icon} tone={fieldVisibility[key] ? 'bg-primary-600' : 'bg-text-light'} />}
              >
                {label}
              </ChoiceChip>
            ))}
          </ChoiceWrap>
        </OptionSection>

        {!hideCategory && (
          <OptionSection icon={Shapes} label="Category" aside={filters.category !== 'all' && <ChoiceClear onClick={() => onChange({ category: 'all' })} />}>
            <ChoiceWrap>
              {CATEGORY_CHIPS.map((c) => (
                <ChoiceChip
                  key={c.value}
                  active={filters.category === c.value}
                  onClick={() => onChange({ category: filters.category === c.value ? 'all' : c.value })}
                  lead={<ChoiceIcon icon={c.icon} tone={c.tone} />}
                >
                  {c.label}
                </ChoiceChip>
              ))}
            </ChoiceWrap>
          </OptionSection>
        )}

        <OptionSection icon={CircleDot} label="Status" aside={filters.status !== 'all' && <ChoiceClear onClick={() => onChange({ status: 'all' })} />}>
          <ChoiceWrap>
            {STATUS_ORDER.map((s) => {
              const key = STATUS_CHIP_KEY[s];
              const meta = key ? getStatusChipMeta(key) : { icon: FileEdit, tone: 'bg-text-light' };
              return (
                <ChoiceChip
                  key={s}
                  active={filters.status === s}
                  onClick={() => onChange({ status: filters.status === s ? 'all' : s })}
                  lead={<ChoiceIcon icon={meta.icon} tone={meta.tone} />}
                >
                  {STATUS_LABEL[s]}
                </ChoiceChip>
              );
            })}
          </ChoiceWrap>
        </OptionSection>

        <OptionSection icon={Flag} label="Priority" aside={filters.priority.length > 0 && <ChoiceClear onClick={() => onChange({ priority: [] })} />}>
          <ChoiceWrap>
            {PRIORITY_ORDER.map((p) => (
              <ChoiceChip
                key={p}
                active={filters.priority.includes(p)}
                onClick={() => onChange({ priority: toggleValue(filters.priority, p) })}
                lead={<ChoiceIcon icon={PRIORITY_MAP[p].icon} tone={PRIORITY_MAP[p].solid} />}
              >
                {PRIORITY_MAP[p].label}
              </ChoiceChip>
            ))}
          </ChoiceWrap>
        </OptionSection>

        {/* Matched as OR server-side: a delegation carrying any picked label passes. */}
        {!!tags?.length && (
          <OptionSection icon={TagIcon} label="Labels" aside={filters.tagIds.length > 0 && <ChoiceClear onClick={() => onChange({ tagIds: [] })} />}>
            <ChoiceWrap>
              {tags.map((tag) => (
                <ChoiceChip
                  key={tag.id}
                  active={filters.tagIds.includes(tag.id)}
                  onClick={() => onChange({ tagIds: toggleValue(filters.tagIds, tag.id) })}
                  lead={<span className="flex items-center justify-center size-6 shrink-0"><span className={`size-2.5 rounded-full ${labelDotClass(tag)}`} /></span>}
                >
                  {tag.name}
                </ChoiceChip>
              ))}
            </ChoiceWrap>
          </OptionSection>
        )}

        {/* Store before Department: picking a store narrows the departments offered (TaskList
            clears a department that no longer belongs). Each hidden when there's no choice. */}
        {storeOptions.length > 1 && (
          <OptionSection icon={Store} label="Store" aside={!!filters.storeId && <ChoiceClear onClick={() => onChange({ storeId: '' })} />}>
            <ChoiceWrap>
              {storeOptions.map((s) => (
                <ChoiceChip
                  key={s.id}
                  active={filters.storeId === s.id}
                  onClick={() => onChange({ storeId: filters.storeId === s.id ? '' : s.id })}
                  lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}
                >
                  {s.name}
                </ChoiceChip>
              ))}
            </ChoiceWrap>
          </OptionSection>
        )}

        {departmentOptions.length > 1 && (
          <OptionSection icon={Building2} label="Department" aside={!!filters.departmentId && <ChoiceClear onClick={() => onChange({ departmentId: '' })} />}>
            <ChoiceWrap>
              {departmentOptions.map((d) => (
                <ChoiceChip
                  key={d.id}
                  active={filters.departmentId === d.id}
                  onClick={() => onChange({ departmentId: filters.departmentId === d.id ? '' : d.id })}
                  lead={<ChoiceIcon icon={Building2} tone="bg-primary-600" />}
                >
                  {d.name}
                </ChoiceChip>
              ))}
            </ChoiceWrap>
          </OptionSection>
        )}

        {!!people.length && (
          <OptionSection
            icon={UserCheck}
            label="Assigned to"
            aside={
              <span className="flex items-center gap-1">
                {filters.assigneeIds.length > 0 && <ChoiceClear onClick={() => onChange({ assigneeIds: [] })} />}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setShowAddUser(true); setIsOpen(false); }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary-600 px-1.5 py-0.5 rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <UserPlus size={12} strokeWidth={2.5} />
                    Add user
                  </button>
                )}
              </span>
            }
          >
            {personChips(filters.assigneeIds, (assigneeIds) => onChange({ assigneeIds }))}
          </OptionSection>
        )}

        {!!people.length && (
          <OptionSection icon={Users} label="Raised by" aside={filters.raisedByIds.length > 0 && <ChoiceClear onClick={() => onChange({ raisedByIds: [] })} />}>
            {personChips(filters.raisedByIds, (raisedByIds) => onChange({ raisedByIds }))}
          </OptionSection>
        )}
      </OptionsSheet>

      {showAddUser && (
        <Suspense fallback={null}>
          <UserForm onClose={() => setShowAddUser(false)} />
        </Suspense>
      )}
    </>
  );
};
