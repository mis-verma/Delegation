import type { ReactNode } from 'react';
import { OptionRow, FilterGroup, FilterPill, PersonToggle } from './FilterPrimitives';
import { toggleValue } from '../../lib/toggleValue';

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
}

/**
 * Pick one. Used for Category, Status and Department — an "All" entry is just the first option,
 * which is how both modules already expressed it.
 */
export const SelectFilterRow = <T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}) => (
  <OptionRow label={label}>
    <FilterGroup>
      {options.map((option) => (
        <FilterPill key={option.value} active={value === option.value} onClick={() => onSelect(option.value)}>
          {option.label}
        </FilterPill>
      ))}
    </FilterGroup>
  </OptionRow>
);

/** Pick any number. Used for Priority. */
export const MultiSelectFilterRow = <T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
}) => (
  <OptionRow label={label}>
    <FilterGroup>
      {options.map((option) => (
        <FilterPill
          key={option.value}
          active={selected.includes(option.value)}
          onClick={() => onChange(toggleValue(selected, option.value))}
          dotClassName={option.dotClassName}
        >
          {option.label}
        </FilterPill>
      ))}
    </FilterGroup>
  </OptionRow>
);

export interface FilterPerson {
  id: string;
  name: string;
}

/**
 * Avatar toggles. Used for Assignee and "Raised by".
 *
 * `action` is the optional trailing control — only Delegation's Assignee row has one (the
 * admin-only "add a user" button), so it stays opt-in rather than becoming a fixed slot.
 */
export const PeopleFilterRow = ({
  label,
  people,
  selected,
  onChange,
  action,
}: {
  label: string;
  people: readonly FilterPerson[];
  selected: string[];
  onChange: (next: string[]) => void;
  action?: ReactNode;
}) => (
  <OptionRow label={label}>
    <div className="flex flex-wrap items-center gap-2">
      {people.map((person) => (
        <PersonToggle
          key={person.id}
          name={person.name}
          selected={selected.includes(person.id)}
          onClick={() => onChange(toggleValue(selected, person.id))}
        />
      ))}
      {action}
    </div>
  </OptionRow>
);
