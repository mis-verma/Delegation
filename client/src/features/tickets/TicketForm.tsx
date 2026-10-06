import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket as TicketIcon, AlertCircle, Check, Type, AlignLeft, SlidersHorizontal, Camera, Image as ImageIcon, Route, Clock, UserCheck } from 'lucide-react';

import { Button, Modal, Input, Combobox, DepartmentChip, IconChip } from '../../components';
import { useCreateTicketMutation, useAssignableUsersQuery, useDepartmentsQuery } from './hook';
import { useCategoriesQuery } from '../settings/hook';
import { useTagsQuery } from '../tags/hook';
import { LabelsField } from '../tags/LabelsField';
import { AssigneeField } from '../assignees/AssigneeField';
import { ticketApi } from '../../api/ticket';
import type { Category } from '../../api/categories';
import type { AssignableUser } from '../../api/users';
import { buildTicketSchema, type TicketFields } from './form/ticketFormSchema';
import { CategoryForm } from '../settings/CategoryForm';
import { DepartmentForm } from '../admin/department/DepartmentForm';
import { AssignmentModeToggle } from './form/AssignmentModeToggle';
import { DueDateField } from './form/DueDateField';
import { TicketPriorityChipPicker } from './form/TicketPriorityChipPicker';
import { TaskDescriptionField } from '../tasks/TaskDescriptionField';
import { StagedFileChips } from '../tasks/StagedFileChips';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';

// The chips stay 32px tall. On a touch screen the shared Combobox / DatePicker triggers would grow to
// 44px (pointer-coarse:min-h-11), so that is pinned back to 32px and an invisible pseudo-element
// pads the tap area out to 44px instead. The chips row uses gap-y-3 so those areas never overlap.
const CHIP_TOUCH_AREA = 'relative pointer-coarse:min-h-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:inset-x-0';

// Quiet fill until focused; Input's own danger styling takes over once validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

interface TicketFormProps {
  onClose: () => void;
  /** Starts the due date and time on this moment (the Calendar's "New ticket" for the picked day).
   *  Ignored when it is already in the past, since a ticket's due time must be in the future. */
  defaultDueDate?: Date;
}

export const TicketForm = ({ onClose, defaultDueDate }: TicketFormProps) => {
  const { user } = useAuth();
  // Same role test the rest of the app uses for "may create a new label" — matches Delegation's
  // TaskForm exactly, since it's the same server-side gate (POST /tags is ADMIN/PC only).
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  // Front-line staff send a ticket to a department (or a category, which routes it); a manager or
  // Admin/PC picks the named person. Same role set the server already stops from re-assigning.
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const { data: departments } = useDepartmentsQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: tags } = useTagsQuery();
  const mutation = useCreateTicketMutation();
  const queryClient = useQueryClient();
  // "Create new" from inside this form: a missing category or department can be added on the spot by
  // Admin/PC (the server only lets them), then it's selected. Everyone else is told to ask an admin.
  const [creating, setCreating] = useState<'category' | 'department' | null>(null);
  // Front-line staff send to a department or category; everyone else must also pick the person.
  const schema = useMemo(() => buildTicketSchema({ requirePerson: !ownScopeOnly }), [ownScopeOnly]);

  const [photos, setPhotos] = useState<File[]>([]);
  const addPhotos = (files: FileList | null) => {
    if (!files || !files.length) return;
    setPhotos(prev => [...prev, ...Array.from(files)]);
  };
  const removePhoto = (index: number) => setPhotos(prev => prev.filter((_, idx) => idx !== index));

  // Read once, when the form opens: a Calendar day that is already past is ignored because a ticket's
  // due time must be in the future.
  const [initialDue] = useState(() =>
    defaultDueDate && defaultDueDate.getTime() > Date.now()
      ? { dueDate: toDateInput(defaultDueDate), dueTime: toTimeInput(defaultDueDate) }
      : {},
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<TicketFields>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', assignmentMode: 'MANUAL', ...initialDue },
  });

  const assignmentMode = useWatch({ control, name: 'assignmentMode' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const departmentId = useWatch({ control, name: 'departmentId' });
  const priority = useWatch({ control, name: 'priority' });
  const assigneeId = useWatch({ control, name: 'assigneeId' });
  const tagIds = useWatch({ control, name: 'tagIds' });
  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useAssignableUsersQuery(departmentId || undefined, undefined, undefined, !ownScopeOnly);

  // A category just created from inside this form is not in the cached list until it refetches, so it
  // is kept here too: picking "New category" must fill the form straight away, not a second later.
  const [justCreated, setJustCreated] = useState<Category | null>(null);
  const selectedCategory = categories?.find(c => c.id === categoryId) ?? (justCreated && justCreated.id === categoryId ? justCreated : undefined);

  // The category's own people, straight from the category (not from the department's list, which may
  // still be loading or may not include them). They are the choices in the person picker, so the one
  // pre-selected below always shows in the chip. A category with no people falls back to the whole
  // department list.
  const categoryPeople = useMemo<AssignableUser[]>(() => (selectedCategory?.assigneeIds ?? []).map(a => {
    const known = assignableUsers?.find(u => u.id === a.id);
    return known ?? { id: a.id, firstName: a.firstName, lastName: a.lastName, email: a.email, role: 'USER', departmentId: null };
  }), [selectedCategory, assignableUsers]);
  const assigneeChoices = categoryPeople.length ? categoryPeople : assignableUsers;

  useEffect(() => {
    if (categoryId) return;
    setValue('assigneeId', '');
  }, [departmentId, categoryId, setValue]);

  // Fills department, the responsible person and the due time from a category. Runs when the
  // category is picked (or just created), not whenever the cached list refreshes: a refetch used to
  // hand back a new object and silently overwrite a person chosen on purpose.
  const applyCategory = useCallback((category: Category) => {
    const deptId = typeof category.departmentId === 'object' ? category.departmentId.id : String(category.departmentId);
    setValue('categoryId', category.id, { shouldValidate: true });
    setValue('departmentId', deptId, { shouldValidate: true });
    setValue('assigneeId', category.assigneeIds?.[0]?.id ?? '', { shouldValidate: true });
    if (category.tatHours) {
      const due = new Date(Date.now() + category.tatHours * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setValue('dueDate', `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`);
      setValue('dueTime', `${pad(due.getHours())}:${pad(due.getMinutes())}`);
    }
  }, [setValue]);

  const selectCategory = (id: string) => {
    const category = categories?.find(c => c.id === id);
    if (category) applyCategory(category);
    else setValue('categoryId', id, { shouldValidate: true });
  };

  const onSubmit = useCallback((data: TicketFields) => {
    const tatHours = data.assignmentMode === 'MANUAL' && data.dueDate && data.dueTime
      ? Math.max(1, Math.ceil((new Date(`${data.dueDate}T${data.dueTime}`).getTime() - Date.now()) / (60 * 60 * 1000)))
      : undefined;

    mutation.mutate(
      {
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignmentMode: data.assignmentMode,
        categoryId: data.categoryId !== '' ? data.categoryId : undefined,
        departmentId: data.departmentId !== '' ? data.departmentId : undefined,
        assigneeId: data.assigneeId !== '' ? data.assigneeId : undefined,
        tatHours: tatHours ?? (data.assignmentMode === 'AUTO' ? (selectedCategory?.tatHours ?? 24) : undefined),
        startDate: data.assignmentMode === 'MANUAL' && data.startDate ? new Date(`${data.startDate}T00:00`).toISOString() : undefined,
        tagIds: data.tagIds?.length ? data.tagIds : undefined,
      },
      {
        onSuccess: async (created) => {
          if (photos.length) {
            try {
              await ticketApi.uploadAttachments(created.id, photos);
              queryClient.invalidateQueries({ queryKey: ['tickets'] });
            } catch {
              toast.error('Ticket created, but the photos failed to attach — add them from the ticket detail view instead.');
            }
          }
          onClose();
        },
      },
    );
  }, [mutation, photos, queryClient, onClose, selectedCategory]);

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
      {/* Desktop-only: on a phone the red * on the two labels already says it. */}
      <p className="hidden sm:block text-xs font-medium text-text-light font-display">
        <span className="text-danger">*</span> Title, description and where it goes are all required.
      </p>

      {/* Phones: one full-width Create; the X in the header dismisses. Desktop keeps Cancel. */}
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onClose} className="hidden sm:inline-flex font-display">
          Cancel
        </Button>
        <Button type="submit" form="ticket-form" variant="primary" size="sm" isLoading={mutation.isPending} className="max-sm:flex-1 max-sm:h-11 font-display">
          {!mutation.isPending && <Check size={16} strokeWidth={2.5} />}
          {mutation.isPending ? 'Creating…' : 'Create ticket'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<TicketIcon className="w-5 h-5" />}
      title="New ticket"
      description={<span className="hidden sm:inline">{ownScopeOnly ? "Say what's wrong, then choose where it should go." : "Say what's wrong, then choose who picks it up."}</span>}
      footer={footer}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // X on phones only, where the footer has just the Create button. Desktop keeps Cancel.
      closeButtonClassName="sm:hidden"
    >
      {/* Same layout as the New delegation form: icon labels over Title and Description, then
          one Details row of chips (category, department, priority, assignee, due date). */}
      <form id="ticket-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-5 pb-4 pt-0 sm:p-5" noValidate>
        {/* First, because it decides what the Details row below offers. */}
        <AssignmentModeToggle
          mode={assignmentMode}
          onChange={m => {
            setValue('assignmentMode', m);
            // Auto means the category decides, so a person picked by hand earlier is put back to the category's.
            if (m === 'AUTO' && selectedCategory) applyCategory(selectedCategory);
          }}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className={DETAIL_HEADING_CLASS}>
            <Type size={14} className="text-text-light" />
            Title <span className="text-danger">*</span>
          </label>
          <Input
            id="title"
            placeholder="e.g. Card machine at counter 2 not printing"
            error={errors.title?.message}
            className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
            {...register('title')}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className={DETAIL_HEADING_CLASS}>
            <AlignLeft size={14} className="text-text-light" />
            Description <span className="text-danger">*</span>
          </label>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <TaskDescriptionField
                id="description"
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                rows={3}
                placeholder="What happened, where, and since when…"
                toolbar={<PhotoToolbar onAdd={addPhotos} />}
                containerClassName={errors.description ? 'border-danger' : 'border-transparent bg-surface-hover/50 focus-within:bg-surface'}
              >
                {photos.length > 0 && <StagedFileChips files={photos} onRemove={removePhoto} />}
              </TaskDescriptionField>
            )}
          />
          {errors.description?.message && (
            <p className="text-xs text-danger font-display" role="alert">{errors.description.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={DETAIL_HEADING_CLASS}>
            <SlidersHorizontal size={14} className="text-text-light" />
            Details
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {/* Picking a category fills in the department, the responsible person and the due date. */}
            <div title="Category">
              <Combobox
                value={categoryId ?? ''}
                onChange={selectCategory}
                placeholder="Search categories..."
                emptyOptionLabel="No category"
                options={(categories ?? []).map(c => ({ value: c.id, label: c.name }))}
                onCreateNew={isVerifier ? () => setCreating('category') : undefined}
                createNewLabel="New category"
                className={`${CHIP_TRIGGER_CLASS} ${CHIP_TOUCH_AREA} max-w-[13rem] ${errors.categoryId ? 'border-danger/60' : ''}`}
              />
            </div>

            {assignmentMode === 'MANUAL' && (
            <div title="Department">
              <Combobox
                value={departmentId ?? ''}
                onChange={v => setValue('departmentId', v)}
                disabled={!!selectedCategory}
                placeholder="Search departments..."
                emptyOptionLabel="Choose a department"
                options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
                onCreateNew={isVerifier ? () => setCreating('department') : undefined}
                createNewLabel="New department"
                className={`${CHIP_TRIGGER_CLASS} ${CHIP_TOUCH_AREA} max-w-[13rem] ${errors.departmentId ? 'border-danger/60' : ''}`}
              />
            </div>
            )}

            <TicketPriorityChipPicker value={priority} onChange={v => setValue('priority', v)} />

            {!ownScopeOnly && assignmentMode === 'MANUAL' && (
              <div title="Assignee" className="flex items-center">
                <AssigneeField
                  single
                  hideLabel
                  selectedIds={assigneeId ? [assigneeId] : []}
                  onChange={ids => setValue('assigneeId', ids[0] ?? '')}
                  users={assigneeChoices}
                  isLoading={isLoadingAssignableUsers}
                  disabled={!departmentId && !selectedCategory}
                />
              </div>
            )}

            {assignmentMode === 'MANUAL' && (
              <div title="Due date">
                <DueDateField
                  mode="MANUAL"
                  hideLabel
                  triggerClassName={`${CHIP_TRIGGER_CLASS} ${CHIP_TOUCH_AREA}`}
                  control={control}
                  setValue={setValue}
                  errors={errors}
                  categoryTatHours={selectedCategory?.tatHours}
                />
              </div>
            )}
          </div>

          {/* What the chosen category decided, in plain words, so nothing is filled in silently. */}
          {selectedCategory && (
            <div className="flex flex-col gap-2 p-3 rounded-xl border border-primary-500/20 bg-primary-500/5 dark:bg-primary-500/10">
              <p className="flex items-center gap-1.5 text-xs font-display font-semibold text-text">
                <Route size={14} className="text-primary-600 dark:text-primary-300" aria-hidden />
                Goes where "{selectedCategory.name}" sends it
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {selectedCategory.departmentId.name ? <DepartmentChip name={selectedCategory.departmentId.name} /> : null}
                {selectedCategory.assigneeIds.length > 0 ? (
                  <IconChip
                    icon={UserCheck}
                    tone="bg-success"
                    label={`${[selectedCategory.assigneeIds[0].firstName, selectedCategory.assigneeIds[0].lastName].filter(Boolean).join(' ')}${selectedCategory.assigneeIds.length > 1 ? ` +${selectedCategory.assigneeIds.length - 1}` : ''}`}
                    title="Responsible person for this category"
                  />
                ) : (
                  <IconChip icon={UserCheck} tone="bg-warning" label="No responsible person set" />
                )}
                {selectedCategory.tatHours ? <IconChip icon={Clock} tone="bg-primary-600 dark:bg-primary-400" label={`Due in ${selectedCategory.tatHours}h`} /> : null}
              </div>
              <p className="text-[11px] font-display text-text-muted">
                {selectedCategory.assigneeIds.length === 0
                  ? (assignmentMode === 'AUTO'
                    ? 'Nobody is set for this category yet, so the ticket would have no owner. Switch to Manual and pick someone, or add a person in Settings.'
                    : 'Nobody is set for this category yet. Pick who should handle it above.')
                  : assignmentMode === 'AUTO'
                    ? 'Nothing else to choose. Change to Manual if you want a different person.'
                    : 'Filled in for you. You can change the person or the due date.'}
              </p>
            </div>
          )}

          {/* Why Create is blocked, in plain words, right under the chips they belong to. */}
          {(errors.categoryId?.message || errors.departmentId?.message || errors.assigneeId?.message) && (
            <p className="text-xs text-danger font-display" role="alert">
              {errors.categoryId?.message ?? errors.departmentId?.message ?? errors.assigneeId?.message}
            </p>
          )}
          {!isVerifier && (
            <p className="text-[11px] text-text-light font-display">
              Can't find the right category? Ask an admin to add it.
            </p>
          )}

          {assignmentMode === 'AUTO' && (
            <DueDateField
              mode="AUTO"
              control={control}
              setValue={setValue}
              errors={errors}
              categoryTatHours={selectedCategory?.tatHours}
            />
          )}
        </div>

        {/* No Reviewers picker here: PC and Admin already verify every ticket by default
            (ticket.service CAN_VERIFY_BY_ROLE), so naming one was a manual step that changed
            nothing. */}
        <LabelsField
          tags={tags ?? []}
          selectedIds={tagIds ?? []}
          onChange={v => setValue('tagIds', v)}
          canCreate={isVerifier}
        />

        {mutation.isError && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger font-display flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {mutation.error instanceof Error ? mutation.error.message : "Couldn't create the ticket. Check the fields and try again."}
          </div>
        )}
      </form>

      {creating === 'category' && (
        <CategoryForm
          onClose={() => setCreating(null)}
          onCreated={(created) => { setJustCreated(created); applyCategory(created); }}
        />
      )}
      {creating === 'department' && (
        <DepartmentForm
          nested
          onClose={() => setCreating(null)}
          onCreated={(created) => setValue('departmentId', created.id, { shouldValidate: true })}
        />
      )}
    </Modal>
  );
};

// Camera and gallery buttons in the description box's toolbar, same spot the delegation form
// puts its attach buttons. Tickets only take photos, so no file/document buttons.
const PhotoToolbar = ({ onAdd }: { onAdd: (files: FileList | null) => void }) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(e.target.files);
    e.target.value = '';
  };
  const btn = 'flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-light hover:text-primary-600 hover:bg-surface-hover transition-colors cursor-pointer shrink-0';
  return (
    <div className="flex items-center gap-0.5">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
      <button type="button" title="Take photo" aria-label="Take photo" className={btn} onClick={() => cameraRef.current?.click()}>
        <Camera size={15} />
      </button>
      <button type="button" title="Add photo from gallery" aria-label="Add photo from gallery" className={btn} onClick={() => galleryRef.current?.click()}>
        <ImageIcon size={15} />
      </button>
    </div>
  );
};
