import { memo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, IconChip, Skeleton } from '../../components';
import { resolveAvatarUrl } from '../../lib/uploadsBase';
import type { DayCell, PersonStatus } from '../../api/exceptions';
import { DAY_LOOK, LEVEL_LOOK, attentionChips, dayMonthOf, weekdayOf } from './attentionDisplay';

const MAX_CHIPS = 3;

export const LevelAvatar = ({ name, src, level, size = 'md' }: { name: string; src: string | null; level: 'red' | 'orange' | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) => (
  <span className="relative inline-flex shrink-0">
    <Avatar name={name} src={resolveAvatarUrl(src)} size={size} className={cn(level && 'ring-2 ring-offset-2 ring-offset-surface', level && LEVEL_LOOK[level].ring)} />
    {level && <span aria-hidden className={cn('absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface', LEVEL_LOOK[level].dot, level === 'red' && 'animate-pulse motion-reduce:animate-none')} />}
  </span>
);

export const WeekDots = ({ cells, compact = false }: { cells: DayCell[]; compact?: boolean }) => (
  <ol className={cn('flex items-end', compact ? 'gap-1' : 'gap-1.5 sm:gap-2')} aria-label="Last 7 days">
    {cells.map((c) => (
      <li key={c.date} className="flex flex-col items-center gap-1" title={`${dayMonthOf(c.date)}: ${DAY_LOOK[c.state].label}${c.total ? ` (${c.done} of ${c.total})` : ''}`}>
        <span className={cn('rounded-md', compact ? 'size-3' : 'size-6 sm:size-7', DAY_LOOK[c.state].cell)} />
        {!compact && <span className="t-meta font-medium text-text-muted">{weekdayOf(c.date).slice(0, 2)}</span>}
        <span className="sr-only">{`${dayMonthOf(c.date)}: ${DAY_LOOK[c.state].label}`}</span>
      </li>
    ))}
  </ol>
);

interface AttentionPersonRowProps {
  person: PersonStatus;
  onOpen: (userId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (userId: string) => void;
}

export const AttentionPersonRow = memo(({ person, onOpen, selectable = false, selected = false, onToggle }: AttentionPersonRowProps) => {
  const chips = attentionChips(person);
  const shown = chips.slice(0, MAX_CHIPS);
  const extra = chips.length - shown.length;
  const meta = [person.departmentName, person.storeName].filter(Boolean).join(' · ');
  return (
    <div className={cn('flex items-center gap-2 px-3 sm:px-4 transition-colors duration-150', selected && 'bg-primary-500/5')}>
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${person.name}`}
          onClick={() => onToggle?.(person.userId)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
        >
          <span className={cn('flex size-5 items-center justify-center rounded-md border transition-colors duration-150', selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover bg-surface')}>
            {selected && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(person.userId)}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none rounded-lg cursor-pointer active:scale-[0.985] transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <LevelAvatar name={person.name} src={person.avatarUrl} level={person.level} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="line-clamp-1 t-card font-display font-semibold text-text">{person.name}</span>
            {person.lastRemindedAt && <span className="shrink-0 t-meta font-medium text-text-muted">Reminded</span>}
          </span>
          {meta && <span className="line-clamp-1 t-meta font-medium text-text-muted">{meta}</span>}
          <span className="flex flex-wrap gap-1.5">
            {shown.map((c) => <IconChip key={c.key} icon={c.icon} tone={c.tone} label={c.label} labelClassName={c.text} />)}
            {extra > 0 && <IconChip icon={false} label={`+${extra}`} />}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
      </button>
    </div>
  );
});
AttentionPersonRow.displayName = 'AttentionPersonRow';

export const AttentionRowSkeleton = () => (
  <div className="flex items-center gap-3 px-3 sm:px-4 py-3 min-h-16">
    <Skeleton className="size-10 shrink-0 rounded-full" />
    <span className="flex flex-1 flex-col gap-1.5">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-5 w-3/4 rounded-full" />
    </span>
  </div>
);
