import { Sun, Moon, Monitor, Check, type LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', description: 'Bright background, always on', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Dimmed background, easier at night', icon: Moon },
  { value: 'system', label: 'System', description: 'Matches your device automatically', icon: Monitor },
];

// Its own tab rather than folded into Account — a display preference, not part of who the user
// is. Only choice here for now (no density/font-size controls) since nothing else was asked for.
export const AppearanceSettings = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-text-muted" />
          <span className="text-xs font-display font-bold text-text-muted">Theme</span>
        </div>

        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map(({ value, label, description, icon: Icon }) => {
            const selected = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreference(value)}
                className={`relative flex flex-col items-start gap-2.5 p-3.5 rounded-xl border text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                  selected ? 'border-primary-500 bg-primary-500/5' : 'border-border hover:border-primary-300'
                }`}
              >
                {selected && (
                  <span className="absolute top-2.5 right-2.5 flex items-center justify-center size-4 rounded-full bg-primary-500 text-white">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
                <span
                  className={`flex items-center justify-center size-9 rounded-lg ${
                    selected
                      ? 'bg-gradient-to-br from-primary-500 to-primary-700 border border-primary-800/20 text-white'
                      : 'bg-surface-hover text-text-muted'
                  }`}
                >
                  <Icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-display font-semibold text-text">{label}</p>
                  <p className="text-[11px] font-display text-text-muted mt-0.5">{description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-text-muted -mt-1">
          {preference === 'system'
            ? "Following your device's setting — switches automatically if it changes."
            : `Always ${preference}, regardless of your device's setting.`}
        </p>
      </div>
    </div>
  );
};
