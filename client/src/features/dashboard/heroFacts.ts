import type { Scores } from '../../api/scores';
import { moduleOverall, numbersFor, overallOf, type ModuleKey } from './scoreMetrics';

const MODULE_KEYS: readonly ModuleKey[] = ['checklist', 'ticket', 'delegation'];

export interface HeroFacts {
  overall: number | null;
  best: { key: ModuleKey; score: number } | null;
  weakest: { key: ModuleKey; score: number } | null;
}

export const heroFacts = (data: Scores | undefined): HeroFacts => {
  if (!data) return { overall: null, best: null, weakest: null };
  const ranked = MODULE_KEYS
    .map((key) => ({ key, score: moduleOverall(data, key), has: numbersFor(data, key).hasData }))
    .filter((m): m is { key: ModuleKey; score: number; has: boolean } => m.has && m.score !== null)
    .sort((a, b) => b.score - a.score);
  const spread = ranked.length > 1 && ranked[0].key !== ranked[ranked.length - 1].key;
  return {
    overall: overallOf(data),
    best: spread ? { key: ranked[0].key, score: ranked[0].score } : null,
    weakest: spread ? { key: ranked[ranked.length - 1].key, score: ranked[ranked.length - 1].score } : null,
  };
};
