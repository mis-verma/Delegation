import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { QUESTION_TYPES, QUESTION_GROUPS, GROUP_TILE, questionTypeOf, type QuestionTypeEntry } from './questionTypes';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

interface QuestionTypeMenuProps {
  draft: ItemDraft;
  onPick: (entry: QuestionTypeEntry) => void;
}

// The question's type as one chip that opens a grouped menu — replaces the 16-button type wall
// every question card used to carry (about 1000px tall per card on a phone).
export const QuestionTypeMenu = ({ draft, onPick }: QuestionTypeMenuProps) => {
  const current = questionTypeOf(draft);
  const Icon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Question type: ${current.label}. Change type`}
          className="inline-flex items-center gap-1.5 h-11 sm:h-8 pl-1 pr-2.5 rounded-full border border-border/70 bg-surface text-xs font-display font-semibold text-text-secondary cursor-pointer transition-colors duration-150 hover:border-primary-400 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 data-[state=open]:border-primary-400"
        >
          <span className={`flex items-center justify-center size-6 rounded-full ${GROUP_TILE[current.group]}`}>
            <Icon size={13} strokeWidth={2.5} />
          </span>
          <span className="whitespace-nowrap">{current.label}</span>
          <ChevronDown size={13} strokeWidth={2.5} className="text-text-light" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-[min(70vh,28rem)] overflow-y-auto">
        {QUESTION_GROUPS.map((group, gi) => (
          <div key={group.id}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="t-meta font-semibold text-text-muted">{group.label}</DropdownMenuLabel>
            {QUESTION_TYPES.filter((t) => t.group === group.id).map((entry) => {
              const EntryIcon = entry.icon;
              const selected = entry.id === current.id;
              return (
                <DropdownMenuItem key={entry.id} onClick={() => !selected && onPick(entry)} className="gap-2.5 py-1.5">
                  <span className={`flex items-center justify-center size-7 rounded-lg shrink-0 ${GROUP_TILE[entry.group]}`}>
                    {/* `!` beats DropdownMenuItem's forced svg size/colour. */}
                    <EntryIcon strokeWidth={2.25} className="size-3.5! text-current!" />
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-text">{entry.label}</span>
                    <span className="t-meta text-text-muted truncate">{entry.hint}</span>
                  </span>
                  {selected && <Check strokeWidth={2.75} className="size-3.5! text-primary-600! dark:text-primary-300!" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
