import React from "react";
import { AlertCircle, CheckCircle2, type LucideIcon } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility for intelligent Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: React.ReactNode;
  error?: string;
  success?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  containerClassName?: string;
  labelClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      success,
      id,
      className,
      rows = 4,
      icon: Icon,
      iconClassName,
      containerClassName,
      labelClassName,
      ...props
    },
    ref
  ) => {
    // Generate a unique ID for aria-describedby if validation messages exist
    const messageId = (error || success) && id ? `${id}-message` : undefined;
    const isError = !!error;
    const isSuccess = !error && !!success;

    return (
      <div className={cn("group/field flex flex-col gap-1.5 w-full", containerClassName)}>
        {/* Label */}
        <label
          htmlFor={id}
          className={cn(
            "flex items-center gap-1.5 t-meta font-bold tracking-wide text-text-muted transition-colors duration-150 group-focus-within/field:text-primary-600 px-1",
            labelClassName
          )}
        >
          {Icon && (
            <Icon
              className={cn("w-3.5 h-3.5 text-text-light group-focus-within/field:text-primary-500 transition-colors", iconClassName)}
              strokeWidth={2.5}
            />
          )}
          {label}
        </label>

        {/* Textarea Field */}
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          aria-invalid={isError}
          aria-describedby={messageId}
          className={cn(
            // 14px everywhere, the same as the rest of the form text. iPhone Safari would zoom into a field under 16px;
            // index.html stops that (maximum-scale on iOS only), so the smaller size is safe there too.
            "w-full px-4 py-3.5 min-h-[112px] text-sm font-medium transition-colors duration-150 ease-out resize-y",
            "bg-surface text-text placeholder:text-text-light",
            "border rounded-xl outline-none appearance-none",
            "disabled:bg-muted disabled:text-text-light disabled:cursor-not-allowed disabled:border-border disabled:resize-none",
            isError
              ? "border-danger focus:border-danger bg-danger/5"
              : isSuccess
              ? "border-success focus:border-success bg-success/5"
              : "border-border hover:border-border-hover focus:border-primary-500",
            className
          )}
          {...props}
        />

        {/* Validation Messages */}
        {(isError || isSuccess) && (
          <p
            id={messageId}
            role="alert"
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold animate-in slide-in-from-top-1 fade-in duration-200 px-1",
              isError ? "text-danger" : "text-success"
            )}
          >
            {isError ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            )}
            {error || success}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";