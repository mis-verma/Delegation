import { Layers, Clock, CalendarClock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { QuickFilterTile } from './QuickFilterStats';

/**
 * The one definition of the quick-filter stat tiles.
 *
 * Five modules each declared their own `TILES` array — Delegation, Tickets, To-Do, My Checklists
 * and the Compliance board — describing the same handful of status buckets. They had drifted:
 * "Completed" carried `bg-success/10 border-success/50` on two pages and `bg-success/15
 * border-success/40` on three, and the same "past due" bucket was labelled "Delayed" on some pages
 * and "Overdue" on others. Every one of those arrays also carried `icon`, `tint` and `accentRing`
 * values that QuickFilterStats never reads, so a lot of that carefully-maintained config rendered
 * nothing at all.
 *
 * Modules now say *which* buckets they show and what to call them; how a bucket looks is decided
 * here, once.
 */

/** Semantic tone shared by any bucket that means the same thing, whatever a module calls it.
 *  `ring` is the tile's one decorative flourish (see QuickFilterStats' plain-tile render) — same
 *  "quiet card, one theme-colored ring" treatment StatCard's own plain variant now uses, instead
 *  of these tiles having no accent beyond the left bar. /30, not the /15-/20 this started at — at
 *  that opacity the ring read as a dull smudge rather than an actual accent. */
export const TONE = {
  neutral: { bgTint: 'bg-primary-500/15', accentBar: 'bg-primary-600', accentBorder: 'border-primary-500/40', ring: 'border-primary-500/30', iconTint: 'text-primary-600 dark:text-primary-400' },
  todo: { bgTint: 'bg-status-todo/15', accentBar: 'bg-status-todo', accentBorder: 'border-status-todo/40', ring: 'border-status-todo/30', iconTint: 'text-status-todo' },
  warning: { bgTint: 'bg-warning/15', accentBar: 'bg-warning', accentBorder: 'border-warning/40', ring: 'border-warning/30', iconTint: 'text-warning' },
  success: { bgTint: 'bg-success/15', accentBar: 'bg-success', accentBorder: 'border-success/40', ring: 'border-success/30', iconTint: 'text-success' },
  danger: { bgTint: 'bg-danger/15', accentBar: 'bg-danger', accentBorder: 'border-danger/40', ring: 'border-danger/30', iconTint: 'text-danger' },
} as const;

export type StatusTileKey = 'all' | 'pending' | 'due' | 'completed' | 'delayed' | 'overdue';

// Every tile now carries a real icon, rendered in a StatCard-style tinted tile (see
// QuickFilterStats' icon box) — the same "icon in a tinted rounded box" language every StatCard
// on the Dashboard, Calendar and admin analytics pages already uses. These tiles used to have no
// icon at all, which was the one visible gap between this component and StatCard.
const STATUS_TILE: Record<StatusTileKey, { label: string; tone: keyof typeof TONE; icon: LucideIcon }> = {
  // Used as the "clear the filter" tile where a module has one.
  all: { label: 'All', tone: 'neutral', icon: Layers },
  pending: { label: 'Pending', tone: 'todo', icon: Clock },
  due: { label: 'Due', tone: 'warning', icon: CalendarClock },
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  // `delayed` and `overdue` mean the same thing — past its due date — and are both kept because
  // the two names are already baked into different modules' filter keys and URLs. They resolve to
  // the same tone (and icon) so they can never look like different states.
  delayed: { label: 'Delayed', tone: 'danger', icon: AlertTriangle },
  overdue: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
};

/**
 * Builds the tile row for a module.
 *
 * `labels` overrides the default wording where a module genuinely names a bucket differently —
 * the Compliance board calls its `all` tile "Instances", for example. Wording is the module's
 * business; colour is not.
 */
export const statusTiles = <K extends StatusTileKey>(
  keys: readonly K[],
  labels?: Partial<Record<K, string>>,
): QuickFilterTile<K>[] =>
  keys.map((key) => {
    const { label, tone, icon } = STATUS_TILE[key];
    return { key, label: labels?.[key] ?? label, icon, ...TONE[tone] };
  });
