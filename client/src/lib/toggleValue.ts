export const toggleValue = <T,>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
