import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

/** Description as a small faded label over larger body text, the way a phone settings row reads:
 *  no icon, no box. Long text is clamped to six lines with a Show more link. */
export const TicketDescription = ({ description }: TicketDescriptionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const trimmedText = description?.trim();
  const isLongText = !!trimmedText && (trimmedText.length > 350 || trimmedText.split('\n').length > 6);

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-display font-medium text-text-muted">Description</h3>
      {trimmedText ? (
        <div className="flex flex-col gap-1">
          {/* 72ch keeps a line readable once the left column is wider than a phone. */}
          <p
            className={`max-w-[72ch] text-base text-text leading-relaxed whitespace-pre-wrap break-words select-text ${
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
        <p className="text-base text-text-light italic">No description added.</p>
      )}
    </section>
  );
};
