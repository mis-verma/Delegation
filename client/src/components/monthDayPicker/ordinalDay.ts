const SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

export const ordinalDay = (n: number): string => `${n}${n >= 11 && n <= 13 ? 'th' : (SUFFIX[n % 10] ?? 'th')}`;
