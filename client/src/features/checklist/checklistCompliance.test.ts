import { describe, expect, it } from 'vitest';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';
import { answerVerdict, runScores } from './checklistCompliance';

type Item = Parameters<typeof answerVerdict>[0];

const base = (over: Partial<Item> = {}): Item => ({
  itemType: 'YES_NO',
  isDone: true,
  isNotApplicable: false,
  sendBackCount: 0,
  reviewTicketId: null,
  booleanAnswer: 'YES',
  textValue: null,
  numericValue: null,
  acceptableAnswers: ['YES'],
  acceptableMin: null,
  acceptableMax: null,
  isCritical: false,
  waivedAt: null,
  ...over,
} as Item);

describe('sent-back questions', () => {
  it('counts a redone and accepted answer as a miss, matching the server report', () => {
    const item = base({ sendBackCount: 1, reviewTicketId: null });
    expect(answerVerdict(item)).toBe('bad');
    expect(runScores([item])).toMatchObject({ scored: 1, good: 0, compliance: 0 });
  });

  it('weights a critical sent-back question double against compliance', () => {
    const sent = base({ sendBackCount: 1, isCritical: true });
    const fine = base({ isCritical: false });
    expect(runScores([sent, fine])).toMatchObject({ compliance: 33 });
  });

  it('leaves waived and not applicable sent-back questions out', () => {
    expect(answerVerdict(base({ sendBackCount: 1, waivedAt: '2026-01-01T00:00:00Z' }))).toBeNull();
    expect(answerVerdict(base({ sendBackCount: 1, isNotApplicable: true }))).toBeNull();
  });

  it('keeps an accepted answer with no send-back as a good answer', () => {
    expect(answerVerdict(base())).toBe('good');
    expect(runScores([base()])).toMatchObject({ scored: 1, good: 1, compliance: 100 });
  });
});

describe('runScores', () => {
  it('leaves out unscored questions from compliance', () => {
    const items = [base(), base({ isDone: false, booleanAnswer: null } as Partial<Item>)] as ChecklistInstanceItem[];
    expect(runScores(items)).toMatchObject({ scored: 1, compliance: 100, done: 1, total: 2 });
  });
});
