import { labelChipClass } from '../../lib/labelColors';
import type { Tag } from '../../api/tags';

interface TagChipProps {
  tag: Tag;
  className?: string;
}

const DEFAULT_CLASS = 'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium';

/**
 * A delegation label, filled with its own colour.
 *
 * The colour is hashed from the name (see lib/labelColors) so it's arbitrary-looking but stable —
 * the same label is the same colour everywhere it appears and across reloads.
 *
 * `Tag.color` exists in the schema and nothing writes it yet. When a label editor eventually does,
 * it wins here and the hash stays as the fallback for labels nobody has picked a colour for.
 */
export const TagChip = ({ tag, className = DEFAULT_CLASS }: TagChipProps) => (
  <span
    className={`${className} ${tag.color ? '' : labelChipClass(tag.name)}`}
    // An author-chosen colour can't be a Tailwind class, so it goes through style. Border matches
    // the fill so a custom colour doesn't inherit whatever border the palette class would have set.
    style={tag.color ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
    title={`Label: ${tag.name}`}
  >
    {tag.name}
  </span>
);
