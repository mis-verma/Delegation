/**
 * Colour for a delegation label.
 *
 * A separate palette from `departmentTagColors`, deliberately: that one is the department hue
 * scale, and widening it here would silently recolour every department chip in the app. Labels get
 * their own set, with green, amber and a near-black in it.
 *
 * Hashed from the name rather than picked at random. It looks arbitrary — which is the point, a
 * label's colour carries no meaning beyond "this is that label" — but it's stable: the same label
 * is the same colour on the board, in the table, in the dropdown, and after a reload. A genuine
 * `Math.random()` would reshuffle on every render and make the colour actively misleading.
 *
 * Raw Tailwind hues here (not theme tokens) follow the existing precedent in
 * departmentTagColors.ts: the palette needs ten distinguishable hues and the project's tokens are
 * a single brand ramp plus semantics, none of which are meant to be handed out arbitrarily.
 * Semantic tokens are avoided on purpose — a red label must not read as "danger".
 */
const LABEL_PALETTE = [
  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-500/40',
  'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-500/40',
  'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/40',
  // The "black" of the set — a slate dark enough to read as near-black on white while still
  // having a light-text variant that works on a dark ground.
  'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200',
  'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-500/40',
  'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-500/40',
  'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-500/40',
  'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-500/40',
  'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-500/40',
  'bg-lime-100 text-lime-900 border-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-500/40',
];

/** Just the fill, for a colour dot or swatch that sits next to plain text. */
const LABEL_DOT = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-slate-800 dark:bg-slate-200',
  'bg-violet-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-lime-500',
];

/**
 * FNV-1a plus a final avalanche mix.
 *
 * Deliberately NOT the `hash * 31 + char` loop used in departmentTagColors: with a 10-entry
 * palette, 31 % 10 === 1, so the multiply contributes almost nothing and the index collapses to
 * roughly the sum of the character codes. Similar names then land on the same colour — measured
 * on a real set, "Travel", "Marketing" and "Vendor" all came out the same hue, and "Billing" and
 * "Compliance" shared another, so six labels used three colours. The mix below spreads them.
 */
const hashIndex = (name: string, length: number) => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Final mix, so a one-character difference changes the high bits too rather than just the low
  // ones the modulo reads.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return Math.abs(hash) % length;
};

export const labelChipClass = (name: string) => LABEL_PALETTE[hashIndex(name, LABEL_PALETTE.length)];

export const labelDotClass = (name: string) => LABEL_DOT[hashIndex(name, LABEL_DOT.length)];
