// The server stores one note per send-back (max 1000 characters). Quick reasons and per-question
// notes are folded into that single note here, so nothing about the request shape changes.

export const SEND_BACK_NOTE_MAX = 1000;

export const QUICK_REASONS = ['Photo unclear', 'Wrong answer', 'Not done properly', 'Missing proof'] as const;

/** True when the note already carries this reason as its own line. */
export const hasReason = (note: string, reason: string): boolean =>
  note.split('\n').some((line) => line.trim() === reason);

/** Adds the reason as a new line, or takes it out again when it is already there. */
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

/** The overall note followed by one "- {question}: {note}" line per question that has its own note. */
export const composeSendBackNote = (overall: string, questions: QuestionNote[]): string => {
  const lines = questions
    .map((q) => ({ label: q.label.trim(), note: q.note.trim() }))
    .filter((q) => q.note.length > 0)
    .map((q) => `- ${q.label}: ${q.note}`);
  return [overall.trim(), ...lines].filter(Boolean).join('\n');
};
