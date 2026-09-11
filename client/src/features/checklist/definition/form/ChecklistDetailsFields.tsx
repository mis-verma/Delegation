
import { CheckSquare, FileText, Palette } from 'lucide-react';
import { Input, Textarea } from '../../../../components';
import { CHECKLIST_ICON_MAP, CHECKLIST_ICON_KEYS } from '../checklistIconMap';
import type { ChecklistIcon } from '../../../../api/checklistDefinitions';

interface ChecklistDetailsFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  icon: ChecklistIcon;
  onIconChange: (value: ChecklistIcon) => void;
}

export const ChecklistDetailsFields = ({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  icon,
  onIconChange,
}: ChecklistDetailsFieldsProps) => (
  <div className="flex flex-col gap-4">
    <Input
      id="checklist-name"
      label="Checklist Name"
      icon={CheckSquare}
      iconClassName="text-primary-400"
      placeholder="e.g. Store Opening Checklist"
      value={name}
      onChange={(e) => onNameChange(e.target.value)}
      autoFocus
    />

    <Textarea
      id="checklist-description"
      label={<>Description <span className="text-text-muted/70 font-medium">(Optional)</span></>}
      icon={FileText}
      rows={3}
      placeholder="What is this checklist for?"
      value={description}
      onChange={(e) => onDescriptionChange(e.target.value)}
    />

    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-xs font-display font-semibold text-text px-1">
        <Palette size={13} className="text-text-muted" />
        Icon
      </label>
      <div role="radiogroup" aria-label="Checklist icon" className="flex flex-wrap gap-1.5">
        {CHECKLIST_ICON_KEYS.map((key) => {
          const Icon = CHECKLIST_ICON_MAP[key];
          const isSelected = icon === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Use ${key} icon`}
              onClick={() => onIconChange(key)}
              className={[
                'flex items-center justify-center size-9 rounded-lg border transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                isSelected
                  ? 'bg-primary-700 text-white border-primary-700 shadow-xs'
                  : 'bg-surface border-border text-text-muted hover:bg-surface-hover hover:text-text hover:border-border/80',
              ].join(' ')}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
