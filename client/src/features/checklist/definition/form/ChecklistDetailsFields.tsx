import { Type, AlignLeft, Palette } from 'lucide-react';
import { AddChip, Input, Textarea } from '../../../../components';
import { DETAIL_HEADING_CLASS } from '../../../tasks/taskFormFieldStyles';
import { CHECKLIST_ICON_MAP, CHECKLIST_ICON_KEYS } from '../checklistIconMap';
import { onRadioKeyDown } from '../builder/radioGroupKeys';
import type { ChecklistIcon } from '../../../../api/checklistDefinitions';

interface ChecklistDetailsFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  icon: ChecklistIcon;
  onIconChange: (value: ChecklistIcon) => void;
}

const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

const SUGGESTIONS: { name: string; icon: ChecklistIcon; label: string }[] = [
  { name: 'Store opening check', icon: 'sun', label: 'Opening' },
  { name: 'Store closing check', icon: 'moon', label: 'Closing' },
  { name: 'Cash handover', icon: 'banknote', label: 'Cash' },
  { name: 'Showcase and display check', icon: 'gem', label: 'Display' },
  { name: 'Cleaning round', icon: 'sparkles', label: 'Cleaning' },
  { name: 'Keys and locks check', icon: 'key', label: 'Keys' },
  { name: 'Stock and delivery check', icon: 'package', label: 'Stock' },
];

export const ChecklistDetailsFields = ({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  icon,
  onIconChange,
}: ChecklistDetailsFieldsProps) => {
  const PreviewIcon = CHECKLIST_ICON_MAP[icon];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Input
            id="checklist-name"
            label={<>Name <span className="text-danger">*</span></>}
            icon={Type}
            labelClassName={DETAIL_HEADING_CLASS}
            placeholder="e.g. Store opening check"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={191}
            className={QUIET_FIELD_CLASS}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <span className="t-meta font-display text-text-muted">A short name your team will recognize.</span>
            <span className="t-meta font-display tabular-nums text-text-light">{name.length}/191</span>
          </div>
          {name.trim() === '' && (
            <div role="group" aria-label="Name ideas" className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => {
                const SuggestionIcon = CHECKLIST_ICON_MAP[s.icon];
                return (
                  <AddChip key={s.name} onClick={() => { onNameChange(s.name); onIconChange(s.icon); }}>
                    <SuggestionIcon size={13} aria-hidden />
                    {s.label}
                  </AddChip>
                );
              })}
            </div>
          )}
        </div>

        <Textarea
          id="checklist-description"
          label="Description"
          icon={AlignLeft}
          labelClassName={DETAIL_HEADING_CLASS}
          rows={3}
          placeholder="What it's for, and anything staff should know before they start"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className={QUIET_FIELD_CLASS}
        />

        <div className="flex flex-col gap-2">
          <span className={DETAIL_HEADING_CLASS}>
            <Palette size={14} className="text-text-light" />
            Icon
          </span>
          <div role="radiogroup" aria-label="Checklist icon" className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
            {CHECKLIST_ICON_KEYS.map((key, index) => {
              const Icon = CHECKLIST_ICON_MAP[key];
              const isSelected = icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`Use ${key} icon`}
                  title={key}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => onIconChange(key)}
                  onKeyDown={(e) => onRadioKeyDown(e, index, CHECKLIST_ICON_KEYS.length, (next) => onIconChange(CHECKLIST_ICON_KEYS[next]))}
                  className={`flex aspect-square items-center justify-center rounded-xl border cursor-pointer transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                    isSelected
                      ? 'border-transparent bg-linear-to-br from-primary-500 to-primary-700 text-white'
                      : 'border-border/70 bg-surface text-text-muted hover:border-primary-400 hover:text-text'
                  }`}
                >
                  <Icon size={18} strokeWidth={isSelected ? 2.5 : 2} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <aside aria-label="Preview" className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
        <span className="t-meta font-display font-semibold text-text-secondary">How it will look</span>
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <PreviewIcon size={22} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="t-card font-display font-bold leading-snug text-text line-clamp-2">{name.trim() || 'Your checklist name'}</p>
            <p className="t-meta font-display text-text-muted line-clamp-2">{description.trim() || 'Your description shows here.'}</p>
          </div>
        </div>
      </aside>
    </div>
  );
};
