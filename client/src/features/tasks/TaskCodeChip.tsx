import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { taskCode } from './taskDisplay';

export const TaskCodeChip = ({ taskId }: { taskId: string }) => {
  const [copied, setCopied] = useState(false);
  const code = taskCode(taskId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy delegation code"
      aria-label={`Copy delegation code ${code}`}
      className="group relative inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-border/60 bg-surface-hover/60 hover:bg-surface-active text-text-secondary t-meta font-mono font-bold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] after:absolute after:-inset-y-2 after:inset-x-0"
    >
      <span>{code}</span>
      {copied ? <Check size={12} className="text-success" strokeWidth={2.75} aria-hidden="true" /> : <Copy size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
};
