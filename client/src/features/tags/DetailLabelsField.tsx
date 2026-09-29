import { useState } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { LabelsField } from './LabelsField';
import { useTagsQuery } from './hook';
import { labelChipClass } from '../../lib/labelColors';
import type { Tag } from '../../api/tags';

interface DetailLabelsFieldProps {
  /** The labels the record carries right now (from the server). */
  current: Tag[];
  onSave: (tagIds: string[]) => void;
  canCreate: boolean;
  readOnly: boolean;
  headingClassName: string;
}

/**
 * Labels in a Delegation/Ticket detail sheet. Same inline field as the create forms, but each
 * change saves straight away. The picked set is held locally so a chip lands the instant you
 * press Enter, not after the round-trip; it re-syncs whenever the server's copy changes.
 */
export const DetailLabelsField = ({ current, onSave, canCreate, readOnly, headingClassName }: DetailLabelsFieldProps) => {
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
    return (
      <div className="flex flex-col gap-2">
        <h3 className={headingClassName}>
          <TagIcon size={14} className="text-text-light" />
          Labels
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {current.map((t) => (
            <span key={t.id} className={`inline-flex items-center h-7 px-2.5 rounded-full border text-xs font-display font-semibold ${labelChipClass(t.name)}`}>
              {t.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Tags created a moment ago may not be in `tags` yet on first paint; keep the record's own
  // copies in the list so their chips still resolve.
  const known = [...(tags ?? [])];
  for (const t of current) if (!known.some((k) => k.id === t.id)) known.push(t);

  return (
    <div className="flex flex-col gap-2">
      <h3 className={headingClassName}>
        <TagIcon size={14} className="text-text-light" />
        Labels
        <span className="ml-auto text-[11px] font-medium text-text-light tabular-nums">{ids.length}/12</span>
      </h3>
      <LabelsField
        hideHeading
        tags={known}
        selectedIds={ids}
        onChange={(next) => { setIds(next); onSave(next); }}
        canCreate={canCreate}
      />
    </div>
  );
};
