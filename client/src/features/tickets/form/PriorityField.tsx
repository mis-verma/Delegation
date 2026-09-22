import { LABEL_CLASS, PRIORITIES, type TicketPriority } from './formConstants';

interface PriorityFieldProps {
  value: TicketPriority;
  onChange: (value: TicketPriority) => void;
}

// Same @container short/full swap as Delegation's TaskFormPrioritySelector: in a half-width grid
// cell there isn't room for four full words side by side, so each chip shows just its letter
// until its own container is wide enough for the word — not a fixed choice, so it also grows back
// to the full label wherever this field gets more room (e.g. full-width on a narrow phone).
export const PriorityField = ({ value, onChange }: PriorityFieldProps) => (
  <div className="group/field @container flex flex-col gap-2">
    <label className={LABEL_CLASS}>Priority Level</label>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Priority Level">
      {PRIORITIES.map((p) => {
        const isSelected = value === p.value;
        return (
          <button
            key={p.value}
            type="button"
            aria-pressed={isSelected}
            aria-label={`Select ${p.label} priority`}
            onClick={() => onChange(p.value)}
            className={`flex items-center justify-center h-8 px-3.5 text-xs font-display font-semibold rounded-md transition-colors duration-150 cursor-pointer outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
              isSelected ? p.selectedClass : p.outlineClass
            }`}
          >
            <span className="@sm:hidden">{p.short}</span>
            <span className="hidden @sm:inline truncate">{p.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);