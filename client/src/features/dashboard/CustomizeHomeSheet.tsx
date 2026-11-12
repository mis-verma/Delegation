import { LayoutDashboard } from 'lucide-react';
import { Button, Modal } from '../../components';
import { Switch } from '../../components/switch';
import { cn } from '@/lib/utils';
import { HOME_SECTIONS, type HomeSectionId } from './homeLayout';

interface CustomizeHomeSheetProps {
  sections: readonly HomeSectionId[];
  focusId: HomeSectionId | null;
  isHidden: (id: HomeSectionId) => boolean;
  onChange: (id: HomeSectionId, visible: boolean) => void;
  onShowAll: () => void;
  onClose: () => void;
}

export const CustomizeHomeSheet = ({ sections, focusId, isHidden, onChange, onShowAll, onClose }: CustomizeHomeSheetProps) => {
  const anyHidden = sections.some(isHidden);

  return (
    <Modal
      open
      onClose={onClose}
      title="Customize Home"
      description="Turn sections on or off. Saved on this device."
      icon={<LayoutDashboard size={18} aria-hidden="true" />}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="outline" onClick={onShowAll} disabled={!anyHidden} className="max-sm:h-11">Show all</Button>
          <Button onClick={onClose} className="max-sm:h-11">Done</Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-2">
        {sections.map((id) => {
          const meta = HOME_SECTIONS[id];
          const Icon = meta.icon;
          const visible = !isHidden(id);
          const switchId = `home-section-${id}`;
          return (
            <li key={id}>
              <label
                htmlFor={switchId}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-200 ease-out',
                  focusId === id ? 'border-primary-500/50 bg-primary-500/5 dark:bg-primary-500/10' : 'border-border/60 hover:border-border-hover',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
                    visible ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-light',
                  )}
                  aria-hidden="true"
                >
                  <Icon size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('t-card font-display font-semibold', visible ? 'text-text' : 'text-text-muted')}>{meta.label}</span>
                  <span className="t-meta text-text-muted">{visible ? meta.hint : 'Hidden from Home'}</span>
                </span>
                <Switch id={switchId} checked={visible} onChange={(v) => onChange(id, v)} />
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};
