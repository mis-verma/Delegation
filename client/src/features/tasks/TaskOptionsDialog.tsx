import { lazy, Suspense, useState } from 'react';
import { Settings2, UserCheck, Send, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Button, OptionsDialog, SortOptionRow, OptionRow, OptionRowGroup, FilterGroup, FilterPill } from '../../components';
import { TaskFilterFields } from './TaskFilterFields';
import { SORT_LABEL, SORT_ICON, type TaskSortKey, type TaskFilters } from './taskFilters';
import { BOARD_GROUP_LABEL, BOARD_GROUP_ICON, type BoardGroupBy } from './taskBoardGroups';
import { type TaskViewKey } from './taskViews';
import { CARD_FIELD_CONFIG, type CardFieldKey, type CardFieldVisibility } from './cardFields';
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
  sort:             TaskSortKey;
  onSortChange:     (key: TaskSortKey) => void;
  /** Read-only here — the view is switched from the toolbar strip. Used only for the trigger
   *  hint and to hide rows that don't apply to the current view. */
  view:             TaskViewKey;
  groupBy:          BoardGroupBy;
  onGroupByChange:  (key: BoardGroupBy) => void;
  fieldVisibility:  CardFieldVisibility;
  onToggleField:    (key: CardFieldKey) => void;
  assignableUsers?: AssignableUser[];
  tags?:            Tag[];
  storeOptions:     { id: string; name: string }[];
  departmentOptions: { id: string; name: string }[];
  isAdmin?:         boolean;
  canExport:        boolean;
  onExport:         () => void;
  /** Passed straight through to TaskFilterFields — see its own doc comment. */
  hideCategory?:    boolean;
  /** Omitted when there's no signed-in user to scope by — the row is then not rendered at all. */
  scope?: {
    assignedToMe: boolean;
    raisedByMe:   boolean;
    onAssignedToMe: () => void;
    onRaisedByMe:   () => void;
  };
}

// Show/Fields/Category/Status/Priority/Assignee/Raised-by live as rows in one dialog instead of a
// separate Filters popover plus more toolbar dropdowns. The dialog shell is the shared
// components/optionsDialog one — this file owns only the rows specific to Delegation.
//
// View and Sort are NOT in here: both changed the page rather than narrowing the list, and both
// now sit in the toolbar where their current value is readable without opening anything. Each has
// exactly one control on the page.
export const TaskOptionsDialog = ({
  isOpen, setIsOpen, filters, onChange, onClearAll, activeCount,
  sort, onSortChange, view, groupBy, onGroupByChange, fieldVisibility, onToggleField,
  assignableUsers, tags, storeOptions, departmentOptions, isAdmin = false, canExport, onExport, scope,
  hideCategory = false,
}: TaskOptionsDialogProps) => {
  const [showAddUser, setShowAddUser] = useState(false);
  // `Button` isn't a forwardRef component, so it can't carry the ref DropdownMenuTrigger's
  // asChild would need directly — this wrapper div gives the same "find the Dialog's own content
  // element" anchor the assignee/labels pickers use, without changing the shared Button.
  const [fieldsMenuWrapperEl, setFieldsMenuWrapperEl] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <OptionsDialog
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        title="Delegation options"
        activeCount={activeCount}
        onClearAll={onClearAll}
        canExport={canExport}
        onExport={onExport}
      >
        {/* Show/Group board by/Sort by/Fields are each a single `w-fit` control — side by side
            instead of each claiming its own full-width row, so the dialog doesn't spend its whole
            first screenful on four small pickers. */}
        <OptionRowGroup>
          {/* Was a pair of pill tabs sitting loose under the page header. They're two more ways of
              narrowing the same list as every other row in here, so they live with the rest of them.
              "Everyone" is the resting state, made explicit rather than implied by neither tab
              being lit — you can now see what's selected without inferring it. */}
          {scope && (
            <OptionRow label="Show">
              <FilterGroup>
                <FilterPill
                  active={!scope.assignedToMe && !scope.raisedByMe}
                  onClick={() => {
                    if (scope.assignedToMe) scope.onAssignedToMe();
                    if (scope.raisedByMe) scope.onRaisedByMe();
                  }}
                >
                  <Users size={14} />
                  Everyone
                </FilterPill>
                <FilterPill active={scope.assignedToMe} onClick={scope.onAssignedToMe}>
                  <UserCheck size={14} />
                  Assigned to me
                </FilterPill>
                <FilterPill active={scope.raisedByMe} onClick={scope.onRaisedByMe}>
                  <Send size={13} />
                  Assigned by me
                </FilterPill>
              </FilterGroup>
            </OptionRow>
          )}

          {/* What the board's columns represent. Only Status columns accept a dropped card — the
              other three are lenses on the same delegations, and a drop on a Department column would
              have to mean "reassign", a different decision entirely. Every card keeps its own
              "Move to" menu in all four, so no status change is ever out of reach.

              Board-only: columns are the board's structure, and Timeline groups by due date while
              Table and List are flat, so this row would be a control with nothing to control. */}
          {view === 'board' && (
            <OptionRow label="Group board by">
              <FilterGroup>
                {(Object.keys(BOARD_GROUP_LABEL) as BoardGroupBy[]).map((key) => {
                  const Icon = BOARD_GROUP_ICON[key];
                  return (
                    <FilterPill key={key} active={groupBy === key} onClick={() => onGroupByChange(key)}>
                      <Icon size={14} />
                      {BOARD_GROUP_LABEL[key]}
                    </FilterPill>
                  );
                })}
              </FilterGroup>
            </OptionRow>
          )}

          {/* Hidden in Timeline: that view lays bars out on a date axis, so it ignores this
              entirely and a control that silently does nothing is worse than no control. */}
          {view !== 'timeline' && (
            <SortOptionRow labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={onSortChange} />
          )}

          <OptionRow label="Fields">
            {/* modal={false} for the same reason as AssigneeField's picker: a modal Radix
                dropdown nested inside this Dialog takes its own scroll lock, and because these
                checkbox items preventDefault on select (so you can toggle several fields without
                the menu closing), the menu is still open afterwards and the dialog can't scroll. */}
            <div ref={setFieldsMenuWrapperEl}>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-9 px-3 gap-2 border border-border/60 rounded-lg w-fit">
                    <Settings2 size={14} className="text-text-muted" />
                    <span className="text-xs font-medium">Customize cards</span>
                  </Button>
                </DropdownMenuTrigger>
                {/* pointer-events-auto + overscroll-contain, and `container`/`collisionBoundary`
                    pointed at this dialog's own content element — same three-part fix as
                    AssigneeField's picker (see its comments): without `container` the menu
                    portals to document.body, outside the Dialog's react-remove-scroll subtree, and
                    is visible but unscrollable with a trackpad however tall CARD_FIELD_CONFIG grows. */}
                <DropdownMenuContent
                  align="start"
                  className="w-52 rounded-xl max-h-72 pointer-events-auto overscroll-contain"
                  collisionBoundary={fieldsMenuWrapperEl?.closest('[data-slot="dialog-content"]') ?? undefined}
                  collisionPadding={16}
                  container={fieldsMenuWrapperEl?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}
                >
                  <DropdownMenuLabel className="text-xs text-text-muted font-medium tracking-tight">Show only</DropdownMenuLabel>
                  {CARD_FIELD_CONFIG.map(({ key, label, icon: Icon }) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={fieldVisibility[key]}
                      onCheckedChange={() => onToggleField(key)}
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2.5 py-2 cursor-pointer"
                    >
                      <Icon size={14} className="text-text-muted" />
                      <span className="font-medium text-sm">{label}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </OptionRow>
        </OptionRowGroup>

        <TaskFilterFields
          filters={filters}
          onChange={onChange}
          assignableUsers={assignableUsers}
          tags={tags}
          storeOptions={storeOptions}
          departmentOptions={departmentOptions}
          isAdmin={isAdmin}
          onAddUser={() => { setShowAddUser(true); setIsOpen(false); }}
          hideCategory={hideCategory}
        />
      </OptionsDialog>

      {showAddUser && (
        <Suspense fallback={null}>
          <UserForm onClose={() => setShowAddUser(false)} />
        </Suspense>
      )}
    </>
  );
};
