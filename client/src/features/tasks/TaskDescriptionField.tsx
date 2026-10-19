import type { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FIELD_LABEL_CLASS } from './taskFormFieldStyles';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TaskDescriptionFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  label?: string;

  toolbar?: ReactNode;

  children?: ReactNode;

  containerClassName?: string;
}

export const TaskDescriptionField = ({
  id = 'description',
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = 'Add more detail…',
  rows = 6,
  label,
  toolbar,
  children,
  containerClassName,
}: TaskDescriptionFieldProps) => (
  <div className="group/field flex flex-col gap-1.5">
    {label && (
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
    )}

    <div className={cn('flex flex-col rounded-lg border border-border bg-surface transition-colors focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 overflow-hidden', containerClassName)}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2.5 text-sm font-display text-text bg-transparent outline-none resize-y placeholder:text-text-light disabled:text-text-light disabled:cursor-not-allowed"
      />

      {children && (
        <div className="flex flex-col gap-2 px-3 pb-2.5 shrink-0">
          {children}
        </div>
      )}

      {toolbar && (
        <div className="flex items-center justify-end gap-0.5 px-2 py-1 border-t border-border/60 bg-surface-hover/40 shrink-0">
          {toolbar}
        </div>
      )}
    </div>
  </div>
);
