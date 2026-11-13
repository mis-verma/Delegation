import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { heatExact, heatLook } from '../../../../lib/heatScale';

export interface HeatTipLine {
  label: string;
  value: string;
}

export interface HeatTipContent {
  title: string;
  subtitle: string;
  value: number | null;
  measure: string;
  lines: HeatTipLine[];
}

export interface HeatTooltipHandle {
  show: (anchor: HTMLElement, content: HeatTipContent) => void;
  hide: () => void;
}

const GAP = 8;
const EDGE = 8;

export const HeatTooltip = ({ ref }: { ref: Ref<HeatTooltipHandle> }) => {
  const [tip, setTip] = useState<{ anchor: HTMLElement; content: HeatTipContent } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    show: (anchor, content) => setTip({ anchor, content }),
    hide: () => setTip(null),
  }), []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!tip || !box) return;
    const place = () => {
      const a = tip.anchor.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const left = Math.min(window.innerWidth - b.width - EDGE, Math.max(EDGE, a.left + a.width / 2 - b.width / 2));
      const above = a.top - b.height - GAP;
      const top = above >= EDGE ? above : a.bottom + GAP;
      box.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      box.style.opacity = '1';
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [tip]);

  if (!tip) return null;
  const { content } = tip;

  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      style={{ opacity: 0 }}
      className="pointer-events-none fixed left-0 top-0 z-[60] flex w-max max-w-64 flex-col gap-1.5 rounded-xl border border-border/70 bg-surface p-3 text-left transition-opacity duration-100 ease-out motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="t-meta font-display font-bold leading-snug text-text line-clamp-2">{content.title}</span>
          <span className="t-meta text-text-muted">{content.subtitle}</span>
        </div>
        <span
          style={content.value === null ? undefined : heatLook(content.value)}
          className={cn('shrink-0 rounded-md px-1.5 py-0.5 t-meta font-display font-bold tabular-nums', content.value === null && 'bg-surface-hover text-text-muted')}
        >
          {content.value === null ? 'None' : heatExact(content.value)}
        </span>
      </div>
      <p className="t-meta text-text-muted">{content.value === null ? 'Nothing was due.' : content.measure}</p>
      {content.lines.length > 0 && (
        <dl className="flex flex-col gap-1 border-t border-border/50 pt-2">
          {content.lines.map((line) => (
            <div key={line.label} className="flex items-center justify-between gap-4 t-meta">
              <dt className="text-text-secondary">{line.label}</dt>
              <dd className="font-display font-semibold tabular-nums text-text">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>,
    document.body,
  );
};
