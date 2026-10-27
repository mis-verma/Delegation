import type { HTMLAttributes, ReactNode } from 'react';
import { EyeOff, GripVertical, Square, RectangleHorizontal } from 'lucide-react';
import type { DashboardCardSize } from './dashboardLayout';

interface DashboardCardFrameProps {
  size: DashboardCardSize;
  children: ReactNode;
  isDragging?: boolean;
  strip?: ReactNode;
}

export const DashboardCardFrame = ({ size, children, isDragging = false, strip }: DashboardCardFrameProps) => (
  <div className={`flex flex-col gap-2 h-full has-[>div:empty]:hidden ${size === 'big' ? 'sm:col-span-2' : ''} ${isDragging ? 'opacity-50 z-10' : ''}`}>
    {strip}
    <div className="flex-1 min-h-0 flex flex-col">{children}</div>
  </div>
);

interface CardCustomizeStripProps {
  label: string;
  size: DashboardCardSize;
  onSizeChange: (size: DashboardCardSize) => void;
  onHide: () => void;
  handleProps: HTMLAttributes<HTMLElement>;
}

export const CardCustomizeStrip = ({ label, size, onSizeChange, onHide, handleProps }: CardCustomizeStripProps) => (
  <div className="flex items-center gap-2 px-1">
    <div
      {...handleProps}
      aria-label={`Drag to reorder ${label}`}
      className="flex min-h-11 min-w-0 flex-1 cursor-grab touch-none items-center gap-2 rounded-xl border border-transparent px-1 text-text-muted transition-colors hover:border-border hover:bg-surface hover:text-text active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <GripVertical size={16} aria-hidden="true" className="shrink-0" />
      <span className="t-meta font-display font-semibold text-text-secondary truncate min-w-0">{label}</span>
    </div>
    <div className="shrink-0 flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-surface" role="group" aria-label={`${label} size`}>
      <button
        type="button"
        onClick={() => onSizeChange('small')}
        aria-pressed={size === 'small'}
        title="Small"
        className={`flex items-center justify-center size-8 rounded-md transition-colors cursor-pointer ${
          size === 'small' ? 'bg-vivid-blue text-white' : 'text-text-muted hover:text-text hover:bg-surface-hover'
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
          size === 'big' ? 'bg-vivid-blue text-white' : 'text-text-muted hover:text-text hover:bg-surface-hover'
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
