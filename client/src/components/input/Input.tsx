import { forwardRef, type ReactNode, type InputHTMLAttributes } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  suffix?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  containerClassName?: string;
  labelClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      id,
      className,
      suffix,
      icon: Icon,
      iconClassName,
      containerClassName,
      labelClassName,
      ...props
    },
    ref
  ) => {
    const errorId = error && id ? `${id}-error` : undefined;

    return (
      <div className={cn("group/input flex flex-col gap-1.5 w-full", containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className={cn(
              "flex items-center gap-1.5 t-meta font-bold tracking-wide text-text-muted transition-colors duration-150 group-focus-within/input:text-primary-600 px-1",
              labelClassName
            )}
          >
            {Icon && (
              <Icon
                className={cn("w-3.5 h-3.5 text-text-light group-focus-within/input:text-primary-500 transition-colors", iconClassName)}
                strokeWidth={2.5}
              />
            )}
            {label}
          </label>
        )}

        <div className="relative flex items-center group">
          <input
            id={id}
            ref={ref}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={cn(
              "w-full h-12 rounded-xl border px-4 text-sm font-medium transition-colors duration-150",
              "bg-surface text-text placeholder:text-text-light",
              "focus:outline-none",
              "disabled:bg-muted disabled:text-text-light disabled:cursor-not-allowed disabled:border-border",
              suffix && "pr-11",
              error
                ? "border-danger focus:border-danger bg-danger/5"
                : "border-border hover:border-border-hover focus:border-primary-500",
              className
            )}
            {...props}
          />

          {suffix && (
            <div className={cn(
              "absolute right-3 flex items-center justify-center transition-colors duration-200",
              "text-text-light group-focus-within:text-primary-600",
              error && "text-danger group-focus-within:text-danger"
            )}>
              {suffix}
            </div>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 t-meta font-semibold text-danger animate-in slide-in-from-top-1 fade-in duration-200 px-1"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";