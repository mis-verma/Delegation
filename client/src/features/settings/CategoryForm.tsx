import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tag, Building2, Users, Clock, Route, type LucideIcon } from 'lucide-react';
import { Input, Button, UserMultiSelect, Modal, Combobox, DepartmentChip, IconChip } from '../../components';
import { cn } from '@/lib/utils';
import { useCreateCategoryMutation, useUpdateCategoryMutation, useDepartmentsQuery } from './hook';
import type { Category } from '@/api/categories';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name'),
  departmentId: z.string().min(1, 'Pick the department that handles it'),
  assigneeIds: z.array(z.string()).optional(),
  tatHours: z
    .string()
    .optional()
    .refine(v => !v || (/^[0-9]+$/.test(v) && Number(v) > 0 && Number(v) <= 720), 'Enter whole hours, 1 to 720'),
});

type CategoryFields = z.infer<typeof categorySchema>;

const TAT_PRESETS = [
  { hours: '4', label: '4 hours' },
  { hours: '8', label: '8 hours' },
  { hours: '24', label: '1 day' },
  { hours: '48', label: '2 days' },
  { hours: '72', label: '3 days' },
] as const;

const PILL = 'h-9 pointer-coarse:h-10 px-3 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

const FieldLabel = ({ icon: Icon, htmlFor, children, optional }: { icon: LucideIcon; htmlFor?: string; children: string; optional?: boolean }) => (
  <label htmlFor={htmlFor} className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
    <Icon className="size-3.5 text-text-light" strokeWidth={2.5} aria-hidden />
    {children}
    {optional && <span className="font-medium text-text-light">(optional)</span>}
  </label>
);

const dueText = (hours: string) => {
  const n = Number(hours);
  if (!hours || !n) return 'System default';
  if (n % 24 === 0) return `${n / 24} ${n === 24 ? 'day' : 'days'}`;
  return `${n} ${n === 1 ? 'hour' : 'hours'}`;
};

interface CategoryFormProps {
  onClose: () => void;
  category?: Category;
  /** Fired with the new category right after a successful create (not when editing), so a caller
   *  opening this as a quick "create new" (the ticket form's category picker) can select it. */
  onCreated?: (category: Category) => void;
}

export const CategoryForm = ({ onClose, category, onCreated }: CategoryFormProps) => {
  const isEditing = !!category;
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const { data: departments, isPending: isDepartmentsLoading } = useDepartmentsQuery();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CategoryFields>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      departmentId: category?.departmentId?.id ?? '',
      assigneeIds: category?.assigneeIds?.map(u => u.id) ?? [],
      tatHours: category?.tatHours ? String(category.tatHours) : '',
    },
  });

  const [departmentId, assigneeIds, tatHours, name] = useWatch({ control, name: ['departmentId', 'assigneeIds', 'tatHours', 'name'] });
  const departmentName = departments?.find(d => d.id === departmentId)?.name;
  const isPreset = !tatHours || TAT_PRESETS.some(p => p.hours === tatHours);
  const peopleCount = assigneeIds?.length ?? 0;

  const onSubmit = (data: CategoryFields) => {
    const payload = {
      name: data.name.trim(),
      departmentId: data.departmentId,
      assigneeIds: data.assigneeIds ?? [],
      tatHours: data.tatHours ? Number(data.tatHours) : null,
    };

    if (isEditing) {
      updateMutation.mutate({ id: category.id, payload }, { onSuccess: () => onClose() });
    } else {
      createMutation.mutate(payload, { onSuccess: (created) => { onCreated?.(created); onClose(); } });
    }
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose} className="max-sm:h-11">Cancel</Button>
      <Button type="submit" form="category-form" variant="primary" size="sm" isLoading={mutation.isPending} className="max-sm:h-11">
        {isEditing ? 'Save changes' : 'Create category'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      icon={<Tag className="w-5 h-5" />}
      title={isEditing ? 'Edit category' : 'New category'}
      description="Picking it on a ticket fills in the team, the people and the due time."
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <FieldLabel icon={Tag} htmlFor="category-name">Name</FieldLabel>
          <Input id="category-name" placeholder="e.g. Fan not working" autoComplete="off" error={errors.name?.message} {...register('name')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel icon={Building2} htmlFor="departmentId">Handled by</FieldLabel>
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <Combobox
                id="departmentId"
                value={field.value}
                onChange={field.onChange}
                isLoading={isDepartmentsLoading}
                placeholder="Search departments..."
                emptyOptionLabel="Choose a department"
                options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
                className={errors.departmentId ? 'border-danger/60' : undefined}
              />
            )}
          />
          {errors.departmentId?.message && <span role="alert" className="t-meta font-medium text-danger">{errors.departmentId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel icon={Users} optional>Who gets it</FieldLabel>
          <Controller
            control={control}
            name="assigneeIds"
            render={({ field }) => (
              <UserMultiSelect departmentId={departmentId || undefined} selected={field.value ?? []} onChange={field.onChange} />
            )}
          />
          <span className="t-meta text-text-muted">The first person is picked on the ticket. Leave empty and the department head picks someone.</span>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel icon={Clock}>Due within</FieldLabel>
          <div role="radiogroup" aria-label="Due within" className="flex flex-wrap gap-1.5">
            {TAT_PRESETS.map(p => {
              const on = tatHours === p.hours;
              return (
                <button key={p.hours} type="button" role="radio" aria-checked={on} onClick={() => setValue('tatHours', p.hours, { shouldDirty: true, shouldValidate: true })} className={cn(PILL, on ? PILL_ON : PILL_OFF)}>
                  {p.label}
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={!tatHours} onClick={() => setValue('tatHours', '', { shouldDirty: true, shouldValidate: true })} className={cn(PILL, !tatHours ? PILL_ON : PILL_OFF)}>
              System default
            </button>
          </div>
          <Input
            id="tatHours"
            inputMode="numeric"
            placeholder="Or type hours, e.g. 36"
            aria-label="Due within, in hours"
            suffix={<span className="t-meta text-text-light">hours</span>}
            error={errors.tatHours?.message}
            className={!isPreset ? 'border-primary-500/50' : undefined}
            {...register('tatHours')}
          />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/40 p-3" aria-live="polite">
          <p className="flex items-center gap-1.5 t-meta font-display font-semibold text-text">
            <Route size={14} className="text-text-light" aria-hidden />
            {name?.trim() ? `Picking "${name.trim()}" on a ticket` : 'Picking this on a ticket'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {departmentName ? <DepartmentChip name={departmentName} /> : <IconChip icon={Building2} tone="bg-text-muted" label="No department yet" />}
            <IconChip icon={Users} tone={peopleCount ? 'bg-success' : 'bg-warning'} label={peopleCount ? `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}` : 'Head picks'} />
            <IconChip icon={Clock} tone="bg-text-muted" label={`Due in ${dueText(tatHours ?? '')}`} />
          </div>
        </div>

        {mutation.isError && (
          <p role="alert" className="t-meta font-medium text-danger">
            {mutation.error instanceof Error ? mutation.error.message : `Couldn't ${isEditing ? 'save' : 'create'} the category. Try again.`}
          </p>
        )}
      </form>
    </Modal>
  );
};
