import { useRef, useEffect, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { VIEW_ICONS } from './viewIconMap';
import type { ViewIcon } from './viewIcons';

export interface ViewTab<V extends string> {
  key: V;
  label: string;
  icon?: LucideIcon | ViewIcon;
  mobileHidden?: boolean;
}

interface ViewToggleProps<V extends string> {
  tabs: ViewTab<V>[];
  value: V;
  onChange: (key: V) => void;
  storageKey?: string;
  shortcuts?: boolean;
}

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

export function ViewToggle<V extends string>({ tabs, value, onChange, storageKey, shortcuts = true }: ViewToggleProps<V>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (key: V) => {
    onChange(key);
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, key); } catch { }
  };

  useEffect(() => {
    if (!storageKey) return;
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(storageKey); } catch { return; }
    const tab = tabs.find((t) => t.key === saved);
    if (!tab || tab.key === value) return;
    if (tab.mobileHidden && window.matchMedia('(max-width: 639px)').matches) return;
    onChange(tab.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const visibleKeys = (): V[] => {
    const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
    return tabs.filter((t) => !t.mobileHidden || !small).map((t) => t.key);
  };
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const key = visibleKeys()[n - 1];
      if (!key) return;
      e.preventDefault();
      pick(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, tabs, onChange, storageKey]);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    e.preventDefault();
    pick(tabs[nextIndex].key);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="tablist" className="flex items-center gap-1 p-1 rounded-xl bg-surface-hover/60 border border-border/60 dark:border-white/[0.06]">
      {tabs.map((tab, index) => {
        const Icon = VIEW_ICONS[tab.key] ?? tab.icon;
        return (
        <button
          key={tab.key}
          ref={(el) => { buttonRefs.current[index] = el; }}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          tabIndex={value === tab.key ? 0 : -1}
          onClick={() => pick(tab.key)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          title={shortcuts ? `${tab.label} view (press ${tabs.indexOf(tab) + 1})` : `${tab.label} view`}
          aria-label={`${tab.label} view`}
          className={`group items-center gap-1.5 h-8 pointer-coarse:h-11 px-3 rounded-lg t-meta font-display transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
            tab.mobileHidden ? 'hidden sm:flex' : 'flex'
          } ${
            value === tab.key
              ? 'bg-surface text-primary-700 dark:text-primary-300 font-bold ring-1 ring-primary-500/30'
              : 'text-text-secondary font-semibold hover:text-text hover:bg-surface/70'
          }`}
        >
          {Icon && <Icon size={15} strokeWidth={2.25} className={value === tab.key ? 'text-primary-600 dark:text-primary-300' : 'text-text-muted transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-300'} />}
          <span className="hidden md:inline">{tab.label}</span>
        </button>
        );
      })}
    </div>
  );
}
