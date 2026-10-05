import type { ReactNode } from 'react';
import { SlidersHorizontal, X, Check, ChevronDown, RotateCcw, FileDown, type LucideIcon } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '../button';
import { useDraggableDialog } from '../modal/useDraggableDialog';

/**
 * The "Filter and sort" sheet shared by list pages (Tickets, To-Do): an Options pill that opens a
 * bottom sheet on phones (only the middle scrolls) or a draggable dialog on desktop. Header has an
 * icon tile, the title and a live match count; footer has Reset, optional Export, and a
 * "Show N …" button that closes it. The rows in between are built from the pieces below.
 */

// Same quiet label style as the detail sheets' section headings.
const HEADING_CLASS = 'flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-text-muted sm:text-text-secondary';

/** One section: an icon label over its controls, with an optional control on the label row. */
export const OptionSection = ({ icon: Icon, label, children, aside }: { icon: LucideIcon; label: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className={HEADING_CLASS}>
        <Icon size={14} className="text-text-light" />
        {label}
      </span>
      {aside}
    </div>
    {children}
  </section>
);

/** Segmented control: equal-width cells on a grey track, picked cell raised. On phones the icon
 *  sits above the label so three options fit without cutting words off. */
export const OptionSegmented = <T extends string>({ options, value, onChange }: {
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

/** A dropdown picker in the sheet (e.g. Sort by): icon tile + current label + chevron. */
export const OptionSelect = <K extends string>({ labels, icons, value, onChange }: {
  labels: Record<K, string>;
  icons: Record<K, LucideIcon>;
  value: K;
  onChange: (key: K) => void;
}) => {
  const ActiveIcon: LucideIcon = icons[value];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border/60 dark:border-white/[0.08] bg-surface hover:border-primary-400/60 text-sm font-semibold text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors [-webkit-tap-highlight-color:transparent]"
        >
          <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300">
            <ActiveIcon size={14} />
          </span>
          <span className="flex-1 text-left">{labels[value]}</span>
          <ChevronDown size={15} className="text-text-light" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-44 rounded-xl p-1.5">
        {(Object.keys(labels) as K[]).map((key) => {
          const Icon: LucideIcon = icons[key];
          return (
            <DropdownMenuItem key={key} onClick={() => onChange(key)} className="gap-2.5 py-2 cursor-pointer">
              <Icon size={14} className="text-text-muted" />
              <span className="font-medium text-sm">{labels[key]}</span>
              {value === key && <Check size={14} className="ml-auto text-primary-600" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * A pickable chip in the app's icon-chip language: a solid icon circle (or colour dot, or avatar)
 * plus a bold label in a pill. Picked = navy border, soft tint and a tick, so it reads at a glance
 * without relying on colour alone.
 */
export const ChoiceChip = ({ active, onClick, lead, children }: { active: boolean; onClick: () => void; lead?: ReactNode; children: ReactNode }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 h-8 pointer-coarse:h-10 ${lead ? 'pl-1' : 'pl-3'} pr-3 rounded-full border text-xs font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] ${
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

/** Solid icon circle for a ChoiceChip's `lead`. */
export const ChoiceIcon = ({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) => (
  <span className={`flex items-center justify-center size-5 sm:size-6 rounded-full text-white shrink-0 ${tone}`}>
    <Icon className="size-2.5 sm:size-3" strokeWidth={2.75} />
  </span>
);

export const ChoiceWrap = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-2 pointer-coarse:gap-2.5">{children}</div>;

/** Small "Clear" link for a section's label row, shown only while that section has a pick. */
export const ChoiceClear = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-[11px] font-semibold text-text-muted hover:text-danger px-1.5 py-0.5 pointer-coarse:min-h-11 pointer-coarse:px-3 rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    Clear
  </button>
);

interface OptionsSheetProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  /** Number shown in the trigger's badge (active filters). */
  activeCount: number;
  /** Under the title, e.g. "6 of 64 tickets". */
  subtitle: ReactNode;
  onReset: () => void;
  canReset: boolean;
  onExport?: () => void;
  /** The footer's close button, e.g. "Show 6 tickets". */
  showLabel: string;
  children: ReactNode;
}

export const OptionsSheet = ({
  isOpen, setIsOpen, activeCount, subtitle, onReset, canReset, onExport, showLabel, children,
}: OptionsSheetProps) => {
  const { contentRef, isDragging, style: dragStyle, handleProps: dragHandleProps } = useDraggableDialog(isOpen, true);

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
          {activeCount > 0 && (
            <span className="flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-bold rounded-full bg-primary-600 text-white tabular-nums">
              {activeCount}
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
        <div
          {...dragHandleProps}
          className={`shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-border/60 ${isDragging ? 'sm:cursor-grabbing sm:touch-none' : 'sm:cursor-grab sm:touch-none'}`}
        >
          <span className="flex items-center justify-center size-9 sm:size-10 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0">
            <SlidersHorizontal className="size-[18px] sm:size-5" strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base sm:text-lg font-display font-semibold text-text tracking-tight">Filter and sort</DialogTitle>
            <DialogDescription className="text-xs font-medium text-text-muted tabular-nums">{subtitle}</DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex items-center justify-center size-9 pointer-coarse:size-11 -mr-1.5 rounded-full text-text-muted hover:text-text hover:bg-surface-hover active:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </DialogClose>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 flex flex-col gap-6">
          {children}
        </div>

        <div className="shrink-0 flex items-center gap-2 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-border/60">
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="inline-flex items-center gap-1.5 h-11 sm:h-10 px-2.5 rounded-lg text-xs font-display font-semibold text-text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-text-muted disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors"
          >
            <RotateCcw size={14} strokeWidth={2.5} />
            Reset
          </button>
          <div className="flex-1" />
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-10"
              aria-label="Export"
              onClick={() => { setIsOpen(false); onExport(); }}
            >
              <FileDown size={15} />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="primary" size="sm" className="h-11 sm:h-10 px-5 max-sm:bg-primary-700 dark:max-sm:bg-primary-500 max-sm:text-white font-display">
              {showLabel}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
};
