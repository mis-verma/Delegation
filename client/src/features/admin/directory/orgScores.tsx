import { useContext } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip, Skeleton } from '../../../components';
import type { ExplorerRow } from '../../../api/scores';
import { OrgScoresContext, scoresHref, type ScoreKind } from './orgScoreData';
import { rateTone } from '../../dashboard/dashboardDisplay';

/**
 * A small score pill for a row in the Org structure tree: this month's overall in its colour, tapping it opens
 * the Scores page on that row. Renders nothing outside an OrgScoresContext; a dash while loading.
 */
export const ScorePill = ({ kind, id, name }: { kind: ScoreKind; id: string; name: string }) => {
  const ctx = useContext(OrgScoresContext);
  if (!ctx) return null;
  const map = ctx[kind];
  const row = map?.get(id);
  const overall = row?.overall ?? null;
  const tone = overall === null ? 'neutral' : rateTone(overall, row?.totalDue ?? 0);
  return (
    <Link
      viewTransition
      to={scoresHref(kind, id, name, ctx.from, ctx.to)}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
      aria-label={overall === null ? `Open ${name}'s scores` : `${name} scores ${Math.round(overall)}% this month. Open scores`}
      title="Score this month"
      className="relative z-10 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-1.5 t-meta font-display font-bold tabular-nums transition-colors duration-150 hover:border-primary-300 hover:bg-primary-500/5 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:h-9"
    >
      <Trophy className="size-3 shrink-0 text-text-light" strokeWidth={2.5} aria-hidden="true" />
      {map === undefined ? (
        <span className="text-text-light">...</span>
      ) : (
        <span className={overall === null ? 'text-text-light' : TONE_TEXT[tone]}>{overall === null ? '-' : `${Math.round(overall)}%`}</span>
      )}
    </Link>
  );
};

const CHIP_TONE = {
  neutral: { dot: 'bg-text-muted', text: undefined },
  primary: { dot: 'bg-primary-600 dark:bg-primary-400', text: undefined },
  coral: { dot: 'bg-coral-500', text: undefined },
  success: { dot: 'bg-success', text: 'text-success' },
  warning: { dot: 'bg-warning', text: 'text-warning' },
  danger: { dot: 'bg-danger', text: 'text-danger' },
} as const;

export const CardChip = ({ icon, label, tone = 'neutral', title }: { icon: LucideIcon; label: string; tone?: keyof typeof CHIP_TONE; title?: string }) => (
  <IconChip icon={icon} label={label} tone={CHIP_TONE[tone].dot} labelClassName={CHIP_TONE[tone].text} title={title ?? label} />
);

const TONE_TEXT ={ success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text' } as const;
const TONE_BAR = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-primary-500' } as const;

interface ScoreStripProps {
  kind: ScoreKind;
  id: string;
  name: string;
  /** undefined while loading; null when the scores could not load or nothing was due. */
  row: ExplorerRow | null | undefined;
  from: string;
  to: string;
  /** True when the request failed, so the strip says so instead of "nothing due". */
  failed?: boolean;
}

/**
 * One tappable strip on a People & Teams card: this month's overall score with a thin bar, and a chevron into
 * the Scores page for the full picture. It sits above a card's stretched title link (relative z-10).
 */
export const ScoreStrip = ({ kind, id, name, row, from, to, failed }: ScoreStripProps) => {
  const overall = row?.overall ?? null;
  const due = row?.totalDue ?? 0;
  const tone = overall === null ? 'neutral' : rateTone(overall, due);
  const loading = row === undefined && !failed;

  return (
    <Link
      viewTransition
      to={scoresHref(kind, id, name, from, to)}
      aria-label={`Open ${name}'s scores`}
      className="relative z-10 flex min-h-12 items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/50 px-3 py-2 transition-colors duration-150 hover:border-primary-300 hover:bg-primary-500/5 active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:bg-surface-hover/30"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
        <Trophy className="size-4" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">Score this month</span>
          {loading ? (
            <Skeleton className="h-4 w-10" />
          ) : (
            <span className={cn('t-card font-display font-bold tabular-nums', overall === null ? 'text-text-light' : TONE_TEXT[tone])}>
              {overall === null ? (failed ? 'Not loaded' : 'Nothing due') : `${Math.round(overall)}%`}
            </span>
          )}
        </span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-border/60" aria-hidden="true">
          {overall !== null && <span className={cn('block h-full rounded-full', TONE_BAR[tone])} style={{ width: `${Math.max(2, Math.min(100, overall))}%` }} />}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-text-light" aria-hidden="true" />
    </Link>
  );
};
