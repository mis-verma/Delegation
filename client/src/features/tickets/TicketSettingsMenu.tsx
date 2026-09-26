import type { ReactNode } from 'react';
import {
  SlidersHorizontal, X, Check, ChevronDown, RotateCcw, FileDown,
  Eye, LayoutGrid, UserPen, UserCheck, Rows3, ArrowUpDown, Building2, User,
  CircleDot, Flag, Tag as TagIcon, Users, type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '../../components';
import { useDraggableDialog } from '../../components/modal/useDraggableDialog';
import { getStatusChipMeta, type StatusChipStatus } from '../../components/statusChip';
import { DETAIL_HEADING_CLASS } from '../tasks/taskFormFieldStyles';
import { STATUS_CONFIG, PRIORITY_CONFIG } from './ticketDisplay';
import { SORT_LABEL, SORT_ICON, type TicketSortKey } from './list/ticketSort';
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

// ── Building blocks ────────────────────────────────────────────────────────────────────────────

/** One section: an icon label (same style as the detail sheet's headings) over its controls. */
const Section = ({ icon: Icon, label, children, aside }: { icon: LucideIcon; label: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className={DETAIL_HEADING_CLASS}>
        <Icon size={14} className="text-text-light" />
        {label}
      </span>
      {aside}
    </div>
    {children}
  </section>
);

/** Segmented control: equal-width cells on a grey track, picked cell raised. */
const Segmented = <T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="grid gap-1 p-1 rounded-xl bg-surface-hover/70" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(({ value: v, label, icon: Icon }) => {
      const active = v === value;
      return (
        <button
          key={v}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(v)}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-0 sm:h-9 px-1.5 sm:px-2 rounded-lg text-[11px] sm:text-xs font-display font-semibold transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
            active
              ? 'bg-surface text-text border border-border/60 dark:border-white/[0.08]'
              : 'text-text-muted border border-transparent hover:text-text'
          }`}
        >
          <Icon size={14} className={active ? 'text-primary-600 dark:text-primary-300' : undefined} />
          <span className="truncate">{label}</span>
        </button>
      );
    })}
  </div>
);

/**
 * A pickable chip in the app's icon-chip language: a solid icon circle (or colour dot, or avatar)
 * plus a bold label in a pill. Picked = navy border, soft tint and a tick, so it reads at a glance
 * without relying on colour alone.
 */
const ChoiceChip = ({ active, onClick, lead, children }: { active: boolean; onClick: () => void; lead?: ReactNode; children: ReactNode }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 h-8 ${lead ? 'pl-1' : 'pl-3'} pr-3 rounded-full border text-xs font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] ${
      active
        ? 'border-primary-600 dark:border-primary-400 bg-primary-500/10 dark:bg-primary-500/15 text-primary-800 dark:text-primary-100'
        : 'border-border/60 dark:border-white/[0.08] bg-surface text-text-secondary hover:border-primary-400/60'
    }`}
  >
    {lead}
    <span className="truncate max-w-[12rem]">{children}</span>
    {active && <Check size={13} strokeWidth={3} className="text-primary-700 dark:text-primary-200 -mr-0.5 shrink-0" />}
  </button>
);

const IconCircle = ({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) => (
  <span className={`flex items-center justify-center size-6 rounded-full text-white shrink-0 ${tone}`}>
    <Icon size={12} strokeWidth={2.75} />
  </span>
);

const ChipWrap = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-2">{children}</div>;

/** Small "Clear" link on a section's label row, only while that section has a pick. */
const ClearLink = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-[11px] font-semibold text-text-muted hover:text-danger px-1.5 py-0.5 rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    Clear
  </button>
);

// ── Sheet ──────────────────────────────────────────────────────────────────────────────────────

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
 * Tickets' Options sheet: who you're looking at, how the list is grouped and sorted, then every
 * filter as icon chips (status and priority circles, label dots, name chips with avatars). Changes
 * apply as you tap; the footer button shows how many tickets match and closes the sheet.
 * A bottom sheet on phones with only the middle scrolling; a draggable dialog on desktop.
 */
export const TicketSettingsMenu = ({
  isOpen, setIsOpen, organizer, departments, assignableUsers, tags, canExport, onExport,
}: TicketSettingsMenuProps) => {
  const { contentRef, isDragging, style: dragStyle, handleProps: dragHandleProps } = useDraggableDialog(isOpen, true);
  const { filters } = organizer;
  const patch = (next: Partial<typeof filters>) => {
    organizer.setFilters((prev) => ({ ...prev, ...next }));
    organizer.setPage(1);
  };
  const people = (assignableUsers ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName ?? ''}`.trim(), first: u.firstName }));
  const resultCount = organizer.sorted.length;
  const canClear = organizer.activeCount > 0 || organizer.scopeFilter !== 'ALL';

  const personChips = (selected: string[], onChange: (ids: string[]) => void) => (
    <ChipWrap>
      {people.map((p) => (
        <ChoiceChip
          key={p.id}
          active={selected.includes(p.id)}
          onClick={() => onChange(toggleValue(selected, p.id))}
          lead={
            <span className={`flex items-center justify-center size-6 rounded-full text-white text-[9px] font-bold shrink-0 ${avatarColorClass(p.name)}`}>
              {getInitials(p.name)}
            </span>
          }
        >
          {p.first}
        </ChoiceChip>
      ))}
    </ChipWrap>
  );

  const SortIcon = SORT_ICON[organizer.sort];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="group gap-2 font-display font-semibold tracking-tight rounded-full text-xs sm:text-sm px-4 py-2 border border-border hover:border-primary-400 transition-all duration-200 ease-in-out"
        >
          <SlidersHorizontal size={15} strokeWidth={2.5} className="text-text-muted group-hover:text-primary-600 transition-colors duration-200" />
          <span>Options</span>
          {organizer.activeCount > 0 && (
            <span className="flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-bold rounded-full bg-primary-600 text-white tabular-nums">
              {organizer.activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent
        ref={contentRef}
        style={dragStyle}
        showCloseButton={false}
        overlayClassName="bg-black/20 backdrop-blur-sm"
        className={
          'bg-surface sm:max-w-2xl flex flex-col gap-0 p-0 sm:p-0 overflow-hidden max-h-[88dvh] sm:max-h-[85vh] ' +
          'will-change-transform data-[state=open]:duration-150 data-[state=closed]:duration-100 ' +
          'data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.7,0,0.84,0)]' +
          (isDragging ? ' select-none' : '')
        }
      >
        {/* Header: icon tile, title, live match count, close. Drag handle on desktop. */}
        <div
          {...dragHandleProps}
          className={`shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/60 ${isDragging ? 'sm:cursor-grabbing sm:touch-none' : 'sm:cursor-grab sm:touch-none'}`}
        >
          <span className="flex items-center justify-center size-10 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0">
            <SlidersHorizontal size={18} strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-display font-semibold text-text tracking-tight">Filter and sort</DialogTitle>
            <DialogDescription className="text-xs font-medium text-text-muted tabular-nums">
              {resultCount} of {organizer.scopedTotal} tickets
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex items-center justify-center size-9 -mr-1.5 rounded-full text-text-muted hover:text-text hover:bg-surface-hover active:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </DialogClose>
        </div>

        {/* Only this middle part scrolls. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-6">
          <Section icon={Eye} label="Show">
            <Segmented
              options={SCOPE_FILTERS.map((f) => ({ value: f.key, label: f.label, icon: SCOPE_ICON[f.key] }))}
              value={organizer.scopeFilter}
              onChange={(v) => { organizer.setScopeFilter(v); organizer.setPage(1); }}
            />
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {organizer.view === 'list' && (
              <Section icon={Rows3} label="Group by">
                <Segmented
                  options={[
                    { value: 'department' as const, label: 'Department', icon: Building2 },
                    { value: 'assignee' as const, label: 'Person', icon: User },
                  ]}
                  value={organizer.groupBy}
                  onChange={organizer.setGroupBy}
                />
              </Section>
            )}

            <Section icon={ArrowUpDown} label="Sort by">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border/60 dark:border-white/[0.08] bg-surface hover:border-primary-400/60 text-sm font-semibold text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300">
                      <SortIcon size={14} />
                    </span>
                    <span className="flex-1 text-left">{SORT_LABEL[organizer.sort]}</span>
                    <ChevronDown size={15} className="text-text-light" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-44 rounded-xl p-1.5">
                  {(Object.keys(SORT_LABEL) as TicketSortKey[]).map((key) => {
                    const Icon = SORT_ICON[key];
                    return (
                      <DropdownMenuItem key={key} onClick={() => organizer.setSort(key)} className="gap-2.5 py-2 cursor-pointer">
                        <Icon size={14} className="text-text-muted" />
                        <span className="font-medium text-sm">{SORT_LABEL[key]}</span>
                        {organizer.sort === key && <Check size={14} className="ml-auto text-primary-600" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </Section>
          </div>

          <Section icon={CircleDot} label="Status" aside={filters.status !== 'all' && <ClearLink onClick={() => patch({ status: 'all' })} />}>
            <ChipWrap>
              {STATUS_ORDER.map((s) => {
                const meta = getStatusChipMeta(s.toLowerCase() as StatusChipStatus);
                return (
                  <ChoiceChip
                    key={s}
                    active={filters.status === s}
                    onClick={() => patch({ status: filters.status === s ? 'all' : s })}
                    lead={<IconCircle icon={meta.icon} tone={meta.tone} />}
                  >
                    {STATUS_CONFIG[s].label}
                  </ChoiceChip>
                );
              })}
            </ChipWrap>
          </Section>

          <Section icon={Flag} label="Priority" aside={filters.priority.length > 0 && <ClearLink onClick={() => patch({ priority: [] })} />}>
            <ChipWrap>
              {PRIORITY_ORDER.map((p) => (
                <ChoiceChip
                  key={p}
                  active={filters.priority.includes(p)}
                  onClick={() => patch({ priority: toggleValue(filters.priority, p) })}
                  lead={<IconCircle icon={PRIORITY_CONFIG[p].icon} tone={PRIORITY_CONFIG[p].solid} />}
                >
                  {PRIORITY_CONFIG[p].label}
                </ChoiceChip>
              ))}
            </ChipWrap>
          </Section>

          {!!tags?.length && (
            <Section icon={TagIcon} label="Labels" aside={filters.labelIds.length > 0 && <ClearLink onClick={() => patch({ labelIds: [] })} />}>
              <ChipWrap>
                {tags.map((tag) => (
                  <ChoiceChip
                    key={tag.id}
                    active={filters.labelIds.includes(tag.id)}
                    onClick={() => patch({ labelIds: toggleValue(filters.labelIds, tag.id) })}
                    lead={<span className="flex items-center justify-center size-6 shrink-0"><span className={`size-2.5 rounded-full ${labelDotClass(tag.name)}`} /></span>}
                  >
                    {tag.name}
                  </ChoiceChip>
                ))}
              </ChipWrap>
            </Section>
          )}

          {!!departments?.length && (
            <Section icon={Building2} label="Department" aside={!!filters.departmentId && <ClearLink onClick={() => patch({ departmentId: '' })} />}>
              <ChipWrap>
                {departments.map((d) => (
                  <ChoiceChip
                    key={d.id}
                    active={filters.departmentId === d.id}
                    onClick={() => patch({ departmentId: filters.departmentId === d.id ? '' : d.id })}
                    lead={<IconCircle icon={Building2} tone="bg-primary-600" />}
                  >
                    {d.name}
                  </ChoiceChip>
                ))}
              </ChipWrap>
            </Section>
          )}

          {!!people.length && (
            <Section icon={UserCheck} label="Assigned to" aside={filters.assigneeIds.length > 0 && <ClearLink onClick={() => patch({ assigneeIds: [] })} />}>
              {personChips(filters.assigneeIds, (assigneeIds) => patch({ assigneeIds }))}
            </Section>
          )}

          {!!people.length && (
            <Section icon={Users} label="Raised by" aside={filters.raisedByIds.length > 0 && <ClearLink onClick={() => patch({ raisedByIds: [] })} />}>
              {personChips(filters.raisedByIds, (raisedByIds) => patch({ raisedByIds }))}
            </Section>
          )}
        </div>

        {/* Footer: reset on the left; export and the "show results" button on the right. */}
        <div className="shrink-0 flex items-center gap-2 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-border/60">
          <button
            type="button"
            onClick={organizer.handleResetFilters}
            disabled={!canClear}
            className="inline-flex items-center gap-1.5 h-10 px-2.5 rounded-lg text-xs font-display font-semibold text-text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-text-muted disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors"
          >
            <RotateCcw size={14} strokeWidth={2.5} />
            Reset
          </button>
          <div className="flex-1" />
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              aria-label="Export tickets"
              onClick={() => { setIsOpen(false); onExport(); }}
            >
              <FileDown size={15} />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="primary" size="sm" className="h-10 px-5 max-sm:bg-primary-700 max-sm:text-white font-display">
              Show {resultCount} {resultCount === 1 ? 'ticket' : 'tickets'}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
};
