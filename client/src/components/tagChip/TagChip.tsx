import { Tag as TagIcon } from 'lucide-react';
import { BARE_LABEL_CLASS, labelDotClass } from '../../lib/labelColors';
import { IconChip } from '../iconChip';
import type { Tag } from '../../api/tags';

interface TagChipProps {
  tag: Tag;
  className?: string;
  /** Keep the name beside the icon on a phone (off by default, see StatusChip). */
  showLabelOnMobile?: boolean;
}

/**
 * A label, tinted with its own colour on the chip's icon circle. Bare (no border, no fill), so it sits on the
 * ticket's own background instead of looking like a button.
 *
 * The colour is the one chosen when the label was made (`Tag.color`). A label with none gets one
 * derived from its name (see lib/labelColors), so it is the same colour everywhere it appears and
 * across reloads either way.
 */
export const TagChip = ({ tag, className, showLabelOnMobile = false }: TagChipProps) => (
  <IconChip
    icon={TagIcon}
    tone={labelDotClass(tag)}
    label={tag.name}
    className={`${BARE_LABEL_CLASS} ${className ?? ''}`}
    iconOnlyOnMobile={!showLabelOnMobile}
    title={`Label: ${tag.name}`}
  />
);
