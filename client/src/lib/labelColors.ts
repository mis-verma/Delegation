export interface LabelColor {
  key: string;
  name: string;
  chip: string;
  dot: string;
}

export const LABEL_COLORS: readonly LabelColor[] = [
  { key: 'indigo', name: 'Indigo', chip: 'bg-indigo-500/12 text-indigo-700 border-indigo-500/25 dark:bg-indigo-400/15 dark:text-indigo-300 dark:border-indigo-400/30', dot: 'bg-indigo-500' },
  { key: 'violet', name: 'Violet', chip: 'bg-violet-500/12 text-violet-700 border-violet-500/25 dark:bg-violet-400/15 dark:text-violet-300 dark:border-violet-400/30', dot: 'bg-violet-500' },
  { key: 'fuchsia', name: 'Pink', chip: 'bg-fuchsia-500/12 text-fuchsia-700 border-fuchsia-500/25 dark:bg-fuchsia-400/15 dark:text-fuchsia-300 dark:border-fuchsia-400/30', dot: 'bg-fuchsia-500' },
  { key: 'rose', name: 'Rose', chip: 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:bg-rose-400/15 dark:text-rose-300 dark:border-rose-400/30', dot: 'bg-rose-500' },
  { key: 'orange', name: 'Orange', chip: 'bg-orange-500/12 text-orange-800 border-orange-500/25 dark:bg-orange-400/15 dark:text-orange-300 dark:border-orange-400/30', dot: 'bg-orange-500' },
  { key: 'amber', name: 'Amber', chip: 'bg-amber-500/14 text-amber-800 border-amber-500/30 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30', dot: 'bg-amber-500' },
  { key: 'lime', name: 'Lime', chip: 'bg-lime-500/14 text-lime-800 border-lime-500/30 dark:bg-lime-400/15 dark:text-lime-300 dark:border-lime-400/30', dot: 'bg-lime-500' },
  { key: 'emerald', name: 'Green', chip: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:bg-emerald-400/15 dark:text-emerald-300 dark:border-emerald-400/30', dot: 'bg-emerald-500' },
  { key: 'teal', name: 'Teal', chip: 'bg-teal-500/12 text-teal-700 border-teal-500/25 dark:bg-teal-400/15 dark:text-teal-300 dark:border-teal-400/30', dot: 'bg-teal-500' },
  { key: 'sky', name: 'Sky', chip: 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:bg-sky-400/15 dark:text-sky-300 dark:border-sky-400/30', dot: 'bg-sky-500' },
  { key: 'blue', name: 'Blue', chip: 'bg-blue-500/12 text-blue-700 border-blue-500/25 dark:bg-blue-400/15 dark:text-blue-300 dark:border-blue-400/30', dot: 'bg-blue-500' },
  { key: 'slate', name: 'Graphite', chip: 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:bg-slate-400/15 dark:text-slate-300 dark:border-slate-400/30', dot: 'bg-slate-500' },
];

export type LabelColorInput = string | { name: string; color?: string | null };

const hashIndex = (name: string, length: number) => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return Math.abs(hash) % length;
};

export const suggestedLabelColor = (name: string): LabelColor => LABEL_COLORS[hashIndex(name, LABEL_COLORS.length)];

const labelColorOf = (input: LabelColorInput): LabelColor => {
  if (typeof input === 'string') return suggestedLabelColor(input);
  return LABEL_COLORS.find((c) => c.key === input.color) ?? suggestedLabelColor(input.name);
};

export const labelColorKey = (input: LabelColorInput) => labelColorOf(input).key;

export const labelChipClass = (input: LabelColorInput) => labelColorOf(input).chip;

export const labelDotClass = (input: LabelColorInput) => labelColorOf(input).dot;

export const BARE_LABEL_CLASS = 'border-0 bg-transparent pl-0 pr-0 sm:pr-0';
