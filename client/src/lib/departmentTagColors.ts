

// Same hue order as TAG_PALETTE above, as a solid fill — for DepartmentChip's icon circle
// (see IconChip), which needs full-strength color for a white icon to read against, not the pale
// tint TAG_PALETTE carries for the rest of the pill.
const TAG_DOT_PALETTE = ['bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500'];

const departmentHashIndex = (name: string, length: number) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
};

export const departmentDotClass = (name: string) => TAG_DOT_PALETTE[departmentHashIndex(name, TAG_DOT_PALETTE.length)];
