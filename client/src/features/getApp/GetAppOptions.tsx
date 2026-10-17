import type { ReactNode } from 'react';
import { Apple, CheckCircle2, Download, Share2, Smartphone, type LucideIcon } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { usePublicSettingsQuery } from '../../lib/maintenance';
import { shareAppLink, useInstallPrompt } from '../../lib/installPrompt';

const Row = ({ icon: Icon, tile, title, text, action }: { icon: LucideIcon; tile: string; title: string; text: string; action: ReactNode }) => (
  <li className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-surface p-3 min-[26rem]:flex-row min-[26rem]:items-center">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-white', tile)} aria-hidden>
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-card font-display font-semibold text-text">{title}</span>
        <span className="t-meta text-text-muted">{text}</span>
      </span>
    </div>
    <div className="shrink-0 min-[26rem]:ml-auto">{action}</div>
  </li>
);

export const GetAppOptions = ({ showShare = true }: { showShare?: boolean }) => {
  const { data: settings } = usePublicSettingsQuery();
  const prompt = useInstallPrompt();
  const androidUrl = settings?.androidAppUrl ?? null;
  const iosUrl = settings?.iosAppUrl ?? null;

  const installAction = prompt.installed ? (
    <span className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-success/10 t-meta font-display font-semibold text-success">
      <CheckCircle2 size={14} aria-hidden />
      Installed
    </span>
  ) : prompt.canInstall ? (
    <Button size="sm" onClick={() => void prompt.install()} className="w-full min-[26rem]:w-auto pointer-coarse:h-11">
      <Download size={14} aria-hidden />
      Install
    </Button>
  ) : null;

  const installText = prompt.installed
    ? 'KaryaOS is on this device. Open it from your home screen.'
    : prompt.canInstall
      ? 'Adds KaryaOS to your home screen. Tiny download, updates by itself.'
      : prompt.ios
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Open this page in Chrome on your phone, then pick Install app from the menu.';

  return (
    <ul className="flex flex-col gap-2">
      <Row icon={Smartphone} tile="from-primary-500 to-primary-700" title="Install on this phone" text={installText} action={installAction} />
      {androidUrl && (
        <Row
          icon={Download}
          tile="from-success to-success/70"
          title="Android app"
          text="Download the app file. If your phone asks, allow installs from your browser."
          action={
            <a
              href={androidUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full min-[26rem]:w-auto items-center justify-center gap-1.5 h-9 pointer-coarse:h-11 px-3 rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text hover:border-border-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Download size={14} aria-hidden />
              Download
            </a>
          }
        />
      )}
      {iosUrl && (
        <Row
          icon={Apple}
          tile="from-text-secondary to-text"
          title="iPhone app"
          text="Get it from the App Store."
          action={
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full min-[26rem]:w-auto items-center justify-center gap-1.5 h-9 pointer-coarse:h-11 px-3 rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text hover:border-border-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Apple size={14} aria-hidden />
              App Store
            </a>
          }
        />
      )}
      {showShare && (
        <Row
          icon={Share2}
          tile="from-coral-400 to-coral-600"
          title="Send to someone"
          text="Share this page so a teammate can install it too."
          action={
            <Button variant="outline" size="sm" onClick={() => void shareAppLink()} className="w-full min-[26rem]:w-auto pointer-coarse:h-11">
              <Share2 size={14} aria-hidden />
              Share link
            </Button>
          }
        />
      )}
    </ul>
  );
};
