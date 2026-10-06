import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EntityIconTile } from '../../../components';

interface QuickActionButtonProps {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
  tileClassName?: string;
}

// One flat background tint on hover, nothing else — no lift, no border-color swap, no icon/arrow
// sliding off in different directions. That combination read as busy/unsmooth rather than
// premium; a plain tint is the same quiet feedback every other clickable row in the app already
// uses (RecentActivity's rows, the sidebar's nav items), just applied here too.
//
// Icon and arrow share the top row, label and description stack underneath. The old one-line
// layout put icon + text + arrow side by side, which left the text only ~100px once four of these
// shared a half-width card: descriptions were cut to "View your …" and the label ran into the
// arrow. Stacked, the text gets the tile's whole width and the description wraps instead.
export const QuickActionButton = ({ to, icon: Icon, label, description, tileClassName }: QuickActionButtonProps) => (
  <Link
    to={to}
    className="flex h-full min-h-28 w-full flex-col justify-between gap-4 rounded-xl border border-border/60 bg-surface p-4 transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:border-primary-500"
  >
    {/* No `group` on the Link above — EntityIconTile's own `group-hover:scale-105` keys off an
        ancestor `.group`, so without one the icon stays still instead of popping on hover along
        with everything else this button used to animate. */}
    <div className="flex items-start justify-between gap-2">
      {/* Each action wears its category's colour (the same ones as the chart), so the row is not five
          identical blue tiles. */}
      {tileClassName ? (
        <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tileClassName}`}>
          <Icon size={20} />
        </span>
      ) : (
        <EntityIconTile icon={Icon} />
      )}
      <ArrowUpRight size={16} strokeWidth={2.25} className="shrink-0 text-text-muted/50" />
    </div>

    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-sm font-display font-semibold text-text leading-snug">{label}</p>
      <p className="line-clamp-2 text-xs font-display text-text-muted leading-snug">{description}</p>
    </div>
  </Link>
);
