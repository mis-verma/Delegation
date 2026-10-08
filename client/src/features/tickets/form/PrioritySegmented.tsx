import { PRIORITIES, type TicketPriority } from './formConstants';

/** All four priorities visible at once as one segmented control: one tap, no menu to open. */
export const PrioritySegmented = ({ value, onChange }: { value: TicketPriority; onChange: (v: TicketPriority) => void }) => (
  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-surface-hover/70" role="group" aria-label="Priority">
    {PRIORITIES.map((p) => (
      <button
        key={p.value}
        type="button"
        onClick={() => onChange(p.value)}
        aria-pressed={value === p.value}
        className={`h-10 pointer-coarse:h-11 px-1 rounded-lg text-xs font-display font-semibold truncate transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] ${
          value === p.value ? `${p.selectedClass} border border-border/60 dark:border-white/[0.08]` : `${p.outlineClass} border border-transparent`
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);
