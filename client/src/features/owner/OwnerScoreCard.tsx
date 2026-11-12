import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { InlineError, PANEL_CLASS, Skeleton } from '../../components';
import { scoreApi, type ExplorerRow, type TrendBucket } from '../../api/scores';
import { HEAT_KEY, heatFill } from '../../lib/heatScale';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { DashCardHeader } from '../dashboard/DashCardHeader';
import { FigureCard } from '../dashboard/FigureCard';
import { HeatDots } from '../dashboard/HeatDots';
import { SCORE_QUERY_OPTIONS } from '../dashboard/scoreQueries';
import { figureToneOf } from '../dashboard/scoreTone';
import { useOrgToday } from '../checklist/useOrgToday';
import { figureOf, shiftDay, shortDay, type OwnerFigure } from './ownerWindow';
import { PeriodTag } from './PeriodTag';

const MODULES = ['checklist', 'ticket', 'delegation'] as const;
const GRID_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const TREND_DAYS = 7;

const pctText = (n: number) => `${n.toFixed(1)}%`;

interface Compare {
  before: ExplorerRow | undefined;
  loading: boolean;
  failed: boolean;
  from: string;
  to: string;
  days: number;
}

const ChangeCaption = ({ now, before, compare }: { now: number | null; before: number | null; compare: Compare }) => {
  if (now === null) return <>Nothing due</>;
  if (compare.failed) return <>Couldn&apos;t compare</>;
  if (compare.loading) return null;
  if (before === null) return <>Nothing to compare</>;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <>Same as before</>;
  return (
    <span className={cn('font-semibold', diff > 0 ? 'text-vivid-green-text' : 'text-vivid-red-text')}>
      {diff > 0 ? 'Up' : 'Down'} {Math.abs(diff)} pts
    </span>
  );
};

const dotValue = (b: TrendBucket, key: (typeof MODULES)[number]): number | null => {
  const m = b[key];
  return m.due <= 0 ? null : m.score;
};

const LastSevenDays = () => {
  const today = useOrgToday();
  const from = shiftDay(today, -(TREND_DAYS - 1));
  const trend = useQuery({
    queryKey: ['scores', 'trend', 'org', 'me', 'day', from, today],
    queryFn: () => scoreApi.trend({ scope: 'org', period: 'day', from, to: today }),
    ...SCORE_QUERY_OPTIONS,
  });
  const buckets = trend.data?.buckets ?? [];

  return (
    <section aria-labelledby="owner-week-heading" className="flex flex-col gap-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="owner-week-heading" className="t-card font-display font-bold text-text">Day by day</h3>
        <PeriodTag label="Last 7 days" />
      </div>
      {trend.isError && !trend.data ? (
        <InlineError message="Couldn't load the last 7 days." onRetry={() => void trend.refetch()} />
      ) : !trend.data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading the last 7 days">
          {MODULES.map((m) => <Skeleton key={m} className="h-5 w-full rounded-md" />)}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {MODULES.map((m) => (
            <li key={m} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="t-meta font-semibold text-text-secondary">{MODULE_LABEL[m]}</span>
              <HeatDots fill values={buckets.map((b) => dotValue(b, m))} labels={buckets.map((b) => b.label)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 t-meta font-medium text-text-muted" aria-label="Colour key">
        <span className="font-display font-semibold text-text-secondary">Score</span>
        {HEAT_KEY.map(({ level, label }) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-md" style={{ background: heatFill(level) }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="flex size-3.5 items-center justify-center rounded-md bg-surface-hover/60 text-text-light" aria-hidden="true"><span className="size-1 rounded-full bg-current" /></span>
          Nothing due
        </span>
        <span className="basis-full sm:ml-auto sm:basis-auto">Oldest day on the left.</span>
      </div>
    </section>
  );
};

interface OwnerScoreCardProps {
  periodLabel: string;
  total: ExplorerRow | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  compare: Compare;
  detailHref: string;
}

export const OwnerScoreCard = ({ periodLabel, total, loading, failed, onRetry, compare, detailHref }: OwnerScoreCardProps) => {
  const withData = loading ? [...MODULES] : MODULES.filter((m) => figureOf(total, m) !== null);
  const idle = loading ? [] : MODULES.filter((m) => figureOf(total, m) === null);
  const single = !loading && withData.length === 1;
  const moduleTiles = single ? [] : withData;
  const tiles: { key: OwnerFigure; label: string }[] = [
    { key: 'all', label: single ? `Company score, ${MODULE_LABEL[withData[0]!].toLowerCase()} only` : 'Company score' },
    ...moduleTiles.map((key) => ({ key, label: MODULE_LABEL[key] })),
  ];
  const idleNote = idle.length === 0
    ? null
    : `${joinNames(idle.map((m) => MODULE_LABEL[m]))}: nothing due ${periodLabel.toLowerCase()}${single ? `, so the company score is the ${MODULE_LABEL[withData[0]!].toLowerCase()} score.` : '.'}`;
  return (
  <section aria-labelledby="owner-score-heading" className={cn(PANEL_CLASS, 'flex flex-col')}>
    <DashCardHeader id="owner-score-heading" title="Company score" />
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      {failed ? (
        <InlineError message="Couldn't load the company score." onRetry={onRetry} />
      ) : (
        <>
          <div
            className={cn(
              'grid gap-2',
              tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
              tiles.length > 1 && tiles.length % 2 === 1 && 'max-sm:[&>*:first-child]:col-span-2',
              GRID_COLS[tiles.length],
            )}
          >
            {tiles.map(({ key, label }) => {
              const now = figureOf(total, key);
              return (
                <FigureCard
                  key={key}
                  label={label}
                  value={now}
                  tone={figureToneOf(now)}
                  bar={now}
                  loading={loading}
                  decimals={1}
                  format={pctText}
                  caption={loading ? undefined : <ChangeCaption now={now} before={figureOf(compare.before, key)} compare={compare} />}
                  to={detailHref}
                />
              );
            })}
          </div>
          {idleNote && <p className="t-meta font-medium text-text-secondary">{idleNote}</p>}
          {!loading && (
            <p className="t-meta font-medium text-text-secondary">
              {compare.failed
                ? "Couldn't compare with the period before. The scores above are still right."
                : `Change compares with the ${compare.days === 1 ? 'day' : `${compare.days} days`} before, ${compare.days === 1 ? shortDay(compare.from) : `${shortDay(compare.from)} to ${shortDay(compare.to)}`}.`}
            </p>
          )}
        </>
      )}
      <LastSevenDays />
    </div>
  </section>
  );
};
