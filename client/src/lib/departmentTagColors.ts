const TAG_PALETTE = [
  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500/30',
  'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-500/30',
  'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-500/30',
  'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-500/30',
  'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-500/30',
  'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-500/30',
];

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

export const departmentTagClass = (name: string) => TAG_PALETTE[departmentHashIndex(name, TAG_PALETTE.length)];

export const departmentDotClass = (name: string) => TAG_DOT_PALETTE[departmentHashIndex(name, TAG_DOT_PALETTE.length)];
