import { CircleHelp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

export interface ChipLegendItem {
  label: string;
  icon: LucideIcon;
  /** Solid bg-* class, the same one the chip's icon circle uses. */
  tone: string;
}

export interface ChipLegendSection {
  title: string;
  items: ChipLegendItem[];
}

/**
 * "What do these icons mean?" for phones, where the status, priority, department and label chips
 * show only a coloured icon. A phone has no hover tooltip, so this is the one place the words are
 * listed beside the exact icons the cards use. Hidden from `sm` up, where the chips carry their text.
 */
export const ChipLegend = ({ sections }: { sections: ChipLegendSection[] }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="What do the icons mean?"
        title="What do the icons mean?"
        className="sm:hidden flex items-center justify-center size-11 shrink-0 rounded-full border border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors [-webkit-tap-highlight-color:transparent]"
      >
        <CircleHelp size={16} aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-3 rounded-xl">
      <p className="text-sm font-display font-semibold text-text">What the icons mean</p>
      <div className="mt-2.5 flex flex-col gap-3">
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium text-text-muted">{section.title}</h4>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {section.items.map(({ label, icon: Icon, tone }) => (
                <li key={label} className="flex items-center gap-2 min-w-0">
                  <span className={`flex items-center justify-center size-6 rounded-full text-white shrink-0 ${tone}`}>
                    <Icon className="size-3.5" strokeWidth={2.75} aria-hidden />
                  </span>
                  <span className="text-xs font-display font-semibold text-text-secondary truncate">{label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);
