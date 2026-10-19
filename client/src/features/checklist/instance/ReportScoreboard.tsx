import { memo, useMemo } from 'react';
import { ChevronRight, CircleHelp, Crown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { formatPct } from '../../../lib/percent';
import { HowCalculated } from '../../scores/HowCalculated';
import { CARD_PAD } from '../../scores/controlStyles';
import { NumCell, NumHead } from '../../scores/scoreTableParts';
import { SCORE_LABEL, complianceLabel } from '../../../lib/scoreLabels';
import { MIN_RANK_VOLUME } from '../../dashboard/scoreMetrics';
import { rateToneClass } from '../checklistDisplay';
import { rankScoreboard, type RankedScoreboardItem, type ScoreboardItem } from './reportScoreboardRank';

export type { ScoreboardItem } from './reportScoreboardRank';

interface ScoreboardProps {
  noun: string;
  items: ScoreboardItem[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  updating?: boolean;
  windowLabel: string;
  onOpen: (id: string) => void;
}

type Ranked = RankedScoreboardItem;

const Figure = ({ value, onClick, label }: { value: number | null; onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={cn(
      'inline-flex min-h-11 min-w-14 items-center justify-end rounded-lg px-2 t-card font-display font-bold tabular-nums outline-none sm:min-h-9 transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40',
      value === null ? 'text-text-light' : rateToneClass(value),
    )}
  >
    {formatPct(value)}
  </button>
);

const RankMark = ({ rank }: { rank: number | null }) =>
  rank === 1 ? (
    <span className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-surface-hover text-warning" title="Winner">
      <Crown className="size-3.5" aria-hidden="true" />
    </span>
  ) : (
    <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-hover t-meta font-display font-bold tabular-nums text-text-secondary">{rank ?? '-'}</span>
  );

const Row = memo(({ item, rank, noun, onOpen }: { item: Ranked; rank: number | null; noun: string; onOpen: (id: string) => void }) => {
  const open = () => onOpen(item.id);
  const what = `${item.name}, ${noun}`;
  return (
    <tr className="border-t border-border/60 transition-colors hover:bg-surface-hover">
      <td className="pl-4 pr-1 py-2 w-12"><RankMark rank={rank} /></td>
      <th scope="row" className="px-2 py-2 text-left font-normal">
        <button type="button" onClick={open} className="group inline-flex min-h-9 items-center gap-1 rounded text-left t-card font-display font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
          {item.name}
          <ChevronRight className="size-3.5 text-text-light" aria-hidden="true" />
        </button>
        {item.due + item.open === 0 ? <span className="block t-meta text-text-muted">Nothing due</span> : !item.rankable && <span className="block t-meta text-text-muted">Too few runs (fewer than {MIN_RANK_VOLUME} due)</span>}
      </th>
      <NumCell className="px-1 py-1"><Figure value={item.score} onClick={open} label={`${what}: checklist score, open its checklists`} /></NumCell>
      <NumCell className="px-1 py-1"><Figure value={item.completion} onClick={open} label={`${what}: ${SCORE_LABEL.completion.toLowerCase()}, open its checklists`} /></NumCell>
      <NumCell className="px-1 py-1"><Figure value={item.compliance} onClick={open} label={`${what}: ${complianceLabel('checklist').toLowerCase()}, open its checklists`} /></NumCell>
      <NumCell className="px-3 py-1 font-display text-text-secondary">{item.due}</NumCell>
      <NumCell className="px-3 py-1 font-display text-text-secondary">{item.completed}</NumCell>
      <NumCell className={cn('py-1 pl-3 pr-4 font-display font-bold', item.missed ? 'text-danger' : 'text-text-light')}>{item.missed}</NumCell>
    </tr>
  );
});
Row.displayName = 'ScoreboardRow';

const Card = memo(({ item, rank, onOpen }: { item: Ranked; rank: number | null; onOpen: (id: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(item.id)}
    className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 text-left outline-none transition-colors hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <span className="flex items-center gap-3">
      <RankMark rank={rank} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2">{item.name}</span>
        {item.due + item.open === 0
          ? <span className="t-meta text-text-muted">Nothing due</span>
          : !item.rankable && <span className="t-meta text-text-muted">Too few runs (fewer than {MIN_RANK_VOLUME} due)</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className={cn('t-stat font-display tabular-nums', item.score === null ? 'text-text-light' : rateToneClass(item.score))}>{formatPct(item.score)}</span>
        <span className="t-meta text-text-muted">checklist score</span>
      </span>
    </span>
    <span className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-center">
      {[
        { label: SCORE_LABEL.completion, value: item.completion },
        { label: complianceLabel('checklist'), value: item.compliance },
      ].map((m) => (
        <span key={m.label} className="flex flex-col">
          <span className="t-meta text-text-muted">{m.label}</span>
          <span className={cn('t-card font-display font-bold tabular-nums', m.value === null ? 'text-text-light' : rateToneClass(m.value))}>{formatPct(m.value)}</span>
        </span>
      ))}
      <span className="flex flex-col">
        <span className="t-meta text-text-muted">Filled</span>
        <span className="t-card font-display font-bold tabular-nums text-text">{item.completed}</span>
      </span>
      <span className="flex flex-col">
        <span className="t-meta text-text-muted">Not filled</span>
        <span className={cn('t-card font-display font-bold tabular-nums', item.missed ? 'text-danger' : 'text-text-light')}>{item.missed}</span>
      </span>
    </span>
  </button>
));
Card.displayName = 'ScoreboardCard';

const RuleNote = ({ noun }: { noun: string }) => {
  const rule = `Checklist score is completion and answers right counted equally. A ${noun} needs at least ${MIN_RANK_VOLUME} due runs to be ranked or win. Ties go to the higher score, then answers right, then completion, then more runs.`;
  return (
    <>
      <p className="hidden md:block t-meta text-text-muted">{rule} Click a name or a figure to see that {noun}'s checklists.</p>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="How the ranking works" className="md:hidden inline-flex w-fit items-center gap-1.5 min-h-11 rounded-lg px-2 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
            <CircleHelp className="size-4" aria-hidden="true" />
            How the ranking works
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3">
          <p className="t-card font-display text-text-secondary">{rule} Tap a {noun} to see its checklists.</p>
        </PopoverContent>
      </Popover>
    </>
  );
};

export const ReportScoreboard = ({ noun, items, loading, error, onRetry, updating, windowLabel, onOpen }: ScoreboardProps) => {
  const { ranked, winner, rankOf } = useMemo(() => rankScoreboard(items), [items]);

  if (error) return <InlineError message={`We couldn't load the ${noun} scores. Check your connection and try again.`} onRetry={onRetry} />;

  if (loading && !items) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={`Loading ${noun} scores`}>
        <Skeleton className="h-20 rounded-lg" />
        <div className={cn(PANEL_CLASS, 'flex flex-col gap-3', CARD_PAD)}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (ranked.length === 0) {
    return <EmptyState icon={Trophy} title={`No ${noun} scores in this window`} description="Try another period, or clear the store filter." />;
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={updating}>
      {winner.length > 0 && (
        <div className={cn(PANEL_CLASS, 'flex items-center justify-between gap-3', CARD_PAD)}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-hover text-warning">
              <Trophy className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="t-meta font-display font-semibold text-text-secondary">Winner, {windowLabel}</p>
              <p className="t-card font-display font-bold leading-snug text-text">{winner.map((w) => w.name).join(' and ')}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="t-stat font-display tabular-nums text-text">{formatPct(winner[0].score)}</span>
            <span className="t-meta text-text-muted">checklist score</span>
          </div>
        </div>
      )}

      {winner.length === 0 && (
        <p className="t-meta font-display text-text-muted">No winner for {windowLabel}: no {noun} had {MIN_RANK_VOLUME} or more due runs.</p>
      )}

      <div className={cn(PANEL_CLASS, 'hidden md:block overflow-x-auto')}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{noun} scores for {windowLabel}, best first</caption>
          <thead>
            <tr>
              <th scope="col" className="w-12 py-2 pl-4 pr-1"><span className="sr-only">Rank</span></th>
              <th scope="col" className="px-2 py-2 t-meta font-display font-semibold text-text-secondary capitalize">{noun}</th>
              <NumHead><span className="inline-flex items-center justify-end gap-0.5">Checklist score<HowCalculated figure="overall" /></span></NumHead>
              <NumHead><span className="inline-flex items-center justify-end gap-0.5">{SCORE_LABEL.completion}<HowCalculated figure="completion" module="checklist" /></span></NumHead>
              <NumHead><span className="inline-flex items-center justify-end gap-0.5">{complianceLabel('checklist')}<HowCalculated figure="compliance" module="checklist" /></span></NumHead>
              <NumHead title="Checklists that were due">Due</NumHead>
              <NumHead title="Due checklists that got filled, on time or late">Filled</NumHead>
              <NumHead className="pr-4" title="Due checklists nobody filled">Not filled</NumHead>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item, idx) => <Row key={item.id} item={item} rank={rankOf(item, idx)} noun={noun} onOpen={onOpen} />)}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {ranked.map((item, idx) => <Card key={item.id} item={item} rank={rankOf(item, idx)} onOpen={onOpen} />)}
      </div>

      <RuleNote noun={noun} />

      {updating && (
        <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {windowLabel} loads.</p>
      )}
    </div>
  );
};
