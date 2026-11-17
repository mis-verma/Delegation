import type { ReactNode } from 'react';

type Span = [number, number];

export const matchSpans = (text: string, terms: readonly string[]): Span[] => {
  if (terms.length === 0) return [];
  const lower = text.toLowerCase();
  const found: Span[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      found.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (found.length === 0) return [];
  found.sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [found[0]];
  for (let i = 1; i < found.length; i += 1) {
    const last = merged[merged.length - 1];
    if (found[i][0] <= last[1]) last[1] = Math.max(last[1], found[i][1]);
    else merged.push(found[i]);
  }
  return merged;
};

export const highlightTerms = (text: string, terms: readonly string[], markClassName: string): ReactNode => {
  const spans = matchSpans(text, terms);
  if (spans.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < spans.length; i += 1) {
    const [start, end] = spans[i];
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={`${start}-${end}`} className={markClassName}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};
