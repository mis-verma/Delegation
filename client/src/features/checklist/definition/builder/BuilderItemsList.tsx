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
import { GripVertical, Trash2, Plus, X, Pencil, Check, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ChecklistDefinitionItemDraftRow, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import { UNGROUPED, type SectionId, groupBySection, containerOrderFor, normalizeItemOrder } from '../itemSections';
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
  storeIds,
}: {
  draft: ItemDraft;
  index: number;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  storeIds?: string[];
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.key });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-start gap-1.5 ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 mt-1.5 p-2 rounded-md text-text-light hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        aria-label="Drag to reorder"
      >
        <GripVertical size={15} />
      </button>
      <div className="flex-1 min-w-0">
        <ChecklistDefinitionItemDraftRow index={index} draft={draft} onChange={onChange} storeIds={storeIds} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-2 mt-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
        aria-label="Remove item"
      >
        <Trash2 size={15} />
      </button>
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
  onMoveUp,
  onMoveDown,
  renderRow,
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
  // Section *blocks* aren't drag-reorderable (only items are) — undefined at either boundary of
  // the sections list, or entirely for the fixed Ungrouped bucket.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  renderRow: (draft: ItemDraft) => React.ReactNode;
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
      className={`flex flex-col gap-2.5 rounded-xl border p-3 transition-colors duration-150 ${
        isOver ? 'border-primary-400 bg-primary-500/5' : isActive ? 'border-primary-300 bg-primary-500/[0.03]' : 'border-border/70 bg-surface-hover/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
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
              className="flex items-center gap-1.5 text-xs font-display font-bold text-text-secondary hover:text-primary-700 cursor-pointer truncate rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              title="Set as target for new items"
            >
              <Layers size={12} className={isActive ? 'text-primary-600' : 'text-text-light'} />
              <span className="truncate">{title}</span>
            </button>
          )}
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono shrink-0">{items.length}</Badge>
          {isActive && !renaming && (
            <span className="text-[10px] font-display text-primary-600 shrink-0">· new items go here</span>
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
            <button type="button" onClick={onDelete} className="p-2 text-text-light hover:text-danger hover:bg-danger/10 rounded-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50" aria-label={`Delete ${title} section`}>
              <X size={12} />
            </button>
          </div>
        )}
      </div>

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
              className={`flex items-center justify-center py-3 rounded-lg border border-dashed text-[11px] font-display transition-colors ${
                isOver ? 'border-primary-400 bg-primary-500/5 text-primary-600' : 'border-border/70 text-text-muted'
              }`}
            >
              Drag an item here, or pick this section and add one from the list on the left.
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
      storeIds={storeIds}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Section management strip */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-dashed border-border/70 bg-surface-hover/10">
        <span className="text-[10px] font-display font-bold text-text-muted px-1">Sections</span>
        <input
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
          placeholder="e.g. Opening"
          className={`w-32 px-2 py-1 text-xs font-display bg-surface text-text rounded-md border placeholder:text-text-muted/60 focus:outline-none focus:ring-2 ${
            isDuplicateSectionName ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-border focus:border-primary-500 focus:ring-primary-500/20'
          }`}
        />
        <button
          type="button"
          onClick={handleAddSection}
          disabled={!newSectionName.trim() || isDuplicateSectionName}
          className="flex items-center gap-1 text-xs font-display font-medium px-2 py-1 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} /> Add section
        </button>
        {isDuplicateSectionName && <span className="text-[10px] font-display text-danger">Already used</span>}
      </div>

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
            title="Ungrouped"
            items={groups[UNGROUPED]}
            otherSectionNames={sections}
            isActive={activeSection === null}
            onSelect={() => setActiveSection(null)}
            renderRow={renderRow}
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
    </div>
  );
};
