import { memo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AddQuestionModal } from './AddQuestionModal';
import { QUESTION_TYPES, QUESTION_GROUPS, GROUP_TILE, type QuestionTypeEntry } from './questionTypes';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

export interface PaletteEntry {
  label: string;
  icon: LucideIcon;
  patch: Partial<ItemDraft>;
}

interface QuestionTypePaletteProps {
  /** Returns false when the question could not be added; the pop-up then stays open. */
  onAdd: (patch: Partial<ItemDraft>) => boolean;
  storeIds?: string[];
}

// Every question type as a tappable tile, grouped (Answers / Proof & signatures / Verification).
// Two columns everywhere: in the desktop sidebar it keeps all 17 types on one screen, and on a
// phone it replaces what used to be a 17-row list pushing the questions off screen.
export const QuestionTypePalette = memo(function QuestionTypePalette({ onAdd, storeIds }: QuestionTypePaletteProps) {
  const [active, setActive] = useState<QuestionTypeEntry | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-card font-display font-semibold text-text">Add a question</h2>
        <span className="t-meta font-display text-text-muted">Tap a type</span>
      </div>

      {QUESTION_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-2" aria-label={group.label}>
          <h3 className="t-meta font-display font-semibold text-text-muted">{group.label}</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {QUESTION_TYPES.filter((t) => t.group === group.id).map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActive(entry)}
                  aria-label={`Add a ${entry.label} question`}
                  className="flex items-center gap-2 min-h-11 pl-1.5 pr-1.5 py-1.5 rounded-lg border border-transparent text-left text-sm font-display font-medium text-text-secondary cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-border hover:text-text active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <span className={`flex items-center justify-center size-8 rounded-lg shrink-0 ${GROUP_TILE[entry.group]}`}>
                    <Icon size={16} strokeWidth={2.25} />
                  </span>
                  <span className="flex-1 min-w-0 leading-tight">{entry.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {active && (
        <AddQuestionModal
          entry={{ label: active.label, icon: active.icon, patch: active.patch }}
          storeIds={storeIds}
          onClose={() => setActive(null)}
          onConfirm={(patch) => { if (onAdd(patch)) setActive(null); }}
        />
      )}
    </div>
  );
});
