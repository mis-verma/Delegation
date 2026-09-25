import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EntityIconTile } from '../../../components';

interface QuickActionButtonProps {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

// One flat background tint on hover, nothing else — no lift, no border-color swap, no icon/arrow
// sliding off in different directions. That combination read as busy/unsmooth rather than
// premium; a plain tint is the same quiet feedback every other clickable row in the app already
// uses (RecentActivity's rows, the sidebar's nav items), just applied here too.
export const QuickActionButton = ({ to, icon: Icon, label, description }: QuickActionButtonProps) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3.5 transition-colors duration-200 hover:bg-surface-hover focus-visible:outline-none focus-visible:border-primary-500"
  >
    {/* No `group` on the Link above — EntityIconTile's own `group-hover:scale-105` keys off an
        ancestor `.group`, so without one the icon stays still instead of popping on hover along
        with everything else this button used to animate. */}
    <EntityIconTile icon={Icon} className="size-10" />

    <div className="min-w-0 flex-1">
      {/* No `truncate` on the label — at a 2-up grid on a tablet-width sidebar-collapsed layout,
          even short labels like "Delegations"/"Checklists" were clipping to "Delegati...". Letting
          it wrap (still just one line almost everywhere) reads far better than an ellipsis on a
          five-letter difference. */}
      <p className="text-sm font-display font-semibold text-text leading-snug">
        {label}
      </p>
      <p className="truncate text-xs font-display text-text-muted">{description}</p>
    </div>

    <ArrowUpRight size={15} strokeWidth={2.25} className="shrink-0 text-text-muted/50" />
  </Link>
);
