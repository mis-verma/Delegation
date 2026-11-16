import type { ProblemEntry } from './ticketCategoryIndex';

export interface ProblemMatch {
  entry: ProblemEntry;
  score: number;
}

export interface ProblemMatcher {
  match: (text: string) => ProblemMatch | null;
}

const MIN_TOKEN_LENGTH = 3;
const SUBCATEGORY_WEIGHT = 2;
const CATEGORY_WEIGHT = 1;
const MIN_SCORE = 2.5;
const MIN_LEAD = 1.25;

const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'not', 'with', 'from', 'this', 'that', 'has', 'have', 'are', 'was', 'were', 'our', 'your', 'can', 'cannot',
  'working', 'issue', 'problem', 'please', 'need', 'help', 'since', 'who', 'what', 'where', 'when', 'affected', 'all', 'any', 'new',
]);

const stem = (word: string): string => (word.length > MIN_TOKEN_LENGTH + 1 && word.endsWith('s') ? word.slice(0, -1) : word);

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(word))
    .map(stem);

interface Posting {
  entryIndex: number;
  weight: number;
}

export const buildProblemMatcher = (entries: readonly ProblemEntry[]): ProblemMatcher => {
  const postings = new Map<string, Posting[]>();
  const addTokens = (entryIndex: number, text: string, weight: number) => {
    for (const token of new Set(tokenize(text))) {
      const list = postings.get(token) ?? [];
      list.push({ entryIndex, weight });
      postings.set(token, list);
    }
  };
  entries.forEach((entry, index) => {
    addTokens(index, entry.subcategory.name, SUBCATEGORY_WEIGHT);
    addTokens(index, entry.category.name, CATEGORY_WEIGHT);
  });

  const total = Math.max(entries.length, 1);

  const match = (text: string): ProblemMatch | null => {
    const scores = new Map<number, number>();
    for (const token of new Set(tokenize(text))) {
      const list = postings.get(token);
      if (!list) continue;
      const rarity = Math.log(1 + total / list.length);
      for (const { entryIndex, weight } of list) scores.set(entryIndex, (scores.get(entryIndex) ?? 0) + weight * rarity);
    }
    let best = -1;
    let bestScore = 0;
    let runnerUp = 0;
    for (const [index, score] of scores) {
      if (score > bestScore) {
        runnerUp = bestScore;
        bestScore = score;
        best = index;
      } else if (score > runnerUp) runnerUp = score;
    }
    const entry = entries[best];
    return entry && bestScore >= MIN_SCORE && bestScore - runnerUp >= MIN_LEAD ? { entry, score: bestScore } : null;
  };

  return { match };
};
