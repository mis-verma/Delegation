import { useMediaQuery } from './useMediaQuery';

const COMPACT_FROM = 10_000;
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-IN');

export const formatStatCount = (value: number, phone: boolean): string =>
  phone && Math.abs(value) >= COMPACT_FROM ? compact.format(value) : full.format(value);

export const useStatCountFormat = () => {
  const phone = useMediaQuery('(max-width: 639px)');
  return (value: number) => formatStatCount(value, phone);
};
