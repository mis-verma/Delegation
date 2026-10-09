import { useState } from 'react';
import { Copy, Shirt, X } from 'lucide-react';
import { AccessoriesListEditor, Button, Combobox, Dropdown, IconChip, InlineError, useConfirm } from '../../../../components';
import { useDressTypesQuery } from '../../../admin/dressTypes/hook';
import { DressTypeFormDialog } from '../../../admin/dressTypes/DressTypeFormDialog';
import type { DressType } from '../../../../api/dressTypes';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

interface AuditUniformListsProps {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
}

type CopySource = { id: string; label: string; items: string[] };

const MAIN = 'main';
const FEMALE = 'female';
const MALE = 'male';

const GENDER_LABEL = { FEMALE: 'Women', MALE: 'Men' } as const;

// "Copy items from": replaces the target list with a copy of another one, so a type that is nearly
// the same as one you already filled in takes two taps instead of retyping it.
const CopyItemsMenu = ({ targetId, sources, onCopy }: { targetId: string; sources: CopySource[]; onCopy: (items: string[]) => void }) => {
  const options = sources.filter((s) => s.id !== targetId && s.items.length > 0);
  if (options.length === 0) return null;
  return (
    <Dropdown
      align="end"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 h-7 pointer-coarse:h-11 px-2 -mr-1 rounded-md t-meta font-display font-medium text-text-muted cursor-pointer transition-colors duration-150 hover:bg-surface-hover hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Copy size={12} aria-hidden />
          Copy items from
        </button>
      }
      items={options.map((s) => ({
        label: `${s.label} (${s.items.length})`,
        onClick: () => onCopy([...s.items]),
      }))}
    />
  );
};

/**
 * The per-person lists of an audit question, below the main list: one for women, one for men, and
 * any number of admin-defined dress types, each with its own list. A person is checked against the
 * list of their dress type, else their gender's, else the main one.
 */
export const AuditUniformLists = ({ draft, onChange }: AuditUniformListsProps) => {
  const confirm = useConfirm();
  const { data: catalog, isLoading, isError, refetch } = useDressTypesQuery();
  const [creatingName, setCreatingName] = useState<string | null>(null);

  const byType = draft.accessoriesByType;
  const addedIds = Object.keys(byType);
  const typeById = (id: string): DressType | undefined => catalog?.find((t) => t.id === id);
  const addable = (catalog ?? []).filter((t) => t.isActive && !addedIds.includes(t.id));

  const setTypeList = (id: string, items: string[]) => onChange({ accessoriesByType: { ...byType, [id]: items } });
  const addType = (id: string) => {
    if (id && !(id in byType)) onChange({ accessoriesByType: { ...byType, [id]: [] } });
  };
  const removeType = async (id: string, name: string) => {
    if ((byType[id] ?? []).length > 0) {
      const ok = await confirm({
        title: `Remove ${name} from this question?`,
        description: 'Its list of items is deleted here. People with this type are then checked against their gender list instead.',
        confirmLabel: 'Remove type',
        cancelLabel: 'Keep it',
        variant: 'danger',
      });
      if (!ok) return;
    }
    const next = { ...byType };
    delete next[id];
    onChange({ accessoriesByType: next });
  };

  const sources: CopySource[] = [
    { id: MAIN, label: 'Everyone (main list)', items: draft.accessories },
    { id: FEMALE, label: 'Women (default)', items: draft.accessoriesFemale },
    { id: MALE, label: 'Men (default)', items: draft.accessoriesMale },
    ...addedIds.map((id) => ({ id, label: typeById(id)?.name ?? 'Removed type', items: byType[id] })),
  ];
  const copyMenu = (targetId: string, apply: (items: string[]) => void) => (
    <CopyItemsMenu targetId={targetId} sources={sources} onCopy={apply} />
  );

  return (
    <>
      <AccessoriesListEditor
        label="Everyone (main list)"
        placeholder="e.g. ID card, name badge"
        accessories={draft.accessories}
        onChange={(accessories) => onChange({ accessories })}
        labelAction={copyMenu(MAIN, (accessories) => onChange({ accessories }))}
      />

      <div className="flex flex-col gap-3 p-3 rounded-lg border border-dashed border-border bg-surface-hover/30">
        <p className="t-meta font-display text-text-muted leading-relaxed">
          Each person is checked against the list of their dress type. People with no type, or a type
          with an empty list here, get their gender&rsquo;s list, then the main list.
        </p>

        <AccessoriesListEditor
          label="Women (default)"
          placeholder="e.g. Coat, formal pant, heels, name badge"
          accessories={draft.accessoriesFemale}
          onChange={(accessoriesFemale) => onChange({ accessoriesFemale })}
          labelAction={copyMenu(FEMALE, (accessoriesFemale) => onChange({ accessoriesFemale }))}
        />
        <AccessoriesListEditor
          label="Men (default)"
          placeholder="e.g. Tie, formal shoes"
          accessories={draft.accessoriesMale}
          onChange={(accessoriesMale) => onChange({ accessoriesMale })}
          labelAction={copyMenu(MALE, (accessoriesMale) => onChange({ accessoriesMale }))}
        />

        <div className="flex flex-col gap-2.5 pt-3 border-t border-border/60">
          <span className="t-meta font-display font-medium text-text-muted">Dress types</span>

          {addedIds.map((id) => {
            const type = typeById(id);
            const name = type?.name ?? (isLoading ? 'Loading type' : 'Removed type');
            return (
              <div key={id} className="flex flex-col gap-2.5 p-3 rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Shirt size={14} className="shrink-0 text-text-light" aria-hidden />
                    <span className="text-sm font-display font-semibold text-text break-words">{name}</span>
                    {type?.gender && <IconChip icon={false} label={GENDER_LABEL[type.gender]} />}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeType(id, name)}
                    aria-label={`Remove ${name}`}
                    className="shrink-0 pointer-coarse:min-h-11 text-text-muted hover:text-danger hover:bg-danger/10"
                  >
                    <X size={13} aria-hidden /> Remove
                  </Button>
                </div>
                <AccessoriesListEditor
                  label={`Items for ${name}`}
                  placeholder="e.g. Saree, blouse, name badge"
                  accessories={byType[id]}
                  onChange={(items) => setTypeList(id, items)}
                  labelAction={copyMenu(id, (items) => setTypeList(id, items))}
                />
              </div>
            );
          })}

          {isError && <InlineError message="Couldn't load the dress types." onRetry={() => refetch()} />}

          <Combobox
            value=""
            onChange={addType}
            isLoading={isLoading}
            placeholder={addedIds.length > 0 ? 'Add another type' : 'Add a type'}
            options={addable.map((t) => ({ value: t.id, label: t.gender ? `${t.name} (${GENDER_LABEL[t.gender]})` : t.name }))}
            onCreateNew={(query) => setCreatingName(query)}
            createNewLabel="Create new type"
          />
        </div>
      </div>

      {creatingName !== null && (
        <DressTypeFormDialog
          nested
          prefillName={creatingName}
          onClose={() => setCreatingName(null)}
          onCreated={(created) => addType(created.id)}
        />
      )}
    </>
  );
};
