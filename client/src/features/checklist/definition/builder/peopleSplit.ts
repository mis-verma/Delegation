/**
 * Pure helpers about a list of people, kept out of the hook that fetches them so plain logic can
 * use them without pulling React and the API client along.
 */

export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

export const splitByVisible = (ids: string[], visible: ReadonlySet<string> | null) => {
  if (!visible) return { shown: ids, hidden: [] as string[] };
  const shown: string[] = [];
  const hidden: string[] = [];
  for (const id of ids) (visible.has(id) ? shown : hidden).push(id);
  return { shown, hidden };
};
