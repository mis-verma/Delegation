interface Searchable {
  label: string;
  hint?: string;
  group?: string;
}

export const filterOptions = <T extends Searchable>(options: readonly T[], query: string): readonly T[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => `${option.label} ${option.hint ?? ''} ${option.group ?? ''}`.toLowerCase().includes(needle));
};
