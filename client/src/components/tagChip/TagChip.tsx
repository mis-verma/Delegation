import { Tag as TagIcon } from 'lucide-react';
import { labelDotClass } from '../../lib/labelColors';
import { IconChip } from '../iconChip';
import type { Tag } from '../../api/tags';

interface TagChipProps {
  tag: Tag;
  className?: string;
  showLabelOnMobile?: boolean;
}

export const TagChip = ({ tag, className, showLabelOnMobile = false }: TagChipProps) => (
  <IconChip
    icon={TagIcon}
    tone={labelDotClass(tag)}
    label={tag.name}
    className={className}
    iconOnlyOnMobile={!showLabelOnMobile}
    title={`Label: ${tag.name}`}
  />
);
