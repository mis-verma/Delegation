import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TicketDescriptionProps {
  description?: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

const renderFormattedText = (text: string) =>
  text.split(URL_PATTERN).map((part, index) => {
    if (index % 2 === 0) return part;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const href = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <span key={index}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text font-semibold underline underline-offset-2 hover:text-text-secondary transition-colors break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });

export const TicketDescription = ({ description }: TicketDescriptionProps) => {
  const [expandedText, setExpandedText] = useState<string | null>(null);

  const trimmedText = description?.trim();
  const isExpanded = !!trimmedText && expandedText === trimmedText;
  const isLongText = !!trimmedText && (trimmedText.length > 350 || trimmedText.split('\n').length > 6);

  return (
    <section className="flex flex-col gap-1">
      {trimmedText ? (
        <div className="flex flex-col gap-1">
          <p
            className={`max-w-[72ch] text-sm font-medium text-text-muted leading-relaxed whitespace-pre-wrap break-words select-text ${
              isLongText && !isExpanded ? 'line-clamp-6' : ''
            }`}
          >
            {renderFormattedText(trimmedText)}
          </p>
          {isLongText && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setExpandedText(isExpanded ? null : trimmedText ?? null)}
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
