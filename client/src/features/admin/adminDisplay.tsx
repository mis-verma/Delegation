
import { AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
 

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export const ErrorMessage = ({ message, className }: ErrorMessageProps) => (
  <div
    role="alert"
    className={cn(
      "flex items-start gap-3 p-4 rounded-xl",
      "bg-danger/10 border border-danger/20",
      "text-danger text-sm font-medium",
      "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out",
      className
    )}
  >
    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
    <p className="leading-relaxed">{message}</p>
  </div>
);