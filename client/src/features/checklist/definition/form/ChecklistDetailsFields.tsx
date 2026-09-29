import { Type, AlignLeft, Palette } from 'lucide-react';
import { Input } from '../../../../components';
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="checklist-name" className={DETAIL_HEADING_CLASS}>
        <Type size={14} className="text-text-light" />
        Name <span className="text-danger">*</span>
      </label>
      <Input
        id="checklist-name"
        placeholder="e.g. Store opening check"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className={QUIET_FIELD_CLASS}
        autoFocus
      />
    </div>

    <div className="flex flex-col gap-1.5">
      <label htmlFor="checklist-description" className={DETAIL_HEADING_CLASS}>
        <AlignLeft size={14} className="text-text-light" />
        Description
      </label>
      <textarea
        id="checklist-description"
        rows={3}
        placeholder="What it's for, and anything staff should know before they start"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        className={`w-full px-3.5 py-2.5 text-base sm:text-sm text-text rounded-xl border resize-y placeholder:text-text-light transition-colors duration-150 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ${QUIET_FIELD_CLASS}`}
      />
    </div>

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
              className={`flex items-center justify-center size-10 rounded-xl border cursor-pointer transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                isSelected
                  ? 'border-coral-500 bg-coral-500/15 text-coral-700 dark:text-coral-300 ring-2 ring-coral-500/20'
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
