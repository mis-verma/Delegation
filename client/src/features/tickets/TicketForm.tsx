import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket as TicketIcon, AlertCircle, Check, Type, AlignLeft, Camera, Image as ImageIcon, Route, Clock, UserCheck } from 'lucide-react';

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
import { FormField } from './form/FormField';
import { PhotoTiles } from './form/PhotoTiles';
import { FIELD_TRIGGER_CLASS } from './form/formConstants';
import { TaskDescriptionField } from '../tasks/TaskDescriptionField';
import { DETAIL_HEADING_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { OWN_SCOPE_ROLES } from '../../api/auth';

// Quiet fill until focused; Input's own danger styling takes over once validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

interface TicketFormProps {
  onClose: () => void;
}

export const TicketForm = ({ onClose }: TicketFormProps) => {
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

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<TicketFields>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', assignmentMode: 'MANUAL' },
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
  const pickedPerson = assigneeId ? assigneeChoices?.find(u => u.id === assigneeId) : undefined;
  const assigneeName = pickedPerson ? `${pickedPerson.firstName} ${pickedPerson.lastName ?? ''}`.trim() : '';
  // Focus the title on laptops and desktops only. On a phone the keyboard would pop up over the
  // form the moment it opens.
  const canAutoFocus = useMediaQuery('(hover: hover) and (pointer: fine)');

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
      // xl (a 2xl-wide dialog) from sm up; lg and wider switch to a wider dialog that holds the
      // two-column layout (text on the left, routing on the right) without scrolling on a laptop.
      size="xl"
      contentClassName="lg:max-w-4xl"
      icon={<TicketIcon className="w-5 h-5" />}
      title="New ticket"
      description={<span className="hidden sm:inline">{ownScopeOnly ? "Say what's wrong, then choose where it should go." : "Say what's wrong, then choose who picks it up."}</span>}
      footer={footer}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0 px-4 py-3 sm:px-5 sm:py-3.5"
      footerClassName="border-t-0 px-4 sm:px-5"
      // X on phones only, where the footer has just the Create button. Desktop keeps Cancel.
      closeButtonClassName="sm:hidden"
    >
      {/* One column on phones and tablets: title, description, then routing, then labels. From lg:
          text fields on the left, the routing panel on the right (spanning both rows), labels
          under the text so the two columns stay about the same height. */}
      <form
        id="ticket-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-5 px-4 pb-4 pt-1 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6"
        noValidate
      >
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className={DETAIL_HEADING_CLASS}>
              <Type size={14} className="text-text-light" />
              Title <span className="text-danger">*</span>
            </label>
            <Input
              id="title"
              placeholder="e.g. Card machine at counter 2 not printing"
              error={errors.title?.message}
              className={`h-12 sm:h-10 ${errors.title ? 'font-display' : QUIET_FIELD_CLASS}`}
              {...register('title')}
              // Phones skip the autofocus: it would raise the keyboard over the form before the
              // person has even seen it. Enter moves on to the description instead of submitting.
              autoFocus={canAutoFocus}
              enterKeyHint="next"
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                document.getElementById('description')?.focus();
              }}
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
                  rows={4}
                  placeholder="What happened, where, and since when…"
                  toolbar={<PhotoToolbar onAdd={addPhotos} />}
                  // The shared textarea is text-sm, which makes iOS zoom the page on focus, so it is
                  // bumped to 16px below sm and given more room once the left column has it.
                  containerClassName={`[&_textarea]:min-h-28 [&_textarea]:text-base sm:[&_textarea]:text-sm lg:[&_textarea]:min-h-52 ${errors.description ? 'border-danger' : 'border-transparent bg-surface-hover/50 focus-within:bg-surface'}`}
                >
                  {photos.length > 0 && <PhotoTiles files={photos} onRemove={removePhoto} />}
                </TaskDescriptionField>
              )}
            />
            {errors.description?.message && (
              <p className="text-xs text-danger font-display" role="alert">{errors.description.message}</p>
            )}
          </div>
        </div>

        {/* Routing: what decides where the ticket lands. The mode comes first because it decides
            which fields below are offered. */}
        <section aria-label="Routing" className="flex min-w-0 flex-col gap-4 lg:row-span-2 lg:rounded-xl lg:border lg:border-border/50 lg:bg-surface-hover/30 lg:p-4">
          <AssignmentModeToggle
            mode={assignmentMode}
            onChange={m => {
              setValue('assignmentMode', m);
              // Auto means the category decides, so a person picked by hand earlier is put back to the category's.
              if (m === 'AUTO' && selectedCategory) applyCategory(selectedCategory);
            }}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Picking a category fills in the department, the responsible person and the due date. */}
            <FormField
              label="Category"
              htmlFor="ticket-category"
              required={assignmentMode === 'AUTO'}
              error={errors.categoryId?.message}
              className={assignmentMode === 'AUTO' ? 'sm:col-span-2' : ''}
            >
              <Combobox
                id="ticket-category"
                value={categoryId ?? ''}
                onChange={selectCategory}
                placeholder="Search categories..."
                emptyOptionLabel="No category"
                options={(categories ?? []).map(c => ({ value: c.id, label: c.name }))}
                onCreateNew={isVerifier ? () => setCreating('category') : undefined}
                createNewLabel="New category"
                className={`${FIELD_TRIGGER_CLASS} ${errors.categoryId ? 'border-danger/60' : ''}`}
              />
            </FormField>

            {assignmentMode === 'MANUAL' && (
              <FormField
                label="Department"
                htmlFor="ticket-department"
                required
                aside={selectedCategory ? 'From category' : undefined}
                error={errors.departmentId?.message}
              >
                <Combobox
                  id="ticket-department"
                  value={departmentId ?? ''}
                  onChange={v => setValue('departmentId', v)}
                  disabled={!!selectedCategory}
                  placeholder="Search departments..."
                  emptyOptionLabel="Choose a department"
                  options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
                  onCreateNew={isVerifier ? () => setCreating('department') : undefined}
                  createNewLabel="New department"
                  className={`${FIELD_TRIGGER_CLASS} ${errors.departmentId ? 'border-danger/60' : ''}`}
                />
              </FormField>
            )}

            {!ownScopeOnly && assignmentMode === 'MANUAL' && (
              <FormField label="Assignee" required error={errors.assigneeId?.message} className="sm:col-span-2">
                <div className="flex min-h-11 min-w-0 items-center gap-2 sm:min-h-10">
                  {/* The picker's own buttons are 32px; on touch screens an invisible ring of
                      extra hit area brings each one to 44px without changing how it looks. */}
                  <div className="shrink-0 pointer-coarse:[&_button]:relative pointer-coarse:[&_button]:after:absolute pointer-coarse:[&_button]:after:-inset-1.5 pointer-coarse:[&_button]:after:content-['']">
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
                  {assigneeName && <span className="min-w-0 truncate text-sm font-medium text-text">{assigneeName}</span>}
                </div>
              </FormField>
            )}

            <FormField
              label="Priority"
              htmlFor="ticket-priority"
              className={assignmentMode === 'AUTO' ? 'sm:col-span-2' : ''}
            >
              <TicketPriorityChipPicker id="ticket-priority" value={priority} onChange={v => setValue('priority', v)} />
            </FormField>

            {assignmentMode === 'MANUAL' && (
              <FormField label="Due date" required>
                <DueDateField
                  mode="MANUAL"
                  hideLabel
                  triggerClassName={FIELD_TRIGGER_CLASS}
                  control={control}
                  setValue={setValue}
                  errors={errors}
                  categoryTatHours={selectedCategory?.tatHours}
                />
              </FormField>
            )}
          </div>

          {assignmentMode === 'AUTO' && (
            <DueDateField
              mode="AUTO"
              control={control}
              setValue={setValue}
              errors={errors}
              categoryTatHours={selectedCategory?.tatHours}
            />
          )}

          {/* What the chosen category decided, in plain words, so nothing is filled in silently. */}
          {selectedCategory && (
            <div className="flex min-w-0 flex-col gap-2 p-3 rounded-xl border border-primary-500/20 bg-primary-500/5 dark:bg-primary-500/10">
              <p className="flex items-start gap-1.5 text-xs font-display font-semibold text-text">
                <Route size={14} className="mt-px shrink-0 text-primary-600 dark:text-primary-300" aria-hidden />
                <span className="min-w-0 wrap-break-word">Goes where "{selectedCategory.name}" sends it</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <DepartmentChip name={selectedCategory.departmentId.name} />
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
                {selectedCategory.tatHours ? <IconChip icon={Clock} tone="bg-primary-600" label={`Due in ${selectedCategory.tatHours}h`} /> : null}
              </div>
              <p className="text-xs font-display text-text-muted">
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

          {!isVerifier && (
            <p className="text-xs text-text-light font-display">
              Can't find the right category? Ask an admin to add it.
            </p>
          )}
        </section>

        {/* No Reviewers picker here: PC and Admin already verify every ticket by default
            (ticket.service CAN_VERIFY_BY_ROLE), so naming one was a manual step that changed
            nothing. */}
        <div className="min-w-0">
          <LabelsField
            tags={tags ?? []}
            selectedIds={tagIds ?? []}
            onChange={v => setValue('tagIds', v)}
            canCreate={isVerifier}
          />
        </div>

        {mutation.isError && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger font-display flex items-center gap-2.5 lg:col-span-2">
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
  // Labelled, not icon-only, so it reads as "add photos" at a glance; 44px tall on touch screens.
  const btn = 'flex items-center justify-center gap-1.5 h-8 pointer-coarse:h-11 px-2.5 rounded-lg text-xs font-medium font-display text-text-secondary hover:text-primary-600 hover:bg-surface-hover transition-colors cursor-pointer shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';
  return (
    <div className="flex items-center gap-1">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
      <button type="button" title="Take photo" aria-label="Take photo" className={btn} onClick={() => cameraRef.current?.click()}>
        <Camera size={15} /> Camera
      </button>
      <button type="button" title="Add photo from gallery" aria-label="Add photo from gallery" className={btn} onClick={() => galleryRef.current?.click()}>
        <ImageIcon size={15} /> Gallery
      </button>
    </div>
  );
};
