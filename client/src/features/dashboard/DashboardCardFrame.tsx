import type { ReactNode } from 'react';
import { GripVertical, Square, RectangleHorizontal } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashboardCardId, DashboardCardSize } from './dashboardLayout';

interface DashboardCardFrameProps {
  id: DashboardCardId;
  label: string;
  size: DashboardCardSize;
  isCustomizing: boolean;
  onSizeChange: (size: DashboardCardSize) => void;
  children: ReactNode;
}

// Wraps a dashboard card with drag-to-reorder and a small/big size toggle, both only visible in
// Customize mode — the card's own markup (whichever component `children` is) never changes, so
// turning Customize off leaves the dashboard pixel-identical to before this existed. A slim
// control strip sits above the card rather than an outer bordered box around it: every card here
// already draws its own border/rounded shell, and wrapping that in a second one is the "nested
// cards" mistake this app has spent real effort undoing elsewhere on the dashboard.
export const DashboardCardFrame = ({ id, label, size, isCustomizing, onSizeChange, children }: DashboardCardFrameProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !isCustomizing });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col gap-2 h-full ${size === 'big' ? 'sm:col-span-2' : ''} ${isDragging ? 'opacity-50 z-10' : ''}`}
    >
      {isCustomizing && (
        <div className="flex items-center gap-2 px-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 flex items-center justify-center size-7 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
              className={`flex items-center justify-center size-6 rounded-md transition-colors cursor-pointer ${
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
              className={`flex items-center justify-center size-6 rounded-md transition-colors cursor-pointer ${
                size === 'big' ? 'bg-primary-600 text-white' : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              <RectangleHorizontal size={14} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}
      {/* flex-1 so the card itself (h-full via DASHBOARD_CARD_CLASS) has real height to fill —
          without this the customize strip above would be the only flex item actually sized, and
          the card below it would sit at its own natural height regardless of how tall this frame
          grew to match its row. */}
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
};
