import { useState } from 'react';
import { AlignLeft, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { DETAIL_HEADING_CLASS } from '../../tasks/taskFormFieldStyles';

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
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold underline underline-offset-4 decoration-primary-600/30 hover:decoration-primary-600 transition-colors break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

/** Description as a soft card under its label, same treatment as the delegation detail sheet.
 *  Long text is clamped to six lines with a Show more link. */
export const TicketDescription = ({ description }: TicketDescriptionProps) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const trimmedText = description?.trim();
  const isLongText = !!trimmedText && (trimmedText.length > 350 || trimmedText.split('\n').length > 6);

  const handleCopy = async () => {
    if (!trimmedText) return;
    try {
      await navigator.clipboard.writeText(trimmedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the button just won't confirm.
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 min-h-8">
        <h3 className={DETAIL_HEADING_CLASS}>
          <AlignLeft size={14} className="text-text-light" />
          Description
        </h3>
        {trimmedText && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center size-11 sm:size-8 rounded-full text-text-light hover:text-primary-600 hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
            title={copied ? 'Copied' : 'Copy description'}
            aria-label="Copy description"
          >
            {copied ? <Check size={14} className="text-success" strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2.25} />}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-surface-hover/40 px-3.5 py-3 sm:px-4 sm:py-3.5">
        {trimmedText ? (
          <div className="flex flex-col gap-2">
            {/* 72ch keeps a line readable once the left column is wider than a phone. */}
            <p
              className={`max-w-[72ch] text-[15px] sm:text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words ${
                isLongText && !isExpanded ? 'line-clamp-6' : ''
              }`}
            >
              {renderFormattedText(trimmedText)}
            </p>
            {isLongText && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="self-start inline-flex items-center gap-1 min-h-11 sm:min-h-8 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
              >
                {isExpanded ? 'Show less' : 'Show more'}
                {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-light italic">No description added.</p>
        )}
      </div>
    </section>
  );
};
