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
    // Pill track, same rounded-full shape as the New/Options buttons sharing the toolbar. The
    // picked view is a raised white segment with a navy icon rather than a solid navy fill, so
    // the page's one navy button (create) stays the only loud thing in the row.
    <div role="tablist" className="flex items-center gap-0.5 h-9 p-0.5 rounded-full bg-surface-hover/70 border border-border/50 dark:border-white/[0.06]">
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
          className={`items-center gap-1.5 h-full px-3 rounded-full text-xs font-display font-semibold transition-all duration-200 ease-in-out cursor-pointer outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
            tab.mobileHidden ? 'hidden sm:flex' : 'flex'
          } ${
            value === tab.key
              // Border + surface fill, readable in both themes; no box-shadow (app uses borders).
              ? 'bg-surface text-text border border-border dark:border-white/[0.1]'
              : 'text-text-muted border border-transparent hover:text-text'
          }`}
        >
          <tab.icon size={14} strokeWidth={2.25} className={value === tab.key ? 'text-primary-600 dark:text-primary-300' : undefined} />
          <span className="hidden md:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
