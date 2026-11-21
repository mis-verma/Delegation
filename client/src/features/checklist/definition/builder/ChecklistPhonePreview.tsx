import { useEffect, useMemo, useRef } from 'react';
import { Layers, ListTodo } from 'lucide-react';
import { Modal } from '../../../../components';
import { cn } from '@/lib/utils';
import { PhoneFrame, QuestionPreviewCard } from './QuestionPhonePreview';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

interface ChecklistPhonePreviewProps {
  name: string;
  itemDrafts: ItemDraft[];
  /** Key of the question being edited. It is outlined and scrolled to as you type. */
  activeKey?: string | null;
  className?: string;
}

type PreviewGroup = { section: string | null; items: { draft: ItemDraft; index: number }[] };

/** Walks the drafts once, in their saved order, starting a new block each time the section changes. */
const groupInOrder = (drafts: ItemDraft[]): PreviewGroup[] =>
  drafts.reduce<PreviewGroup[]>((groups, draft, index) => {
    const section = draft.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push({ draft, index });
    else groups.push({ section, items: [{ draft, index }] });
    return groups;
  }, []);

export const ChecklistPhonePreview = ({ name, itemDrafts, activeKey, className }: ChecklistPhonePreviewProps) => {
  // The question being edited stays visible even while blank, but only named ones are counted,
  // so this header matches the step summary and what actually gets saved.
  const visible = useMemo(() => itemDrafts.filter((d) => d.label.trim() || d.key === activeKey), [itemDrafts, activeKey]);
  const savedCount = useMemo(() => itemDrafts.reduce((n, d) => (d.label.trim() ? n + 1 : n), 0), [itemDrafts]);
  const groups = useMemo(() => groupInOrder(visible), [visible]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSections = groups.some((g) => g.section);

  useEffect(() => {
    if (!activeKey) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-preview-key="${CSS.escape(activeKey)}"]`);
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeKey]);

  return (
    <PhoneFrame className={className}>
      <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-border/60 bg-surface px-3.5 py-3">
        <p className="t-card font-display font-bold leading-snug text-text break-words">
          {name.trim() || <span className="font-semibold italic text-text-light">Untitled checklist</span>}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="t-meta font-display font-semibold text-text-muted tabular-nums">0 of {savedCount} done</span>
          <span className="t-meta font-display text-text-light tabular-nums">0%</span>
        </div>
        <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <span className="block h-full w-0 rounded-full bg-primary-600" />
        </span>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
            <ListTodo size={20} className="text-text-light" aria-hidden />
            <p className="t-meta font-display font-medium text-text-muted">Your questions show up here as you add them.</p>
          </div>
        ) : (
          groups.map((group, groupIndex) => (
            <div key={`${group.section ?? 'none'}-${groupIndex}`} className="flex flex-col gap-2">
              {hasSections && (
                <span className="flex items-center gap-1.5 px-0.5 t-meta font-display font-bold text-text-secondary">
                  <Layers size={12} className="shrink-0 text-text-light" aria-hidden />
                  <span className="min-w-0 break-words">{group.section ?? 'Other questions'}</span>
                  <span className="shrink-0 font-medium tabular-nums text-text-light">{group.items.length}</span>
                </span>
              )}
              {group.items.map(({ draft, index }) => (
                <div key={draft.key} data-preview-key={draft.key} className="scroll-mt-2">
                  <QuestionPreviewCard draft={draft} index={index} highlighted={draft.key === activeKey} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </PhoneFrame>
  );
};

export const ChecklistPreviewSheet = ({
  open, onClose, name, itemDrafts,
}: { open: boolean; onClose: () => void; name: string; itemDrafts: ItemDraft[] }) => (
  <Modal open={open} onClose={onClose} title="How staff see it" description="The whole checklist, as it looks on a phone." size="sm">
    <ChecklistPhonePreview name={name} itemDrafts={itemDrafts} className={cn('max-h-[70dvh]')} />
  </Modal>
);
