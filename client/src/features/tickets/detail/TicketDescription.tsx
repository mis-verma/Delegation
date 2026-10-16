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
          className="text-text font-semibold no-underline hover:text-text-secondary transition-colors break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

/** Description as plain small body text, the same size as the form fields:
 *  no icon, no box. Long text is clamped to six lines with a Show more link. */
export const TicketDescription = ({ description }: TicketDescriptionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const trimmedText = description?.trim();
  const isLongText = !!trimmedText && (trimmedText.length > 350 || trimmedText.split('\n').length > 6);

  return (
    <section className="flex flex-col gap-1">
      {trimmedText ? (
        <div className="flex flex-col gap-1">
          {/* 72ch keeps a line readable once the left column is wider than a phone. */}
          <p
            className={`max-w-[72ch] text-sm text-text leading-relaxed whitespace-pre-wrap break-words select-text ${
              isLongText && !isExpanded ? 'line-clamp-6' : ''
            }`}
          >
            {renderFormattedText(trimmedText)}
          </p>
          {isLongText && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="self-start inline-flex items-center gap-1 min-h-11 sm:min-h-8 t-meta font-semibold text-text-secondary hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
            >
              {isExpanded ? 'Show less' : 'Show more'}
              {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-light italic">No description added.</p>
      )}
    </section>
  );
};
