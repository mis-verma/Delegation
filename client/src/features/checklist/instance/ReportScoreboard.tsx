import { memo, useMemo } from 'react';
import { ChevronRight, Crown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { rateToneClass } from '../checklistDisplay';

export interface ScoreboardItem {
  id: string;
  name: string;
  due: number;
  missed: number;
  open: number;
  completion: number | null;
  compliance: number | null;
}

interface ScoreboardProps {
  /** "department" or "store", used in the words on the page. */
  noun: string;
  items: ScoreboardItem[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** "this week", "last month", "2026": the window the winner is for. */
  windowLabel: string;
  /** Opens that department's or store's checklists in the matrix. */
  onOpen: (id: string) => void;
}

type Ranked = ScoreboardItem & { score: number | null };

/**
 * The score is the two measures that matter, completion and compliance, counted equally. With no checked
 * answers yet, completion stands alone, so a store is not punished for having nothing to check.
 */
const scoreOf = (i: Pick<ScoreboardItem, 'completion' | 'compliance'>) => {
  if (i.completion === null) return null;
  return i.compliance === null ? i.completion : Math.round((i.completion + i.compliance) / 2);
};

const Figure = ({ value, onClick, label }: { value: number | null; onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={cn(
      'inline-flex items-center justify-center min-w-14 min-h-11 sm:min-h-9 rounded-lg px-2 text-sm font-display font-bold tabular-nums outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40',
      value === null ? 'text-text-light' : rateToneClass(value),
    )}
  >
    {value === null ? '-' : `${value}%`}
  </button>
);

const RankMark = ({ rank }: { rank: number | null }) =>
  rank === 1 ? (
    <span className="inline-flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-warning to-warning/70 text-white" title="Winner">
      <Crown className="size-3.5" aria-hidden="true" />
    </span>
  ) : (
    <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-hover text-xs font-display font-bold tabular-nums text-text-secondary">{rank ?? '-'}</span>
  );

const Row = memo(({ item, rank, noun, onOpen }: { item: Ranked; rank: number | null; noun: string; onOpen: (id: string) => void }) => {
  const open = () => onOpen(item.id);
  const what = `${item.name}, ${noun}`;
  return (
    <tr className="border-t border-border/60 hover:bg-surface-hover/40 transition-colors">
      <td className="pl-4 pr-1 py-2 w-12"><RankMark rank={rank} /></td>
      <th scope="row" className="px-2 py-2 text-left font-normal">
        <button type="button" onClick={open} className="group inline-flex items-center gap-1 rounded text-left text-sm font-display font-semibold text-text outline-none hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:text-primary-300">
          {item.name}
          <ChevronRight className="size-3.5 text-text-light transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        {item.due + item.open === 0 && <span className="block text-xs text-text-muted">Nothing due</span>}
      </th>
      <td className="px-1 py-1 text-center"><Figure value={item.score} onClick={open} label={`${what}: overall score, open its checklists`} /></td>
      <td className="px-1 py-1 text-center"><Figure value={item.completion} onClick={open} label={`${what}: completion, open its checklists`} /></td>
      <td className="px-1 py-1 text-center"><Figure value={item.compliance} onClick={open} label={`${what}: compliance, open its checklists`} /></td>
      <td className="px-2 py-1 text-center text-sm font-display tabular-nums text-text-secondary">{item.due}</td>
      <td className={cn('pr-4 pl-2 py-1 text-center text-sm font-display font-bold tabular-nums', item.missed ? 'text-danger' : 'text-text-light')}>{item.missed}</td>
    </tr>
  );
});
Row.displayName = 'ScoreboardRow';

const Card = memo(({ item, rank, onOpen }: { item: Ranked; rank: number | null; onOpen: (id: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(item.id)}
    className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5 text-left outline-none transition-colors hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <span className="flex items-center gap-2.5">
      <RankMark rank={rank} />
      <span className="min-w-0 flex-1 text-sm font-display font-semibold text-text leading-snug line-clamp-2">{item.name}</span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className={cn('text-lg font-display font-bold tabular-nums', item.score === null ? 'text-text-light' : rateToneClass(item.score))}>{item.score === null ? '-' : `${item.score}%`}</span>
        <span className="t-meta text-text-muted">overall score</span>
      </span>
    </span>
    <span className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5 text-center">
      {[
        { label: 'Completion', value: item.completion },
        { label: 'Compliance', value: item.compliance },
      ].map((m) => (
        <span key={m.label} className="flex flex-col">
          <span className="t-meta text-text-muted">{m.label}</span>
          <span className={cn('text-sm font-display font-bold tabular-nums', m.value === null ? 'text-text-light' : rateToneClass(m.value))}>{m.value === null ? '-' : `${m.value}%`}</span>
        </span>
      ))}
      <span className="flex flex-col">
        <span className="t-meta text-text-muted">Not filled</span>
        <span className={cn('text-sm font-display font-bold tabular-nums', item.missed ? 'text-danger' : 'text-text-light')}>{item.missed}</span>
      </span>
    </span>
  </button>
));
Card.displayName = 'ScoreboardCard';

const HEAD = 'px-2 py-2.5 text-center text-xs font-display font-semibold text-text-secondary';

/**
 * Departments or stores side by side, best first. The winner of the picked week, month or year is the top
 * score, shown in a banner, and every name and figure opens that group's checklists in the matrix.
 */
export const ReportScoreboard = ({ noun, items, loading, error, onRetry, windowLabel, onOpen }: ScoreboardProps) => {
  const { ranked, winner } = useMemo(() => {
    const scored: Ranked[] = (items ?? []).map((i) => ({ ...i, score: scoreOf(i) }));
    // Best first: score, then compliance, then completion. Groups with nothing due go to the bottom, unranked.
    const live = scored.filter((i) => i.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.compliance ?? -1) - (a.compliance ?? -1) || (b.completion ?? -1) - (a.completion ?? -1) || a.name.localeCompare(b.name));
    const idle = scored.filter((i) => i.score === null).sort((a, b) => a.name.localeCompare(b.name));
    // Everyone level on the top score shares the win.
    const top = live[0];
    const tied = top ? live.filter((i) => i.score === top.score && i.compliance === top.compliance && i.completion === top.completion) : [];
    return { ranked: [...live, ...idle], winner: tied };
  }, [items]);

  if (error) return <InlineError message={`We couldn't load the ${noun} scores. Check your connection and try again.`} onRetry={onRetry} />;

  if (loading && !items) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={`Loading ${noun} scores`}>
        <Skeleton className="h-20 rounded-lg" />
        <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4')}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (ranked.length === 0) {
    return <EmptyState icon={Trophy} title={`No ${noun} scores in this window`} description="Try another period, or clear the store filter." />;
  }

  const rankOf = (i: Ranked, idx: number) => (i.score === null ? null : ranked.findIndex((r) => r.score === i.score && r.compliance === i.compliance && r.completion === i.completion) + 1 || idx + 1);

  return (
    <div className="flex flex-col gap-3">
      {winner.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-warning to-warning/70 text-white">
            <Trophy className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="t-meta font-display font-semibold text-text-secondary">Winner, {windowLabel}</p>
            <p className="text-base font-display font-bold text-text leading-snug">{winner.map((w) => w.name).join(' and ')}</p>
          </div>
          <div className="ml-auto flex shrink-0 flex-col items-end">
            <span className="text-xl font-display font-bold tabular-nums text-text">{winner[0].score}%</span>
            <span className="t-meta text-text-muted">overall</span>
          </div>
        </div>
      )}

      <div className={cn(PANEL_CLASS, 'hidden md:block overflow-x-auto')}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{noun} scores for {windowLabel}, best first</caption>
          <thead>
            <tr>
              <th scope="col" className="pl-4 pr-1 py-2.5 w-12"><span className="sr-only">Rank</span></th>
              <th scope="col" className="px-2 py-2.5 text-xs font-display font-semibold text-text-secondary capitalize">{noun}</th>
              <th scope="col" className={HEAD} title="Overall score: completion and compliance, counted equally">Overall score</th>
              <th scope="col" className={HEAD} title="Share of due checklists that got filled">Completion</th>
              <th scope="col" className={HEAD} title="How well the checked answers were answered">Compliance</th>
              <th scope="col" className={HEAD} title="Checklists that were due">Due</th>
              <th scope="col" className={cn(HEAD, 'pr-4')} title="Due checklists nobody filled">Not filled</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item, idx) => <Row key={item.id} item={item} rank={rankOf(item, idx)} noun={noun} onOpen={onOpen} />)}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-2.5">
        {ranked.map((item, idx) => <Card key={item.id} item={item} rank={rankOf(item, idx)} onOpen={onOpen} />)}
      </div>

      <p className="t-meta text-text-muted">
        Overall score is completion and compliance counted equally. Tap a name or a figure to see that {noun}'s checklists.
      </p>
    </div>
  );
};
