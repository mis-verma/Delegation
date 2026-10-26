
export const SEND_BACK_NOTE_MAX = 1000;

export const QUICK_REASONS = ['Photo unclear', 'Wrong answer', 'Not done properly', 'Missing proof'] as const;

export const ITEM_REASONS = ['Photo not clear', 'Wrong item', 'Not live', 'Old photo', 'Missing photo', 'Answer not matching'] as const;

const ITEM_REASON_SEPARATOR = '; ';

const itemReasonParts = (note: string): string[] =>
  note.split(ITEM_REASON_SEPARATOR).map((part) => part.trim()).filter(Boolean);

export const hasItemReason = (note: string, reason: string): boolean => itemReasonParts(note).includes(reason);

export const toggleItemReason = (note: string, reason: string, max: number): string => {
  const parts = itemReasonParts(note);
  if (parts.includes(reason)) return parts.filter((part) => part !== reason).join(ITEM_REASON_SEPARATOR);
  const next = [...parts, reason].join(ITEM_REASON_SEPARATOR);
  return next.length > max ? note : next;
};

export const orderedItemReasons = (suggested: readonly string[]): string[] => [
  ...ITEM_REASONS.filter((reason) => suggested.includes(reason)),
  ...ITEM_REASONS.filter((reason) => !suggested.includes(reason)),
];

export const hasReason = (note: string, reason: string): boolean =>
  note.split('\n').some((line) => line.trim() === reason);

export const toggleReason = (note: string, reason: string): string => {
  if (hasReason(note, reason)) {
    return note
      .split('\n')
      .filter((line) => line.trim() !== reason)
      .join('\n')
      .trim();
  }
  const trimmed = note.trimEnd();
  return trimmed ? `${trimmed}\n${reason}` : reason;
};

export interface QuestionNote {
  label: string;
  note: string;
}

export const composeSendBackNote = (overall: string, questions: QuestionNote[]): string => {
  const lines = questions
    .map((q) => ({ label: q.label.trim(), note: q.note.trim() }))
    .filter((q) => q.note.length > 0)
    .map((q) => `- ${q.label}: ${q.note}`);
  return [overall.trim(), ...lines].filter(Boolean).join('\n');
};
