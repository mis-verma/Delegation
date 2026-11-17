import { memo } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { labelDotClass } from '../../../lib/labelColors';
import type { TagUsage } from '../../../api/tags';

const useText = (tag: TagUsage): string => {
  const parts = [
    tag.tickets > 0 ? `${tag.tickets} ${tag.tickets === 1 ? 'ticket' : 'tickets'}` : null,
    tag.tasks > 0 ? `${tag.tasks} ${tag.tasks === 1 ? 'delegation' : 'delegations'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not used';
};

interface LabelRowProps {
  tag: TagUsage;
  selected: boolean;
  onToggle: (id: string) => void;
  note?: string;
}

export const LabelRow = memo(({ tag, selected, onToggle, note }: LabelRowProps) => {
  const unused = tag.tickets + tag.tasks === 0;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={() => onToggle(tag.id)}
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:px-3',
          selected ? 'border-primary-500 bg-primary-500/5' : 'border-border/60 bg-surface hover:border-border-hover',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
            selected ? 'border-primary-600 bg-primary-600' : 'border-border-hover',
          )}
        >
          {selected && <span className="size-2 rounded-[2px] bg-white" />}
        </span>
        <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md text-white', labelDotClass(tag))} aria-hidden>
          <TagIcon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate t-card font-display font-semibold text-text">{tag.name}</span>
          <span className={cn('truncate t-meta font-display', unused ? 'text-text-muted' : 'text-text-secondary')}>{useText(tag)}</span>
        </span>
        {note && <span className="shrink-0 rounded-md bg-surface-hover px-1.5 py-0.5 t-meta font-display font-semibold text-text-secondary">{note}</span>}
      </button>
    </li>
  );
});
LabelRow.displayName = 'LabelRow';
