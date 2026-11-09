import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

export type UrlValue = string | readonly string[] | null | undefined;

export const readCsv = (params: URLSearchParams, key: string): string[] => {
  const raw = params.get(key);
  return raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : [];
};

export const readOneOf = <T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T | null => {
  const raw = params.get(key);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
};

export const hasAnyParam = (params: URLSearchParams, keys: readonly string[]) => keys.some((k) => params.has(k));

const encode = (value: UrlValue): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() ? value.trim() : null;
  return value.length ? value.join(',') : null;
};

export const useUrlSync = (values: Record<string, UrlValue>) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const wanted = Object.entries(values).map(([key, value]) => [key, encode(value)] as const);
  const signature = JSON.stringify(wanted);

  useEffect(() => {
    const entries = JSON.parse(signature) as [string, string | null][];
    const differs = entries.some(([key, value]) => searchParams.get(key) !== value);
    if (!differs) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of entries) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [signature, searchParams, setSearchParams]);
};
