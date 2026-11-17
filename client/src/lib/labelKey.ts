export const labelKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const findLabelClash = <T extends { name: string }>(tags: readonly T[], name: string): T | undefined => {
  const key = labelKey(name);
  return key ? tags.find((tag) => labelKey(tag.name) === key) : undefined;
};
