import { useState } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { LabelsField } from './LabelsField';
import { useTagsQuery } from './hook';
import { TagChip } from '../../components/tagChip';
import type { Tag } from '../../api/tags';

interface DetailLabelsFieldProps {
  /** The labels the record carries right now (from the server). */
  current: Tag[];
  onSave: (tagIds: string[]) => void;
  canCreate: boolean;
  readOnly: boolean;
  headingClassName: string;
  /** Show only the label chips, with no "Labels" heading above them (read-only view). */
  hideHeading?: boolean;
  /** No "Labels" heading at all: a tag icon tile leads the chips (or the field) on the same line. */
  iconOnly?: boolean;
  /** Labels already saved can't be taken off, only added to (tickets: the server refuses a removal too). */
  lockApplied?: boolean;
}

/**
 * Labels in a Delegation/Ticket detail sheet. Same inline field as the create forms, but each
 * change saves straight away. The picked set is held locally so a chip lands the instant you
 * press Enter, not after the round-trip; it re-syncs whenever the server's copy changes.
 */
const ICON_TILE = (
  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-600 text-white" title="Labels" aria-hidden="true">
    <TagIcon className="size-3.5" strokeWidth={2.25} />
  </span>
);

export const DetailLabelsField = ({ current, onSave, canCreate, readOnly, headingClassName, hideHeading = false, iconOnly = false, lockApplied = false }: DetailLabelsFieldProps) => {
  const { data: tags } = useTagsQuery();
  const serverIds = current.map((t) => t.id).join(',');
  const [ids, setIds] = useState<string[]>(() => current.map((t) => t.id));
  const [syncedFrom, setSyncedFrom] = useState(serverIds);
  if (serverIds !== syncedFrom) {
    setSyncedFrom(serverIds);
    setIds(current.map((t) => t.id));
  }

  if (readOnly) {
    if (!current.length) return null;
    if (iconOnly) {
      return (
        <div className="flex items-center gap-2.5 min-w-0" aria-label="Labels">
          {ICON_TILE}
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {current.map((t) => <TagChip key={t.id} tag={t} showLabelOnMobile />)}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {!hideHeading && (
          <h3 className={headingClassName}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true"><TagIcon className="size-3.5" strokeWidth={2.25} /></span>
            Labels
          </h3>
        )}
        <div className="flex flex-wrap gap-1.5">
          {current.map((t) => (
            <TagChip key={t.id} tag={t} showLabelOnMobile />
          ))}
        </div>
      </div>
    );
  }

  // Tags created a moment ago may not be in `tags` yet on first paint; keep the record's own
  // copies in the list so their chips still resolve.
  const known = [...(tags ?? [])];
  for (const t of current) if (!known.some((k) => k.id === t.id)) known.push(t);

  if (iconOnly) {
    return (
      <div className="flex items-center gap-2.5 min-w-0" aria-label="Labels">
        {ICON_TILE}
        <div className="min-w-0 flex-1">
          <LabelsField hideHeading tags={known} selectedIds={ids} onChange={(next) => { setIds(next); onSave(next); }} canCreate={canCreate} lockedIds={lockApplied ? current.map((t) => t.id) : undefined} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className={headingClassName}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true"><TagIcon className="size-3.5" strokeWidth={2.25} /></span>
        Labels
        <span className="ml-auto inline-flex h-5 min-w-9 items-center justify-center rounded-full bg-surface-hover px-2 t-meta font-display font-semibold text-text-muted tabular-nums">{ids.length}/12</span>
      </h3>
      <LabelsField
        hideHeading
        tags={known}
        selectedIds={ids}
        onChange={(next) => { setIds(next); onSave(next); }}
        canCreate={canCreate}
        lockedIds={lockApplied ? current.map((t) => t.id) : undefined}
      />
    </div>
  );
};
