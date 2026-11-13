import { cn } from '@/lib/utils';
import { InlineError, PANEL_CLASS } from '../../components';
import type { ExplorerRow } from '../../api/scores';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { DashCardHeader } from '../dashboard/DashCardHeader';
import { FigureCard } from '../dashboard/FigureCard';
import { figureToneOf } from '../dashboard/scoreTone';
import { figureOf, shortDay, type OwnerFigure } from './ownerWindow';
import { OwnerDayByDay } from './OwnerDayByDay';

const MODULES = ['checklist', 'ticket', 'delegation'] as const;
const GRID_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

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
                : `Change compares with the same ${compare.days === 1 ? 'day' : 'days'} before, ${compare.days === 1 ? shortDay(compare.from) : `${shortDay(compare.from)} to ${shortDay(compare.to)}`}.`}
            </p>
          )}
        </>
      )}
      <OwnerDayByDay />
    </div>
  </section>
  );
};
