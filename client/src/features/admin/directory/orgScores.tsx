import { useContext, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp, IconChip, Skeleton } from '../../../components';
import type { ExplorerBlock, ExplorerRow } from '../../../api/scores';
import { OrgScoresContext, scoresHref, type ScoreKind } from './orgScoreData';
import { rateTone } from '../../dashboard/dashboardDisplay';
import { ToneChip } from '../../dashboard/ToneChip';

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
  <IconChip icon={icon} label={label} tone={CHIP_TONE[tone].dot} labelClassName={CHIP_TONE[tone].text} title={title ?? label} soft={tone !== 'neutral'} />
);

const BLOCK_TILE = {
  primary: 'bg-primary-500/12 text-primary-700 dark:text-primary-300',
  coral: 'bg-coral-500/12 text-coral-600 dark:text-coral-300',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  neutral: 'bg-surface-hover text-text-muted',
} as const;

interface StatBlockProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  caption?: string | null;
  tone?: keyof typeof BLOCK_TILE;
  loading?: boolean;
}

export const StatBlock = ({ icon: Icon, label, value, caption, tone = 'primary', loading = false }: StatBlockProps) => (
  <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-surface px-2.5 py-2">
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', BLOCK_TILE[tone])} aria-hidden="true">
      <Icon className="size-[1.125rem]" strokeWidth={2.25} />
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      {loading ? (
        <Skeleton className="h-5 w-10" />
      ) : (
        <span className="truncate t-card font-display font-extrabold leading-tight tabular-nums text-text">{value}</span>
      )}
      <span className="truncate t-meta font-medium text-text-muted">{caption ? `${label}, ${caption}` : label}</span>
    </span>
  </div>
);

const TONE_TEXT = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text' } as const;
const TONE_BAR = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-primary-500' } as const;

const ZONES = 'linear-gradient(to right, color-mix(in oklab, var(--color-danger) 16%, transparent) 50%, color-mix(in oklab, var(--color-warning) 16%, transparent) 50% 80%, color-mix(in oklab, var(--color-success) 16%, transparent) 80%)';

const MODULES: { key: 'checklist' | 'ticket' | 'delegation'; label: string }[] = [
  { key: 'checklist', label: 'Checklists' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'delegation', label: 'Delegations' },
];

const RangeLine = ({ value, tone, size = 'md', delay = 0 }: { value: number; tone: keyof typeof TONE_BAR; size?: 'sm' | 'md'; delay?: number }) => (
  <span
    className={cn('relative block w-full overflow-hidden rounded-full', size === 'md' ? 'h-2.5' : 'h-1.5')}
    style={{ background: ZONES, ['--stat-delay' as string]: `${delay}ms` }}
    aria-hidden="true"
  >
    <span className={cn('bar-grow absolute inset-y-0 left-0 rounded-full', TONE_BAR[tone])} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    <span className="absolute inset-y-0 w-px bg-surface/80" style={{ left: '50%' }} />
    <span className="absolute inset-y-0 w-px bg-surface/80" style={{ left: '80%' }} />
  </span>
);

interface ScoreStripProps {
  kind: ScoreKind;
  id: string;
  name: string;
  row: ExplorerRow | null | undefined;
  from: string;
  to: string;
  failed?: boolean;
}

export const ScoreStrip = ({ kind, id, name, row, from, to, failed }: ScoreStripProps) => {
  const overall = row?.overall ?? null;
  const due = row?.totalDue ?? 0;
  const tone = overall === null ? 'neutral' : rateTone(overall, due);
  const loading = row === undefined && !failed;
  const modules = row
    ? MODULES.flatMap((m) => {
        const block: ExplorerBlock = row[m.key];
        return block.due > 0 && block.score !== null ? [{ ...m, score: block.score }] : [];
      })
    : [];

  return (
    <Link
      viewTransition
      to={scoresHref(kind, id, name, from, to)}
      aria-label={`Open ${name}'s scores`}
      className="group/score relative z-10 flex flex-col gap-2.5 rounded-xl border border-border/60 bg-surface-hover/50 p-3 transition-colors duration-150 hover:border-primary-300 hover:bg-primary-500/5 active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:bg-surface-hover/30"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
          <Trophy className="size-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1 t-meta font-display font-semibold text-text-secondary">Score this month</span>
        {loading ? (
          <Skeleton className="h-5 w-12" />
        ) : overall === null ? (
          <span className="t-card font-display font-bold text-text-light">{failed ? 'Not loaded' : 'Nothing due'}</span>
        ) : (
          <>
            <span className={cn('t-stat font-display font-extrabold leading-none tabular-nums', TONE_TEXT[tone])}>
              <CountUp value={Math.round(overall)} fromZero format={(n) => `${n}%`} />
            </span>
            <ToneChip tone={tone} />
          </>
        )}
        <ChevronRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover/score:translate-x-0.5" aria-hidden="true" />
      </span>

      {overall !== null && (
        <span className="flex flex-col gap-1">
          <RangeLine value={overall} tone={tone} />
          <span className="relative block h-3.5 t-meta font-medium text-text-light" aria-hidden="true">
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>50</span>
            <span className="absolute -translate-x-1/2" style={{ left: '80%' }}>80</span>
            <span className="absolute right-0">100</span>
          </span>
        </span>
      )}

      {modules.length > 0 && (
        <span className="grid grid-cols-3 gap-2 border-t border-border/50 pt-2.5">
          {modules.map((m, i) => {
            const t = rateTone(m.score, Number.MAX_SAFE_INTEGER);
            return (
              <span key={m.key} className="flex min-w-0 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-1">
                  <span className="truncate t-meta font-medium text-text-muted">{m.label}</span>
                  <span className={cn('t-meta font-display font-bold tabular-nums', TONE_TEXT[t])}>{Math.round(m.score)}%</span>
                </span>
                <RangeLine value={m.score} tone={t} size="sm" delay={120 + i * 70} />
              </span>
            );
          })}
        </span>
      )}
    </Link>
  );
};
