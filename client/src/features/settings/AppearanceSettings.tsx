import { Sun, Moon, Monitor, Check, Vibrate, type LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SettingsCard } from './SettingsCard';
import { Switch } from '../../components/switch';
import { haptic, hapticsSupported, useHapticsEnabled } from '../../lib/haptics';
import { NotificationSettings } from './NotificationSettings';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', description: 'Bright background, always on', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Dimmed background, easier at night', icon: Moon },
  { value: 'system', label: 'System', description: 'Matches your device automatically', icon: Monitor },
];

// Its own tab rather than folded into Account — a display preference, not part of who the user
// is. Only choice here for now (no density/font-size controls) since nothing else was asked for.
export const AppearanceSettings = () => {
  const { preference, setPreference } = useTheme();
  const [vibration, setVibration] = useHapticsEnabled();
  const supported = hapticsSupported();

  return (
    <div className="flex flex-col gap-5 w-full max-w-3xl">
      <SettingsCard
        icon={Monitor}
        title="Theme"
        hint={preference === 'system' ? "Following your device's setting. It switches automatically if the device changes." : `Always ${preference}, whatever your device is set to.`}
      >
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 sm:gap-3">
          {OPTIONS.map(({ value, label, description, icon: Icon }) => {
            const selected = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreference(value)}
                className={`relative flex flex-col items-stretch gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                  selected ? 'border-primary-500 bg-primary-500/5' : 'border-border hover:border-primary-300'
                }`}
              >
                {/* A small picture of each theme, in that theme's own colours. */}
                <span aria-hidden="true" className="relative flex h-12 sm:h-16 overflow-hidden rounded-lg border border-border/60">
                  {value !== 'dark' && (
                    <span className="flex flex-1 flex-col gap-1.5 p-2" style={{ background: '#f5f7fb' }}>
                      <span className="h-2 w-8 rounded-full" style={{ background: '#2748a3' }} />
                      <span className="flex-1 rounded-md" style={{ background: '#ffffff' }} />
                    </span>
                  )}
                  {value !== 'light' && (
                    <span className="flex flex-1 flex-col gap-1.5 p-2" style={{ background: '#0b1020' }}>
                      <span className="h-2 w-8 rounded-full" style={{ background: '#6f9bf5' }} />
                      <span className="flex-1 rounded-md" style={{ background: '#141b2d' }} />
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 sm:gap-2.5">
                  <span className={`hidden sm:flex items-center justify-center size-8 rounded-lg shrink-0 ${selected ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-muted'}`}>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block t-card font-display font-semibold text-text">{label}</span>
                    <span className="hidden sm:block t-meta font-display text-text-muted leading-snug">{description}</span>
                  </span>
                  {selected && (
                    <span className="flex items-center justify-center size-5 rounded-full bg-primary-600 text-white shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        icon={Vibrate}
        title="Vibration"
        hint={supported
          ? 'Short buzz on your phone when you save, finish or something fails. Android phones only.'
          : "This phone or browser can't vibrate, so this is switched off. iPhones don't support it in the browser."}
      >
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="vibration-switch" className="t-card font-display font-semibold text-text">
            Buzz on save, finish and errors
          </label>
          <Switch
            id="vibration-switch"
            checked={supported && vibration}
            disabled={!supported}
            onChange={(on) => {
              setVibration(on);
              if (on) haptic('success');
            }}
          />
        </div>
      </SettingsCard>

      <NotificationSettings />
    </div>
  );
};
