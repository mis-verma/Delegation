import { Type, AlignLeft, Palette } from 'lucide-react';
import { Input, Textarea } from '../../../../components';
import { DETAIL_HEADING_CLASS } from '../../../tasks/taskFormFieldStyles';
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

// Same quiet, borderless-until-focus fields and icon-led headings as the New Delegation / New
// Ticket forms, so building a checklist feels like the rest of the app's create flows.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

export const ChecklistDetailsFields = ({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  icon,
  onIconChange,
}: ChecklistDetailsFieldsProps) => (
  <div className="flex flex-col gap-5">
    <Input
      id="checklist-name"
      label={<>Name <span className="text-danger">*</span></>}
      icon={Type}
      labelClassName={DETAIL_HEADING_CLASS}
      placeholder="e.g. Store opening check"
      value={name}
      onChange={(e) => onNameChange(e.target.value)}
      className={QUIET_FIELD_CLASS}
      autoFocus
    />

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
      <div role="radiogroup" aria-label="Checklist icon" className="flex flex-wrap gap-2">
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
              className={`flex items-center justify-center size-11 sm:size-10 rounded-xl border cursor-pointer transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                isSelected
                  ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                  : 'border-border/70 bg-surface text-text-muted hover:border-primary-400 hover:text-text'
              }`}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
