import { useRef, useEffect, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ViewTab<V extends string> {
  key: V;
  label: string;
  icon: LucideIcon;
  /**
   * Hidden below `sm` — for dense, many-column views (Table, Timeline) that need real width to
   * read and aren't genuinely usable one-handed on a phone, even though they scroll horizontally
   * rather than overflow. The tab stays fully available on tablet/desktop. If `value` points at a
   * mobile-hidden tab when the viewport narrows past `sm`, this falls back to the first visible
   * tab rather than leaving the toolbar showing a view the person can no longer reach.
   */
  mobileHidden?: boolean;
}

interface ViewToggleProps<V extends string> {
  tabs: ViewTab<V>[];
  value: V;
  onChange: (key: V) => void;
}

// A pill-group view switcher (e.g. List/Board) — shared shell behind the Delegation and Tickets
// list pages' view toggles, same "generic component + feature-owned tab data" split as
// QuickFilterStats.
export function ViewToggle<V extends string>({ tabs, value, onChange }: ViewToggleProps<V>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeTab = tabs.find((t) => t.key === value);
    if (!activeTab?.mobileHidden) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const fallToVisible = () => {
      if (!mq.matches) return;
      const firstVisible = tabs.find((t) => !t.mobileHidden);
      if (firstVisible) onChange(firstVisible.key);
    };
    fallToVisible();
    mq.addEventListener('change', fallToVisible);
    return () => mq.removeEventListener('change', fallToVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Real tablist semantics: arrow keys move both focus and selection between tabs (Home/End jump
  // to the ends), matching the roving-tabindex pattern the app's Radix Tabs-based switchers get
  // for free — this one is plain buttons, so it needs the behavior wired by hand.
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    e.preventDefault();
    onChange(tabs[nextIndex].key);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="tablist" className="flex items-center gap-1 p-1 rounded-lg bg-surface-hover/50 border border-border/40">
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(el) => { buttonRefs.current[index] = el; }}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          tabIndex={value === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          title={`${tab.label} view`}
          aria-label={`${tab.label} view`}
          className={`items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
            tab.mobileHidden ? 'hidden sm:flex' : 'flex'
          } ${
            value === tab.key
              // Solid fill (not a faint background+ring) so the active view is unmistakable at a
              // glance instead of blending into its own resting/hover states in dark mode. No
              // box-shadow — the fill already carries it, and surfaces in this app use borders.
              ? 'bg-primary-600 text-white'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-active/50'
          }`}
        >
          <tab.icon size={14} />
          <span className="hidden md:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
