/** The raw counts behind a score cell, so the popup can show the numbers and the percentage. */
export interface ScoreFigures {
  /** Questions done and questions due (not applicable ones are already left out). */
  done: number;
  total: number;
  /** Compliance weights: critical questions count double on both sides. */
  good: number;
  scored: number;
  dueRuns: number;
}

/** Which checklists a score covers, so the popup can list them. */
export interface ScoreScope {
  /** 'YYYY-MM-DD', both ends inclusive. */
  from: string;
  to: string;
  storeId?: string;
  departmentId?: string;
}

export interface ScoreDetail {
  /** The store or department. */
  title: string;
  /** The day, month or "whole period" this score covers. */
  subtitle: string;
  figures: ScoreFigures;
  /** When set, the popup also lists the checklists behind the score. */
  scope?: ScoreScope;
}

export const emptyFigures = (): ScoreFigures => ({ done: 0, total: 0, good: 0, scored: 0, dueRuns: 0 });

export const addFigures = (into: ScoreFigures, from: ScoreFigures) => {
  into.done += from.done;
  into.total += from.total;
  into.good += from.good;
  into.scored += from.scored;
  into.dueRuns += from.dueRuns;
};

export const rateOf = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);
