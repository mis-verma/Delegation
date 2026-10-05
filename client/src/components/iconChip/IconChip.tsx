import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface IconChipProps {
  /** Pass `false` to render the pill with no icon circle at all (label only). */
  icon?: LucideIcon | false;
  label: ReactNode;
  /** Solid Tailwind bg-* class for the icon's own tinted circle (e.g. `bg-danger`). Ignored when
   *  `toneStyle` is set. */
  tone?: string;
  /** Inline style for the icon circle — the escape hatch for an author-picked colour (e.g. a
   *  label's own `Tag.color`) that can't be expressed as a Tailwind class. Wins over `tone`. */
  toneStyle?: CSSProperties;
  className?: string;
  /** Extra classes merged onto the label text, e.g. `text-danger` to colour it. */
  labelClassName?: string;
  title?: string;
  children?: ReactNode;
}

// The one shared "solid-colored icon circle + bold label in a bordered pill" chip — the Calendar
// page's legend and day-panel item tags (calendarDisplay.ts's CALENDAR_ITEM_DOT_CLASS/TINT_CLASS
// treatment) are the reference. Every "what kind of thing is this" tag in the app — status,
// priority, department, label — used to be its own flat colored badge, each with a different
// shape (Badge-based, dot+text, plain tinted span), so nothing about them read as one design
// language. StatusChip/PriorityChip/DepartmentChip/TagChip all render through this now instead of
// each hand-rolling their own pill markup.
export const IconChip = ({ icon: Icon, label, tone = 'bg-primary-600 dark:bg-primary-400', toneStyle, className, title, labelClassName, children }: IconChipProps) => (
  <span
    title={title}
    className={cn(
      // Fixed 24px tall on phones, 28px from sm, so a row of chips lines up whatever each holds.
      // max-w-full + min-w-0 keep the pill inside its container; the label's `truncate` does the
      // shrinking. No-icon variant gets a full pl-2.5 so the text isn't tucked against the edge.
      'inline-flex items-center gap-1 sm:gap-1.5 h-6 sm:h-7 pr-2 sm:pr-2.5 py-0 max-w-full min-w-0 rounded-full border border-border/60 bg-surface',
      Icon ? 'pl-1' : 'pl-2.5',
      className,
    )}
  >
    {Icon && (
      <span
        className={cn('flex items-center justify-center size-4 sm:size-5 rounded-full shrink-0 text-white', !toneStyle && tone)}
        style={toneStyle}
      >
        <Icon className="size-2.5 sm:size-3" strokeWidth={2.75} />
      </span>
    )}
    {/* min-w-0 lets this shrink below its content size — required for `truncate` to actually
        engage on a flex child, so a caller constraining the outer pill's width (e.g. a long
        department name in a fixed-width card row) gets an ellipsis instead of blowing out the
        row, without every other caller (which never constrains the width) losing any text. */}
    <span className={cn('min-w-0 truncate text-[11px] font-display font-semibold text-text-secondary', labelClassName)}>{label}</span>
    {children}
  </span>
);
