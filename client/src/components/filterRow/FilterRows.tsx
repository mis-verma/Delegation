
import type { LucideIcon } from 'lucide-react';

/**
 * The three row shapes an Options dialog is built from.
 *
 * Delegation and Tickets each hand-assembled these out of the primitives, producing six rows of
 * near-identical `<OptionRow><FilterGroup>{options.map(...)}</FilterGroup></OptionRow>` — the
 * Department and "Raised by" rows were byte-identical between the two files, along with their
 * `toggleValue` and `personName` helpers. What actually differs per module is *which options* a
 * row lists, so that's all a caller supplies now. The rendered markup is unchanged.
 */

export interface FilterOption<T> {
  value: T;
  label: string;
  /** Passed straight through to FilterPill's optional leading dot — see its own comment. */
  dotClassName?: string;
  /** Passed straight through to FilterPill's optional leading icon — see its own comment. */
  icon?: LucideIcon;
}

export interface FilterPerson {
  id: string;
  name: string;
}
