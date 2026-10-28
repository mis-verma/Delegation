import { useMemo, useState } from 'react';
import { Check, Clock, ListPlus } from 'lucide-react';
import { Button, Modal, SelectDropdown, Skeleton } from '../../components';
import { useCategoriesQuery, useCreateManyCategoriesMutation, useDepartmentsQuery } from './hook';
import { STARTER_CATEGORIES, normalizeCategoryName, suggestDepartmentId } from './starterCategories';
import { formatTatHours } from './tatFormat';

interface StarterCategoriesModalProps {
  onClose: () => void;
}

const SKIP = '';

export const StarterCategoriesModal = ({ onClose }: StarterCategoriesModalProps) => {
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery();
  const { data: categories = [] } = useCategoriesQuery();
  const createMany = useCreateManyCategoriesMutation();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const existing = useMemo(() => new Set(categories.map((category) => normalizeCategoryName(category.name))), [categories]);
  const options = useMemo(
    () => [{ value: SKIP, label: 'Skip this one' }, ...departments.map((department) => ({ value: department.id, label: department.name }))],
    [departments],
  );

  const rows = STARTER_CATEGORIES.map((starter) => {
    const exists = existing.has(normalizeCategoryName(starter.name));
    const departmentId = picked[starter.name] ?? suggestDepartmentId(starter.hints, departments);
    return { ...starter, exists, departmentId };
  });
  const ready = rows.filter((row) => !row.exists && row.departmentId !== SKIP);

  const submit = () => {
    createMany.mutate(
      ready.map((row) => ({ name: row.name, departmentId: row.departmentId, tatHours: row.tatHours })),
      { onSuccess: ({ failed }) => { if (failed.length === 0) onClose(); } },
    );
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
      <Button type="button" variant="primary" size="sm" disabled={ready.length === 0} isLoading={createMany.isPending} onClick={submit} className="max-sm:h-11">
        {ready.length === 0 ? 'Nothing to add' : `Add ${ready.length} ${ready.length === 1 ? 'category' : 'categories'}`}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      icon={<ListPlus className="size-5" />}
      title="Add the usual categories"
      description="Pick which team handles each one. Due times come from how long these took in the past. You can change anything later."
      footer={footer}
      showCloseButton={false}
      size="xl"
      draggable
    >
      {departmentsPending ? (
        <div className="flex flex-col gap-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface p-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words t-card font-display font-semibold text-text">{row.name}</span>
                <span className="inline-flex items-center gap-1 t-meta font-display text-text-muted">
                  <Clock className="size-3" aria-hidden />
                  Due in {formatTatHours(row.tatHours)}
                </span>
              </div>
              {row.exists ? (
                <span className="inline-flex items-center gap-1 t-meta font-display font-semibold text-vivid-green-text">
                  <Check className="size-3.5" aria-hidden />
                  Already added
                </span>
              ) : (
                <div className="sm:w-56">
                  <SelectDropdown
                    aria-label={`Team for ${row.name}`}
                    value={row.departmentId}
                    options={options}
                    onChange={(value) => setPicked((current) => ({ ...current, [row.name]: value }))}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
