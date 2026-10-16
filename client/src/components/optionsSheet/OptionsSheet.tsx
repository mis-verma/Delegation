import type { ReactNode } from 'react';
import { CountBadge } from '../countBadge';
import { ListFilter, SlidersHorizontal, X, Check, RotateCcw, FileDown, type LucideIcon } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
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
        {/* A small tinted tile, not a bare grey glyph: the section icons are the sheet's wayfinding. */}
        <span className="flex items-center justify-center size-6 rounded-md bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0">
          <Icon size={13} strokeWidth={2.4} />
        </span>
        {label}
      </span>
      {aside}
    </div>
    {children}
  </section>
);

/**
 * Gradient fills for the icon tiles in this sheet, one per option, so the choices are told apart by
 * colour as well as by shape. Spelled out in full: Tailwind reads class names from source text and
 * emits nothing for a name assembled at runtime.
 */
const OPTION_TONES = [
  'bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-400 dark:to-primary-600',
  'bg-gradient-to-br from-coral-400 to-coral-600',
  'bg-gradient-to-br from-success/80 to-success',
  'bg-gradient-to-br from-warning/80 to-warning',
  'bg-gradient-to-br from-status-approve/80 to-status-approve',
  'bg-gradient-to-br from-info/80 to-info',
] as const;

const toneAt = (index: number) => OPTION_TONES[index % OPTION_TONES.length];

/** The solid, rounded icon tile used by the choice cards and chips below. */
const OptionGlyph = ({ icon: Icon, tone, className = 'size-8 rounded-lg' }: { icon: LucideIcon; tone: string; className?: string }) => (
  <span className={`flex items-center justify-center shrink-0 text-white ${tone} ${className}`}>
    <Icon className="size-4" strokeWidth={2.4} />
  </span>
);

/**
 * Choice cards for a short either/or (Show, Group by): equal-width cells, each with its own
 * coloured icon tile above the label. The picked card gets a navy border, a soft tint and a tick, so
 * it reads without relying on colour alone. Cards stack icon-over-label on phones so three fit
 * without cutting words off.
 */
export const OptionSegmented = <T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(({ value: v, label, icon }, index) => {
      const active = v === value;
      return (
        <button
          key={v}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(v)}
          className={`relative flex flex-col items-center justify-center gap-1.5 min-h-[4.25rem] pointer-coarse:min-h-[4.5rem] px-1.5 py-2.5 rounded-xl border text-center text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.98] [-webkit-tap-highlight-color:transparent] ${
            active
              ? 'border-primary-600 dark:border-primary-400 bg-primary-500/10 dark:bg-primary-500/15 text-primary-800 dark:text-primary-100'
              : 'border-border/60 dark:border-white/[0.08] bg-surface text-text-secondary hover:border-primary-400/60'
          }`}
        >
          <OptionGlyph icon={icon} tone={toneAt(index)} />
          <span className="max-w-full truncate leading-tight">{label}</span>
          {active && (
            <span className="absolute top-1.5 right-1.5 flex items-center justify-center size-4 rounded-full bg-primary-600 dark:bg-primary-400 text-white">
              <Check size={10} strokeWidth={3.5} />
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/**
 * A one-of-many picker (Sort by, Group board by) shown as a row of chips instead of a dropdown:
 * every option is visible and one tap away, each with its own coloured icon tile, and the current
 * one is ticked. Same name and props as the dropdown it replaces, so callers are unchanged.
 */
export const OptionSelect = <K extends string>({ labels, icons, value, onChange }: {
  labels: Record<K, string>;
  icons: Record<K, LucideIcon>;
  value: K;
  onChange: (key: K) => void;
}) => (
  <div className="flex flex-wrap gap-2 pointer-coarse:gap-2.5" role="group">
    {(Object.keys(labels) as K[]).map((key, index) => (
      <ChoiceChip
        key={key}
        active={value === key}
        onClick={() => onChange(key)}
        lead={<OptionGlyph icon={icons[key]} tone={toneAt(index)} className="size-5 sm:size-6 rounded-full" />}
      >
        {labels[key]}
      </ChoiceChip>
    ))}
  </div>
);

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
    className="t-meta font-semibold text-text-muted hover:text-danger px-1.5 py-0.5 pointer-coarse:min-h-11 pointer-coarse:px-3 rounded cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
      {/* The number sits on a wrapper beside the button, not inside it, and inside the wrapper's own
          padding, so neither the button's round edge nor a toolbar's overflow can cut it off. */}
      <span className="relative inline-flex shrink-0 -m-1 p-1">
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            title="Options"
            aria-label={activeCount > 0 ? `Options, ${activeCount} active` : 'Options'}
            className={`group size-9 pointer-coarse:size-12 shrink-0 rounded-xl border p-0 transition-colors duration-150 ${activeCount > 0 ? 'border-primary-500/40 bg-primary-500/10 text-primary-700 hover:bg-primary-500/15 dark:text-primary-300' : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:bg-surface hover:text-text'}`}
          >
            <ListFilter size={18} strokeWidth={2.25} aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <CountBadge
          count={activeCount}
          label={`${activeCount} ${activeCount === 1 ? 'option' : 'options'} on`}
          className="pointer-events-none absolute right-0 top-0"
        />
      </span>

      <DialogContent
        ref={contentRef}
        style={dragStyle}
        showCloseButton={false}
        overlayClassName="bg-black/30"
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
