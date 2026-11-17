export interface Searchable {
  label: string;
  hint?: string;
  group?: string;
  keywords?: readonly string[];
}

export const searchTerms = (query: string): readonly string[] => {
  const needle = query.trim().toLowerCase();
  return needle ? needle.split(/\s+/) : [];
};

export const searchText = (option: Searchable): string =>
  `${option.label} ${option.hint ?? ''} ${option.group ?? ''} ${option.keywords ? option.keywords.join(' ') : ''}`.toLowerCase();

export const buildSearchIndex = (options: readonly Searchable[]): readonly string[] => options.map(searchText);

export const matchesTerms = (haystack: string, terms: readonly string[]): boolean => {
  for (const term of terms) if (!haystack.includes(term)) return false;
  return true;
};

export const filterOptions = <T extends Searchable>(
  options: readonly T[],
  query: string,
  index?: readonly string[],
): readonly T[] => {
  const terms = searchTerms(query);
  if (terms.length === 0) return options;
  const haystacks = index && index.length === options.length ? index : buildSearchIndex(options);
  const out: T[] = [];
  for (let i = 0; i < options.length; i += 1) {
    if (matchesTerms(haystacks[i], terms)) out.push(options[i]);
  }
  return out;
};

export const matchedKeyword = (option: Searchable, terms: readonly string[]): string | null => {
  if (!option.keywords || terms.length === 0) return null;
  const label = option.label.toLowerCase();
  if (matchesTerms(label, terms)) return null;
  for (const keyword of option.keywords) {
    if (matchesTerms(keyword.toLowerCase(), terms)) return keyword;
  }
  return null;
};
