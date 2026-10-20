import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
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
import { cn } from '@/lib/utils';
import { Button, IconChip, Input } from '../../../../components';
import { ChecklistDefinitionItemDraftRow, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import {
  UNGROUPED, MAX_CHECKLIST_ITEMS, MAX_SECTION_NAME_LENGTH, type SectionId,
  groupBySection, containerOrderFor, normalizeItemOrder, cloneItemDraft, copiedSectionName,
} from '../itemSections';
import { DRAG_SLOP_PX } from '../../../../lib/dragSlop';
import { revealAfterRender, questionFieldOf } from './reveal';

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
  validPersonIds?: ReadonlySet<string> | null;
}

const SortableItemRowImpl = ({
  draft,
  index,
  onChange,
  onRemove,
  onDuplicate,
  storeIds,
  validPersonIds,
}: {
  draft: ItemDraft;
  index: number;
  onChange: (key: string, patch: Partial<ItemDraft>) => void;
  onRemove: (key: string) => void;
  onDuplicate: (key: string) => void;
  storeIds?: string[];
  validPersonIds?: ReadonlySet<string> | null;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.key });
  const handleRemove = () => onRemove(draft.key);

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
        validPersonIds={validPersonIds}
        leading={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex items-center justify-center shrink-0 w-11 sm:w-7 h-11 sm:h-10 -ml-1 rounded-lg text-text-light hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            aria-label={`Drag question ${index + 1} to reorder`}
          >
            <GripVertical size={16} />
          </button>
        }
        trailing={
          <div className="flex flex-row sm:flex-col gap-1 pointer-coarse:gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="size-10 px-0 pointer-coarse:size-11 text-text-light hover:text-danger hover:bg-danger/10"
              aria-label="Remove question"
            >
              <Trash2 size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDuplicate(draft.key)}
              className="size-10 px-0 pointer-coarse:size-11 text-text-light hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-500/10"
              aria-label="Duplicate question"
              title="Duplicate question"
            >
              <Copy size={16} />
            </Button>
          </div>
        }
      />
    </div>
  );
};

const SortableItemRow = memo(SortableItemRowImpl);

const SECTION_ACTION = 'size-8 px-0 pointer-coarse:size-11 text-text-light hover:text-text-secondary';

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
  otherSectionNames: string[];
  isActive: boolean;
  onSelect: () => void;
  onRename?: (next: string) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  renderRow: (draft: ItemDraft) => ReactNode;
  bare?: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(title);

  const keySig = items.map((d) => d.key).join('|');
  const itemKeys = useMemo(() => (keySig ? keySig.split('|') : []), [keySig]);

  const trimmedDraft = draftName.trim();
  const isDuplicate = trimmedDraft !== title && otherSectionNames.includes(trimmedDraft);
  const canCommitRename = trimmedDraft.length > 0 && !isDuplicate;

  const commitRename = () => {
    if (!canCommitRename) return;
    setRenaming(false);
    if (trimmedDraft !== title) onRename?.(trimmedDraft);
  };

  return (
    <div
      data-section-name={title}
      className={`flex flex-col gap-3 rounded-2xl scroll-mt-24 transition-colors duration-150 ${isOver ? 'bg-primary-500/5 outline-2 outline-primary-400/40 outline-offset-4' : ''}`}
    >
      {!bare && <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-1 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          {renaming ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  label="Section name"
                  labelClassName="sr-only"
                  containerClassName="w-40"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setDraftName(title); setRenaming(false); }
                  }}
                  aria-invalid={isDuplicate}
                  className={cn(
                    'h-11 sm:h-8 rounded-md px-2 text-base sm:text-xs font-display font-bold',
                    isDuplicate ? 'border-danger focus:border-danger' : 'border-primary-400',
                  )}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={commitRename}
                  disabled={!canCommitRename}
                  className="size-8 px-0 pointer-coarse:size-11 text-success hover:text-success hover:bg-success/10"
                  aria-label="Save section name"
                >
                  <Check size={14} />
                </Button>
              </div>
              {isDuplicate && <span className="t-meta font-display text-danger">You already have a section with that name</span>}
            </div>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="flex items-center gap-1.5 min-h-11 sm:min-h-0 py-1 text-sm font-display font-semibold text-text hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer truncate rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              title="Add new questions to this section"
            >
              <Layers size={14} className={isActive ? 'text-primary-600 dark:text-primary-300' : 'text-text-light'} />
              <span className="truncate">{title}</span>
            </button>
          )}
          <span className="t-meta font-display text-text-muted tabular-nums shrink-0">{items.length}</span>
          {isActive && !renaming && (
            <IconChip icon={Plus} tone="bg-primary-600" label="New questions go here" className="shrink-0" />
          )}
        </div>

        {onRename && !renaming && (
          <div className="flex items-center gap-1 pointer-coarse:gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onMoveUp} disabled={!onMoveUp} className={SECTION_ACTION} aria-label={`Move ${title} section up`}>
              <ChevronUp size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onMoveDown} disabled={!onMoveDown} className={SECTION_ACTION} aria-label={`Move ${title} section down`}>
              <ChevronDown size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)} className={SECTION_ACTION} aria-label={`Rename ${title}`}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDuplicate} className={SECTION_ACTION} aria-label={`Duplicate ${title} section`} title="Duplicate section and its questions">
              <Copy size={13} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className={cn(SECTION_ACTION, 'hover:text-danger hover:bg-danger/10')} aria-label={`Delete ${title} section`}>
              <X size={14} />
            </Button>
          </div>
        )}
      </div>}

      <div className="flex flex-col gap-2.5 min-h-[3.25rem]">
        <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div
              ref={setNodeRef}
              className={`flex items-center justify-center py-6 px-4 text-center rounded-2xl border t-meta font-display transition-colors ${
                isOver ? 'border-primary-400 bg-primary-500/5 text-primary-700 dark:text-primary-300' : 'border-border/70 text-text-muted'
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

const MOUSE_SENSOR_OPTIONS = { activationConstraint: { distance: DRAG_SLOP_PX } };
const TOUCH_SENSOR_OPTIONS = { activationConstraint: { delay: 220, tolerance: 6 } };
const KEYBOARD_SENSOR_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };

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
  validPersonIds,
}: BuilderItemsListProps) => {
  const confirm = useConfirm();
  const [newSectionName, setNewSectionName] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS),
  );

  const containerOrder = useMemo<SectionId[]>(() => containerOrderFor(sections), [sections]);
  const groups = useMemo(() => groupBySection(itemDrafts, sections), [itemDrafts, sections]);
  const indexByKey = useMemo(() => new Map(itemDrafts.map((d, i) => [d.key, i] as const)), [itemDrafts]);
  const activeDraft = activeKey ? itemDrafts.find((d) => d.key === activeKey) : undefined;

  const itemDraftsRef = useRef(itemDrafts);
  useEffect(() => { itemDraftsRef.current = itemDrafts; });

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

  const handleDeleteSection = async (name: string) => {
    const count = itemDraftsRef.current.filter((d) => d.section === name).length;
    if (count > 0) {
      const ok = await confirm({
        title: `Delete the "${name}" section?`,
        description: `Its ${count} ${count === 1 ? 'question stays' : 'questions stay'} on the checklist and moves to No section.`,
        confirmLabel: 'Delete section',
        cancelLabel: 'Keep it',
        variant: 'danger',
      });
      if (!ok) return;
    }
    const nextSections = sections.filter((s) => s !== name);
    setSections(nextSections);
    setItemDrafts((prev) => normalizeItemOrder(prev.map((d) => (d.section === name ? { ...d, section: null } : d)), nextSections));
    if (activeSection === name) setActiveSection(null);
  };

  const wouldExceedItemLimit = useCallback((count: number) => {
    if (itemDraftsRef.current.length + count <= MAX_CHECKLIST_ITEMS) return false;
    toast.error(`A checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`);
    return true;
  }, []);

  const handleDuplicateItem = useCallback((key: string) => {
    const original = itemDraftsRef.current.find((d) => d.key === key);
    if (!original || wouldExceedItemLimit(1)) return;
    const copy = cloneItemDraft(original);
    setItemDrafts((prev) => {
      const i = prev.findIndex((d) => d.key === key);
      if (i < 0) return prev;
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
    toast.success('Question duplicated');
    revealAfterRender(() => questionFieldOf(copy.key), true);
  }, [setItemDrafts, wouldExceedItemLimit]);

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
    revealAfterRender(() => document.querySelector<HTMLElement>(`[data-section-name="${window.CSS.escape(copyName)}"]`), false);
  };

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

    const liveGroups: Record<SectionId, ItemDraft[]> = { ...groups };
    const sourceContainer = containerOrder.find((id) => liveGroups[id].some((d) => d.key === activeItemKey));
    if (!sourceContainer) return;

    const isOverAContainer = containerOrder.includes(overId);
    const targetContainer = isOverAContainer
      ? overId
      : containerOrder.find((id) => liveGroups[id].some((d) => d.key === overId));
    if (!targetContainer) return;

    if (sourceContainer === targetContainer) {
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

  const renderRow = useCallback((draft: ItemDraft) => (
    <SortableItemRow
      key={draft.key}
      draft={draft}
      index={indexByKey.get(draft.key) ?? 0}
      onChange={onUpdateDraft}
      onRemove={onRemoveItem}
      onDuplicate={handleDuplicateItem}
      storeIds={storeIds}
      validPersonIds={validPersonIds}
    />
  ), [indexByKey, onUpdateDraft, onRemoveItem, handleDuplicateItem, storeIds, validPersonIds]);

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
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary-400 bg-surface rotate-1 scale-[1.02] cursor-grabbing">
              <GripVertical size={14} className="text-text-light shrink-0" />
              <span className="text-sm font-display font-medium text-text truncate">
                {activeDraft.label.trim() || 'Untitled question'}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 min-h-11 sm:min-h-10 pl-3 pr-1 rounded-lg border border-border focus-within:border-primary-400 focus-within:border-solid transition-colors">
          <Layers size={14} className="text-text-light shrink-0" />
          <Input
            label="New section name"
            labelClassName="sr-only"
            containerClassName="flex-1 min-w-0"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            maxLength={MAX_SECTION_NAME_LENGTH}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
            placeholder="New section, e.g. Opening"
            className="h-10 border-0 rounded-none bg-transparent px-0 text-sm font-display"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddSection}
            disabled={!newSectionName.trim() || isDuplicateSectionName}
            className="shrink-0 text-primary-700 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-500/10"
          >
            <Plus size={13} /> Add section
          </Button>
        </div>
        {isDuplicateSectionName && <span className="px-3 t-meta font-display text-danger">You already have a section with that name.</span>}
      </div>
    </div>
  );
};
