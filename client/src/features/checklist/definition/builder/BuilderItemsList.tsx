import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Copy, Plus, X, Pencil, Check, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/confirmDialog';
import { ChecklistDefinitionItemDraftRow, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import {
  UNGROUPED, MAX_CHECKLIST_ITEMS, type SectionId,
  groupBySection, containerOrderFor, normalizeItemOrder, cloneItemDraft, copiedSectionName,
} from '../itemSections';
import { DRAG_SLOP_PX } from '../../../../lib/dragSlop';

interface BuilderItemsListProps {
  itemDrafts: ItemDraft[];
  setItemDrafts: Dispatch<SetStateAction<ItemDraft[]>>;
  onUpdateDraft: (key: string, patch: Partial<ItemDraft>) => void;
  onRemoveItem: (key: string) => void;
  sections: string[];
  setSections: Dispatch<SetStateAction<string[]>>;
  activeSection: string | null;
  setActiveSection: Dispatch<SetStateAction<string | null>>;
  storeIds?: string[];
}

// One draggable row: a grip handle + the existing draft row + a delete button, wrapped for
// @dnd-kit/sortable. Position comes from `transform`/`transition`, not layout — same rule as
// every other drag surface in the app (TaskBoard, TicketBoard).
const SortableItemRow = ({
  draft,
  index,
  onChange,
  onRemove,
  onDuplicate,
  storeIds,
}: {
  draft: ItemDraft;
  index: number;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  storeIds?: string[];
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.key });
  // A configured question (options, auditors, GPS target…) used to vanish on one mis-tap.
  const confirm = useConfirm();
  const handleRemove = async () => {
    if (draft.label.trim()) {
      const ok = await confirm({
        title: 'Remove this question?',
        description: `"${draft.label.trim()}" and its settings will be taken off this checklist.`,
        confirmLabel: 'Remove',
        cancelLabel: 'Keep it',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onRemove();
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <ChecklistDefinitionItemDraftRow
        index={index}
        draft={draft}
        onChange={onChange}
        storeIds={storeIds}
        leading={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex items-center justify-center shrink-0 w-7 h-10 -ml-1 rounded-lg text-text-light hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            aria-label="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
        }
        trailing={
          // Stacked, so the card's content column keeps its width. Remove stays where it always
          // was (top); Duplicate sits under it.
          <div className="flex flex-col gap-1 shrink-0">
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center justify-center shrink-0 size-10 rounded-lg text-text-light hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
              aria-label="Remove question"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center justify-center shrink-0 size-10 rounded-lg text-text-light hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-500/10 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              aria-label="Duplicate question"
              title="Duplicate question"
            >
              <Copy size={16} />
            </button>
          </div>
        }
      />
    </div>
  );
};

// A section container is both a SortableContext (for the items already inside it) and its own
// droppable region (via useDroppable) — the second is what lets a drag land on a section that
// currently has zero items, which an empty SortableContext alone can't catch.
const SectionContainer = ({
  id,
  title,
  items,
  otherSectionNames,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  renderRow,
  bare = false,
}: {
  id: SectionId;
  title: string;
  items: ItemDraft[];
  // Every other existing section name (excluding this one) — used to block renaming into a
  // collision instead of silently dropping the rename.
  otherSectionNames: string[];
  isActive: boolean;
  onSelect: () => void;
  onRename?: (next: string) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  // Section *blocks* aren't drag-reorderable (only items are) — undefined at either boundary of
  // the sections list, or entirely for the fixed Ungrouped bucket.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  renderRow: (draft: ItemDraft) => React.ReactNode;
  /** No header at all — the lone Ungrouped bucket when no sections exist yet. */
  bare?: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(title);

  const trimmedDraft = draftName.trim();
  const isDuplicate = trimmedDraft !== title && otherSectionNames.includes(trimmedDraft);
  const canCommitRename = trimmedDraft.length > 0 && !isDuplicate;

  const commitRename = () => {
    if (!canCommitRename) return; // Enter/checkmark no-op while invalid — inline hint explains why
    setRenaming(false);
    if (trimmedDraft !== title) onRename?.(trimmedDraft);
  };

  return (
    <div
      data-section-name={title}
      className={`flex flex-col gap-3 rounded-2xl scroll-mt-24 transition-colors duration-150 ${isOver ? 'bg-primary-500/5 ring-2 ring-primary-400/40 ring-offset-4 ring-offset-surface' : ''}`}
    >
      {!bare && <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          {renaming ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setDraftName(title); setRenaming(false); }
                  }}
                  className={`w-40 px-2 py-1 text-xs font-display font-bold bg-surface text-text rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                    isDuplicate ? 'border-danger' : 'border-primary-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={commitRename}
                  disabled={!canCommitRename}
                  className="p-1 text-success hover:bg-success/10 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-success/50"
                  aria-label="Save section name"
                >
                  <Check size={13} />
                </button>
              </div>
              {isDuplicate && <span className="text-[10px] font-display text-danger">You already have a section with that name</span>}
            </div>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="flex items-center gap-1.5 py-1 text-sm font-display font-semibold text-text hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer truncate rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              title="Set as target for new items"
            >
              <Layers size={14} className={isActive ? 'text-primary-600 dark:text-primary-300' : 'text-text-light'} />
              <span className="truncate">{title}</span>
            </button>
          )}
          <span className="text-xs font-display text-text-muted tabular-nums shrink-0">{items.length}</span>
          {isActive && !renaming && (
            <span className="inline-flex items-center h-5 px-2 rounded-full bg-primary-500/10 text-[10px] font-display font-semibold text-primary-700 dark:text-primary-300 shrink-0">New questions go here</span>
          )}
        </div>

        {onRename && !renaming && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              className="p-2 text-text-light hover:text-text-secondary hover:bg-surface-hover rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              aria-label={`Move ${title} section up`}
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              className="p-2 text-text-light hover:text-text-secondary hover:bg-surface-hover rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              aria-label={`Move ${title} section down`}
            >
              <ChevronDown size={12} />
            </button>
            <button type="button" onClick={() => setRenaming(true)} className="p-2 text-text-light hover:text-text-secondary hover:bg-surface-hover rounded-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50" aria-label={`Rename ${title}`}>
              <Pencil size={12} />
            </button>
            <button type="button" onClick={onDuplicate} className="p-2 text-text-light hover:text-text-secondary hover:bg-surface-hover rounded-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50" aria-label={`Duplicate ${title} section`} title="Duplicate section and its questions">
              <Copy size={12} />
            </button>
            <button type="button" onClick={onDelete} className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50" aria-label={`Delete ${title} section`}>
              <X size={12} />
            </button>
          </div>
        )}
      </div>}

      {/* The container-level droppable ref lives ONLY on the empty-state placeholder or the
          trailing strip below the last row — never on a div wrapping the whole list. Attaching it
          to an always-present wrapper would give the container a hit-rect that fully contains
          every row's own sortable hit-rect, so pointerWithin could resolve `over` to the section
          itself (append-to-end) instead of the specific row the pointer is actually over — e.g.
          dropping at the top of a populated section would silently land at the bottom instead. */}
      <div className="flex flex-col gap-2.5 min-h-[3.25rem]">
        <SortableContext items={items.map((d) => d.key)} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div
              ref={setNodeRef}
              className={`flex items-center justify-center py-6 px-4 text-center rounded-2xl border border-dashed text-xs font-display transition-colors ${
                isOver ? 'border-primary-400 bg-primary-500/5 text-primary-600' : 'border-border/70 text-text-muted'
              }`}
            >
              {bare ? 'No questions yet. Pick a type to add the first one.' : 'Drag a question here, or pick this section and add one.'}
            </div>
          ) : (
            <>
              {items.map((draft) => renderRow(draft))}
              <div
                ref={setNodeRef}
                className={`h-2.5 rounded-md transition-colors ${isOver ? 'bg-primary-400/50' : ''}`}
              />
            </>
          )}
        </SortableContext>
      </div>
    </div>
  );
};

const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

export const BuilderItemsList = ({
  itemDrafts,
  setItemDrafts,
  onUpdateDraft,
  onRemoveItem,
  sections,
  setSections,
  activeSection,
  setActiveSection,
  storeIds,
}: BuilderItemsListProps) => {
  const [newSectionName, setNewSectionName] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    // Without the sortable-aware coordinate getter, arrow keys move a virtual pointer by a fixed
    // pixel step that may not land inside any row/container rect — this is what makes arrow keys
    // actually jump between sortable positions like mouse/touch drags do.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const containerOrder: SectionId[] = containerOrderFor(sections);
  const groups = groupBySection(itemDrafts, sections);
  const activeDraft = activeKey ? itemDrafts.find((d) => d.key === activeKey) : undefined;

  const isDuplicateSectionName = newSectionName.trim().length > 0 && sections.includes(newSectionName.trim());

  const handleAddSection = () => {
    const trimmed = newSectionName.trim();
    if (!trimmed || sections.includes(trimmed)) return;
    setSections((prev) => [...prev, trimmed]);
    setActiveSection(trimmed);
    setNewSectionName('');
  };

  const handleRenameSection = (oldName: string, nextName: string) => {
    if (sections.includes(nextName)) return;
    setSections((prev) => prev.map((s) => (s === oldName ? nextName : s)));
    setItemDrafts((prev) => prev.map((d) => (d.section === oldName ? { ...d, section: nextName } : d)));
    if (activeSection === oldName) setActiveSection(nextName);
  };

  const handleDeleteSection = (name: string) => {
    setSections((prev) => prev.filter((s) => s !== name));
    setItemDrafts((prev) => prev.map((d) => (d.section === name ? { ...d, section: null } : d)));
    if (activeSection === name) setActiveSection(null);
  };

  // True (after telling the person why) when adding `count` more questions would pass the server's
  // per-checklist limit.
  const wouldExceedItemLimit = (count: number) => {
    if (itemDrafts.length + count <= MAX_CHECKLIST_ITEMS) return false;
    toast.error(`A checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`);
    return true;
  };

  // The new card/section mounts after the click handler returns, so look it up on the next frame:
  // scroll it into view, and for a question put the cursor in its text so the copy can be reworded
  // straight away.
  const revealAfterRender = (find: () => HTMLElement | null, focus: boolean) =>
    requestAnimationFrame(() => {
      const el = find();
      if (!el) return;
      el.scrollIntoView({ block: focus ? 'center' : 'start', behavior: 'smooth' });
      if (focus) el.focus({ preventScroll: true });
    });

  // The copy goes straight after the original, in the same section — which also keeps every
  // section's questions contiguous, as the saved order needs.
  const handleDuplicateItem = (key: string) => {
    const at = itemDrafts.findIndex((d) => d.key === key);
    if (at < 0 || wouldExceedItemLimit(1)) return;
    const copy = cloneItemDraft(itemDrafts[at]);
    setItemDrafts((prev) => {
      const i = prev.findIndex((d) => d.key === key);
      if (i < 0) return prev;
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
    toast.success('Question duplicated');
    revealAfterRender(() => document.getElementById(`item-label-${copy.key}`), true);
  };

  // A new section right after the original, holding copies of all its questions.
  const handleDuplicateSection = (name: string) => {
    const questionCount = itemDrafts.filter((d) => d.section === name).length;
    if (wouldExceedItemLimit(questionCount)) return;
    const copyName = copiedSectionName(name, sections);
    const nextSections = [...sections];
    nextSections.splice(sections.indexOf(name) + 1, 0, copyName);
    setSections(nextSections);
    setItemDrafts((prev) => normalizeItemOrder(
      [...prev, ...prev.filter((d) => d.section === name).map((d) => cloneItemDraft(d, { section: copyName }))],
      nextSections,
    ));
    setActiveSection(copyName);
    toast.success(`Duplicated "${name}" with ${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`);
    // `window.CSS`: the bare name is dnd-kit's CSS helper in this file.
    revealAfterRender(() => document.querySelector<HTMLElement>(`[data-section-name="${window.CSS.escape(copyName)}"]`), false);
  };

  // Section blocks display in `sections` array order, so swapping two entries reorders them —
  // but the saved item order comes from flattening `itemDrafts` in that same order (see
  // itemSections.ts), so it must be re-flattened here too, or the visual reorder wouldn't be
  // reflected in what actually gets saved until some unrelated item drag happened to touch it.
  const moveSection = (name: string, direction: -1 | 1) => {
    const index = sections.indexOf(name);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sections.length) return;
    const nextSections = [...sections];
    [nextSections[index], nextSections[swapIndex]] = [nextSections[swapIndex], nextSections[index]];
    setSections(nextSections);
    setItemDrafts((prev) => normalizeItemOrder(prev, nextSections));
  };

  const handleDragStart = (event: DragStartEvent) => setActiveKey(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveKey(null);
    const { active, over } = event;
    if (!over) return;
    const activeItemKey = active.id as string;
    const overId = over.id as string;
    if (activeItemKey === overId) return;

    const liveGroups = groupBySection(itemDrafts, sections);
    const sourceContainer = containerOrder.find((id) => liveGroups[id].some((d) => d.key === activeItemKey));
    if (!sourceContainer) return;

    const isOverAContainer = containerOrder.includes(overId);
    const targetContainer = isOverAContainer
      ? overId
      : containerOrder.find((id) => liveGroups[id].some((d) => d.key === overId));
    if (!targetContainer) return;

    if (sourceContainer === targetContainer) {
      // Same-container reorder: use dnd-kit's own arrayMove against the ORIGINAL (pre-removal)
      // array, computed the same way SortableContext computes it for the live drag preview —
      // splicing the active item out first and THEN searching for the over-item's index (as the
      // cross-container branch below does) searches a shortened array, landing one slot off from
      // where the preview showed the item hovering.
      const original = liveGroups[sourceContainer];
      const oldIndex = original.findIndex((d) => d.key === activeItemKey);
      const newIndex = isOverAContainer ? original.length - 1 : original.findIndex((d) => d.key === overId);
      liveGroups[sourceContainer] = arrayMove(original, oldIndex, newIndex < 0 ? original.length - 1 : newIndex);
    } else {
      const sourceItems = [...liveGroups[sourceContainer]];
      const activeIndex = sourceItems.findIndex((d) => d.key === activeItemKey);
      const [moved] = sourceItems.splice(activeIndex, 1);
      liveGroups[sourceContainer] = sourceItems;

      const targetItems = [...liveGroups[targetContainer]];
      const overIndex = isOverAContainer ? targetItems.length : targetItems.findIndex((d) => d.key === overId);
      targetItems.splice(overIndex < 0 ? targetItems.length : overIndex, 0, {
        ...moved,
        section: targetContainer === UNGROUPED ? null : targetContainer,
      });
      liveGroups[targetContainer] = targetItems;
    }

    setItemDrafts(containerOrder.flatMap((id) => liveGroups[id] ?? []));
  };

  const renderRow = (draft: ItemDraft) => (
    <SortableItemRow
      key={draft.key}
      draft={draft}
      index={itemDrafts.indexOf(draft)}
      onChange={onUpdateDraft}
      onRemove={() => onRemoveItem(draft.key)}
      onDuplicate={() => handleDuplicateItem(draft.key)}
      storeIds={storeIds}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveKey(null)}
      >
        <div className="flex flex-col gap-3">
          <SectionContainer
            id={UNGROUPED}
            title="No section"
            items={groups[UNGROUPED]}
            otherSectionNames={sections}
            isActive={activeSection === null}
            onSelect={() => setActiveSection(null)}
            renderRow={renderRow}
            bare={sections.length === 0}
          />
          {sections.map((name, i) => (
            <SectionContainer
              key={name}
              id={name}
              title={name}
              items={groups[name] ?? []}
              otherSectionNames={sections.filter((s) => s !== name)}
              isActive={activeSection === name}
              onSelect={() => setActiveSection(name)}
              onRename={(next) => handleRenameSection(name, next)}
              onDelete={() => handleDeleteSection(name)}
              onDuplicate={() => handleDuplicateSection(name)}
              onMoveUp={i > 0 ? () => moveSection(name, -1) : undefined}
              onMoveDown={i < sections.length - 1 ? () => moveSection(name, 1) : undefined}
              renderRow={renderRow}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDraft && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary-400 bg-surface shadow-lg shadow-black/10 rotate-1 scale-[1.02] cursor-grabbing">
              <GripVertical size={14} className="text-text-light shrink-0" />
              <span className="text-sm font-display font-medium text-text truncate">
                {activeDraft.label.trim() || 'Untitled item'}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Sections are optional grouping ("Opening", "Closing") — a single quiet row under the
          questions instead of a dashed toolbar above them. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl border border-dashed border-border focus-within:border-primary-400 focus-within:border-solid transition-colors">
          <Layers size={14} className="text-text-light shrink-0" />
          <input
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
            placeholder="New section, e.g. Opening"
            aria-label="New section name"
            className="flex-1 min-w-0 bg-transparent text-sm font-display text-text placeholder:text-text-light focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddSection}
            disabled={!newSectionName.trim() || isDuplicateSectionName}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-display font-semibold text-primary-700 dark:text-primary-300 cursor-pointer hover:bg-primary-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <Plus size={13} /> Add section
          </button>
        </div>
        {isDuplicateSectionName && <span className="px-3 text-[11px] font-display text-danger">You already have a section with that name.</span>}
      </div>
    </div>
  );
};
