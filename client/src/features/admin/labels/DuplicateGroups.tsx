import { ArrowRight, Merge } from 'lucide-react';
import { Button, IconChip } from '../../../components';
import type { TagDuplicateGroup } from '../../../api/tags';

interface DuplicateGroupsProps {
  groups: readonly TagDuplicateGroup[];
  busyKey: string | null;
  canMerge: boolean;
  onMerge: (group: TagDuplicateGroup) => void;
}

export const DuplicateGroups = ({ groups, busyKey, canMerge, onMerge }: DuplicateGroupsProps) => {
  if (groups.length === 0) return null;
  return (
    <section aria-label="Labels that look like the same thing" className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="t-card font-display font-bold text-text">
          {groups.length} {groups.length === 1 ? 'label is' : 'labels are'} written more than one way
        </h3>
        <p className="t-meta font-display text-text-muted">
          Merging keeps the one people already use and moves everything onto it. Nothing loses its label.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface p-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {group.merge.map((tag) => (
                <IconChip key={tag.id} icon={false} label={tag.name} title={`${tag.tickets + tag.tasks} in use`} />
              ))}
              <ArrowRight className="size-3.5 shrink-0 text-text-muted" aria-label="becomes" />
              <span className="t-meta font-display font-bold text-text">{group.keep.name}</span>
            </div>
            {canMerge && (
              <Button
                variant="outline"
                size="sm"
                isLoading={busyKey === group.key}
                onClick={() => onMerge(group)}
                className="h-9 shrink-0 font-display font-semibold max-sm:h-11"
              >
                <Merge size={15} aria-hidden />
                Merge into "{group.keep.name}"
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
