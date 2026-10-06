import type { HTMLAttributes, ReactNode } from 'react';
import { EyeOff, GripVertical, Square, RectangleHorizontal } from 'lucide-react';
import type { DashboardCardSize } from './dashboardLayout';

// Frame chrome with no drag-and-drop dependency: the home page renders every card through this
// plain frame, and only swaps in the sortable one (DashboardSortableGrid, lazy-loaded) once the
// viewer actually starts Customize. That keeps @dnd-kit out of the first paint.

interface DashboardCardFrameProps {
  size: DashboardCardSize;
  children: ReactNode;
  /** Set by the sortable wrapper while dragging; a plain frame never passes it. */
  isDragging?: boolean;
  /** Customize-mode strip (drag grip + size toggle) shown above the card. */
  strip?: ReactNode;
}

// A slim control strip sits above the card rather than an outer bordered box around it: every
// card here already draws its own border/rounded shell, and wrapping that in a second one is the
// "nested cards" mistake this app has spent real effort undoing elsewhere on the dashboard.
export const DashboardCardFrame = ({ size, children, isDragging = false, strip }: DashboardCardFrameProps) => (
  // `has-[>div:empty]:hidden`: a card that renders nothing (the approvals block for someone with no
  // queue to review, say) leaves its inner box empty, and the whole frame then disappears instead of
  // leaving a blank gap and a stray customize strip in the grid.
  <div className={`flex flex-col gap-2 h-full has-[>div:empty]:hidden ${size === 'big' ? 'sm:col-span-2' : ''} ${isDragging ? 'opacity-50 z-10' : ''}`}>
    {strip}
    {/* flex-1 so the card itself (h-full via DASHBOARD_CARD_CLASS) has real height to fill —
        without this a strip above would be the only flex item actually sized, and the card below
        it would sit at its own natural height regardless of how tall this frame grew to match its
        row. */}
    <div className="flex-1 min-h-0 flex flex-col">{children}</div>
  </div>
);

interface CardCustomizeStripProps {
  label: string;
  size: DashboardCardSize;
  onSizeChange: (size: DashboardCardSize) => void;
  /** Hides this card. It goes to the "Hidden" row in the toolbar, from where it can be brought back. */
  onHide: () => void;
  /** Spread from dnd-kit's useSortable (attributes + listeners) onto the grip button. */
  handleProps: HTMLAttributes<HTMLButtonElement>;
}

export const CardCustomizeStrip = ({ label, size, onSizeChange, onHide, handleProps }: CardCustomizeStripProps) => (
  <div className="flex items-center gap-2 px-1">
    <button
      type="button"
      {...handleProps}
      className="shrink-0 flex items-center justify-center size-11 -my-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      aria-label={`Drag to reorder ${label}`}
    >
      <GripVertical size={15} />
    </button>
    <span className="text-xs font-display font-semibold text-text-secondary truncate flex-1 min-w-0">{label}</span>
    <div className="shrink-0 flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-surface" role="group" aria-label={`${label} size`}>
      <button
        type="button"
        onClick={() => onSizeChange('small')}
        aria-pressed={size === 'small'}
        title="Small"
        className={`flex items-center justify-center size-8 rounded-md transition-colors cursor-pointer ${
          size === 'small' ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text hover:bg-surface-hover'
        }`}
      >
        <Square size={12} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        onClick={() => onSizeChange('big')}
        aria-pressed={size === 'big'}
        title="Big"
        className={`flex items-center justify-center size-8 rounded-md transition-colors cursor-pointer ${
          size === 'big' ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text hover:bg-surface-hover'
        }`}
      >
        <RectangleHorizontal size={14} strokeWidth={2.25} />
      </button>
    </div>
    <button
      type="button"
      onClick={onHide}
      title={`Hide ${label}`}
      aria-label={`Hide ${label}`}
      className="shrink-0 flex items-center justify-center size-9 rounded-lg border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <EyeOff size={14} strokeWidth={2.25} />
    </button>
  </div>
);
