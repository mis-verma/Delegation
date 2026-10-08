import { type FormHTMLAttributes, type FormEventHandler } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  title?: string;
  description?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

export function Form({
  children,
  title,
  description,
  onSubmit,
  className,
  ...props
}: FormProps) {
  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        // Premium card styling with fluid responsive padding and beautiful soft shadows
        'w-full max-w-lg p-6 sm:p-8 bg-surface border border-border rounded-2xl shadow-xl shadow-border/40 flex flex-col gap-6',
        // Smooth entrance animation
        'animate-in fade-in zoom-in-[0.98] slide-in-from-bottom-4 duration-500 ease-out',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="flex flex-col gap-2 pb-2 border-b border-border/80">
          {title && (
            <h2 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-[0.9375rem] font-medium text-text-muted leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Form content wrapper with consistent spacing */}
      <div className="flex flex-col gap-5">
        {children}
      </div>
    </form>
  );
}