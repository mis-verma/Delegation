import { useState } from 'react';
import { AlignLeft, Copy, Check, ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { SECTION_HEADER } from './detailConstants';

interface TicketDescriptionProps {
  description?: string;
}

const renderFormattedText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-bold underline underline-offset-4 decoration-primary-600/30 hover:decoration-primary-600/100 transition-all break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export const TicketDescription = ({ description }: TicketDescriptionProps) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const trimmedText = description?.trim();
  if (!trimmedText) return null;

  // Determine if text is long by character count OR line count
  const isLongText = trimmedText.length > 350 || trimmedText.split('\n').length > 6;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trimmedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — silently no-op, copy button just won't confirm.
    }
  };

  return (
    <div className="flex flex-col gap-2 font-sans">
      {/* Same compact header row Attachments/Comments already use, not a bespoke larger one —
          this was the one section still on the old bigger/bolder heading style. */}
      <div className="flex items-center justify-between">
        <h3 className={SECTION_HEADER}>
          <AlignLeft size={13} className="text-primary-500" /> Description
        </h3>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors px-2 py-1 rounded-lg hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-95"
          title="Copy description"
          aria-label="Copy description"
        >
          {copied ? (
            <>
              <Check size={12} className="text-success" strokeWidth={2.5} />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={2.5} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Border + rounded, no box-shadow (this app's card convention) — a large low-opacity quote
          mark is the one flourish, reading as "quoted text" rather than a plain gray box, and a
          border-color shift on hover instead of an elevation change keeps it consistent with every
          other bordered card in this detail view. */}
      <div className="group relative rounded-2xl border border-border bg-surface p-5 pl-6 overflow-hidden transition-colors hover:border-border-hover">
        <Quote
          size={72}
          strokeWidth={1.5}
          className="absolute -top-3 -left-2 text-primary-500/[0.07] dark:text-primary-400/[0.1] pointer-events-none"
          aria-hidden="true"
        />

        <div
          className={`relative text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-medium ${
            isLongText && !isExpanded ? 'line-clamp-6 mb-4' : ''
          }`}
        >
          {renderFormattedText(trimmedText)}
        </div>

        {isLongText && (
          <div
            className={`relative flex justify-center mt-2 ${
              !isExpanded
                ? 'absolute bottom-0 left-0 right-0 pt-20 pb-4 bg-gradient-to-t from-surface via-surface/90 to-transparent pointer-events-none'
                : 'pb-1'
            }`}
          >
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="pointer-events-auto inline-flex items-center gap-1.5 text-xs font-black text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 bg-surface px-4 py-2 rounded-xl border border-border hover:border-primary-400/60 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background z-10 active:scale-95"
            >
              {isExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp size={16} strokeWidth={3} />
                </>
              ) : (
                <>
                  <span>Show more</span>
                  <ChevronDown size={16} strokeWidth={3} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};