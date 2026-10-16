import { CheckCircle2, CircleDashed, CircleX, Gauge, RotateCcw, Timer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNow } from '../../lib/useNow';
import { formatSpan, type Completion, type Compliance, type ItemScore } from '../../lib/itemScore';

interface ItemScoreCardProps {
  /** The item's score at a given time (lib/itemScore ticketScore / taskScore). The card ticks every 30s. */
  scoreAt: (now: number) => ItemScore;
  /** "ticket" or "delegation", for the wording. */
  noun: string;
}

type Tone = 'good' | 'bad' | 'quiet';

const TONE: Record<Tone, { text: string; icon: string }> = {
  good: { text: 'text-success', icon: 'bg-success/12 text-success' },
  bad: { text: 'text-danger', icon: 'bg-danger/10 text-danger' },
  quiet: { text: 'text-text-muted', icon: 'bg-surface-hover text-text-muted' },
};

const COMPLETION: Record<Completion, { word: string; tone: Tone; icon: LucideIcon }> = {
  done: { word: 'Done', tone: 'good', icon: CheckCircle2 },
  not_done: { word: 'Not done', tone: 'bad', icon: CircleX },
  not_counted: { word: 'Not counted yet', tone: 'quiet', icon: CircleDashed },
};

const COMPLIANCE: Record<Compliance, { word: string; tone: Tone; icon: LucideIcon }> = {
  on_time: { word: 'On time', tone: 'good', icon: CheckCircle2 },
  late: { word: 'Late', tone: 'bad', icon: Timer },
  missed: { word: 'Missed', tone: 'bad', icon: CircleX },
  reopened: { word: 'Reopened', tone: 'bad', icon: RotateCcw },
  not_counted: { word: 'Not counted yet', tone: 'quiet', icon: CircleDashed },
};

const Cell = ({ label, word, tone, icon: Icon }: { label: string; word: string; tone: Tone; icon: LucideIcon }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-surface px-2 py-1.5">
    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', TONE[tone].icon)} aria-hidden="true">
      <Icon size={13} strokeWidth={2.5} />
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="t-meta text-text-muted leading-tight">{label}</span>
      <span className={cn('truncate t-meta font-display font-semibold leading-tight', TONE[tone].text)}>{word}</span>
    </span>
  </div>
);

/** The one line under the two cells: what the clock says right now, in plain words. */
const statusLine = (s: ItemScore, now: number, noun: string) => {
  if (!s.scored) return `No due time, so this ${noun} does not count in the scores.`;
  const due = s.dueAt!.getTime();
  if (s.compliance === 'reopened') return `Reopened ${s.reopenCount}×. A reopened ${noun} counts as not on time.`;
  if (s.compliance === 'not_counted') return `Due in ${formatSpan(due - now)}. Hand it in by then to keep it on time.`;
  if (s.compliance === 'missed') return `Overdue by ${formatSpan(now - due)}. Counts as not done until it is handed in.`;
  if (!s.finishedAt) return 'Handed in on time.';
  const gap = s.finishedAt.getTime() - due;
  return gap <= 0 ? `Handed in ${formatSpan(gap)} before the due time.` : `Handed in ${formatSpan(gap)} after the due time.`;
};

/**
 * How this one item counts in Completion and Compliance on the Scores page, live: the countdown ticks every
 * 30 seconds, and a status change from anyone lands through the socket refresh of the detail query. Same rules as
 * the server (lib/itemScore).
 */
export const ItemScoreCard = ({ scoreAt, noun }: ItemScoreCardProps) => {
  const now = useNow(30_000);
  const score = scoreAt(now);
  const completion = COMPLETION[score.completion];
  const compliance = COMPLIANCE[score.compliance];
  const urgent = score.compliance === 'not_counted' && score.dueAt && score.dueAt.getTime() - now < 3 * 3_600_000;
  return (
    <section aria-label="Score" className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/40 p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true">
          <Gauge size={13} strokeWidth={2.25} />
        </span>
        <span className="t-meta font-display font-semibold text-text-secondary">Score</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-px t-meta font-semibold text-success" title="Updates by itself">
          <span className="relative flex size-1.5" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Cell label="Completion" {...completion} />
        <Cell label="Compliance" {...compliance} />
      </div>
      <p className={cn('t-meta leading-snug tabular-nums', urgent ? 'font-semibold text-warning' : 'text-text-muted')}>
        {statusLine(score, now, noun)}
      </p>
    </section>
  );
};
