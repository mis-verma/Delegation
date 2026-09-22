import { Tag as TagIcon } from 'lucide-react';
import { labelDotClass } from '../../lib/labelColors';
import { IconChip } from '../iconChip';
import type { Tag } from '../../api/tags';

interface TagChipProps {
  tag: Tag;
  className?: string;
}

/**
 * A delegation label, tinted with its own colour on the chip's icon circle.
 *
 * The colour is hashed from the name (see lib/labelColors) so it's arbitrary-looking but stable —
 * the same label is the same colour everywhere it appears and across reloads.
 *
 * `Tag.color` exists in the schema and nothing writes it yet. When a label editor eventually does,
 * it wins here (via `toneStyle`, since an author-chosen colour can't be a Tailwind class) and the
 * hash stays as the fallback for labels nobody has picked a colour for.
 */
export const TagChip = ({ tag, className }: TagChipProps) => (
  <IconChip
    icon={TagIcon}
    tone={tag.color ? undefined : labelDotClass(tag.name)}
    toneStyle={tag.color ? { backgroundColor: tag.color } : undefined}
    label={tag.name}
    className={className}
    title={`Label: ${tag.name}`}
  />
);
