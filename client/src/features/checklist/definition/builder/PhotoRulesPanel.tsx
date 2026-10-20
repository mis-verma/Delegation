import { Camera, Check, ImageUp, Video, X } from 'lucide-react';
import { Button, IconChip, ToggleChip } from '../../../../components';
import { CountStepper } from './CountStepper';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

interface PhotoRulesPanelProps {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  noun: 'photos' | 'videos';
  removable?: boolean;
}

const SectionLabel = ({ children }: { children: string }) => (
  <span className="t-meta font-display font-semibold text-text-secondary sm:w-28 sm:shrink-0">{children}</span>
);

const toCount = (raw: string, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export const PhotoSourceChips = ({ live, onChange, noun = 'photos' }: { live: boolean; onChange: (live: boolean) => void; noun?: 'photos' | 'videos' }) => (
  <div role="group" aria-label="Where the file may come from" className="flex flex-wrap gap-1.5">
    <ToggleChip on={live} onClick={() => onChange(true)}>
      {live ? <Check size={13} strokeWidth={2.75} /> : <Camera size={13} />}
      {noun === 'videos' ? 'Record live only' : 'Live camera only'}
    </ToggleChip>
    <ToggleChip on={!live} onClick={() => onChange(false)}>
      {!live ? <Check size={13} strokeWidth={2.75} /> : <ImageUp size={13} />}
      {noun === 'videos' ? 'Record or upload' : 'Camera or gallery'}
    </ToggleChip>
  </div>
);

export const PhotoRulesPanel = ({ draft, onChange, noun, removable = false }: PhotoRulesPanelProps) => {
  const isVideo = noun === 'videos';
  const minimum = toCount(draft.requiredImageCount, isVideo ? 1 : 0);
  const hasLimit = draft.maxImageCount !== '';
  const maximum = toCount(draft.maxImageCount, Math.max(minimum, 1));
  const live = draft.requiresLivePhoto;
  const unit = isVideo ? (minimum === 1 ? 'video' : 'videos') : (minimum === 1 ? 'photo' : 'photos');
  const summary = `${minimum} ${live ? 'live ' : ''}${unit}${hasLimit ? `, up to ${maximum}` : ''}`;

  const setMinimum = (next: number) => {
    const patch: Partial<ItemDraft> = { requiredImageCount: String(next) };
    if (hasLimit && maximum < next) patch.maxImageCount = String(next);
    onChange(patch);
  };

  return (
    <section aria-label={isVideo ? 'Video rules for this question' : 'Photo rules for this question'} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-hover/50 p-3 sm:p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <IconChip icon={isVideo ? Video : Camera} tone="bg-primary-600" label={isVideo ? 'Video proof' : 'Photo proof'} />
          <IconChip icon={live ? Camera : ImageUp} tone={live ? 'bg-success' : 'bg-text-muted'} label={summary} labelClassName="tabular-nums" />
        </span>
        {removable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ requiredImageCount: '0', maxImageCount: '', requiresLivePhoto: false })}
            className="size-7 px-0 pointer-coarse:size-11 rounded-full"
            aria-label="Remove the photo rule"
          >
            <X size={14} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <SectionLabel>At least</SectionLabel>
        <CountStepper value={minimum} min={isVideo ? 1 : 1} max={20} label={`Minimum ${noun}`} onChange={setMinimum} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <SectionLabel>At most</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleChip on={!hasLimit} onClick={() => onChange({ maxImageCount: '' })}>No limit</ToggleChip>
          {hasLimit ? (
            <CountStepper value={maximum} min={Math.max(1, minimum)} max={30} label={`Maximum ${noun}`} onChange={(next) => onChange({ maxImageCount: String(next) })} />
          ) : (
            <ToggleChip on={false} onClick={() => onChange({ maxImageCount: String(Math.max(minimum, 1)) })}>Set a limit</ToggleChip>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <SectionLabel>Source</SectionLabel>
        <PhotoSourceChips live={live} onChange={(next) => onChange({ requiresLivePhoto: next })} noun={noun} />
      </div>

      <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
        <span className="t-meta font-display font-semibold text-text-secondary">What staff will see</span>
        <span className="flex flex-wrap gap-1.5">
          <IconChip icon={isVideo ? Video : Camera} tone="bg-primary-600" label={isVideo ? 'Record video' : 'Take photo'} />
          {!live && <IconChip icon={ImageUp} tone="bg-text-muted" label={isVideo ? 'Choose video' : 'Gallery'} />}
        </span>
        <p className="t-meta font-display text-text-muted">
          {live
            ? 'Staff can only use the camera. On a computer a camera window opens, so old files cannot be picked.'
            : 'Staff can use the camera or pick a file from the gallery.'}
        </p>
      </div>
    </section>
  );
};
