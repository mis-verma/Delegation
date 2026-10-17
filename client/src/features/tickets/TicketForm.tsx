import { useForm, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { haptic } from '../../lib/haptics';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket as TicketIcon, AlertCircle, Check, FileClock, Type, AlignLeft, Building2, Flag, Camera, Image as ImageIcon, Route, Clock, UserCheck, ArrowRight } from 'lucide-react';

import { Button, Modal, Input, Combobox, DepartmentChip, IconChip } from '../../components';
import { useConfirm } from '@/components/confirmDialog';
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
import { FormField, StepHeading } from './form/FormField';
import { FormProgress } from './form/FormProgress';
import { TicketPriorityChipPicker } from './form/TicketPriorityChipPicker';
import { FIELD_TRIGGER_CLASS } from './form/formConstants';
import { hoursUntil } from './ticketDisplay';
import { TaskDescriptionField } from '../tasks/TaskDescriptionField';
import { StagedFileChips } from '../tasks/StagedFileChips';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { errorMessage, invalidateScoreCaches } from '../../lib/queryHelpers';
import type { Draft } from '../../api/drafts';
import { useDeleteDraftMutation, useSaveDraftMutation } from '../drafts/hook';

// Quiet fill until focused; Input's own danger styling takes over once validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

// Plain text link under a field, for switching how the ticket is routed.
const SWITCH_LINK_CLASS =
  'self-start relative inline-flex items-center gap-1.5 h-8 px-2 -ml-2 rounded-md t-meta font-display font-semibold text-text-secondary hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-y-1.5 after:inset-x-0';

// Neutral summary box (what a chosen category decided, the category due time).
const INFO_BOX_CLASS = 'flex flex-col gap-2 p-3 rounded-xl border border-border/60 bg-surface-hover/40';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// Order a failed Create looks for the first problem in, top to bottom as the form reads.
const FIELD_ORDER = ['title', 'description', 'categoryId', 'departmentId', 'assigneeId', 'dueDate', 'dueTime', 'startDate'] as const;
const anchorFor = (field: (typeof FIELD_ORDER)[number]) => (field === 'dueTime' || field === 'startDate' ? 'dueDate' : field);

interface TicketFormProps {
  onClose: () => void;
  /** Starts the due date and time on this moment (the Calendar's "New ticket" for the picked day).
   *  Ignored when it is already in the past, since a ticket's due time must be in the future. */
  defaultDueDate?: Date;
  draft?: Draft;
}

export const TicketForm = ({ onClose, defaultDueDate, draft }: TicketFormProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // Same role test the rest of the app uses for "may create a new label or category" (the server
  // only lets Admin/PC do either).
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  // Front-line staff (USER/AGENT) say what it is about, or send it to a department; they never pick
  // the person. Managers and up choose between the category routing it or picking it all themselves.
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const { data: departments } = useDepartmentsQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: tags } = useTagsQuery(!ownScopeOnly);
  const mutation = useCreateTicketMutation();
  const saveDraft = useSaveDraftMutation('TICKET');
  const deleteDraft = useDeleteDraftMutation('TICKET');
  const queryClient = useQueryClient();
  // "Create new" from inside this form: a missing category or department can be added on the spot by
  // Admin/PC (the server only lets them), then it's selected.
  const [creating, setCreating] = useState<'category' | 'department' | null>(null);
  const schema = useMemo(() => buildTicketSchema({ requirePerson: !ownScopeOnly }), [ownScopeOnly]);
  const formRef = useRef<HTMLFormElement>(null);

  // Focus the title on a desktop so typing can start at once; a phone's keyboard would cover the form.
  const [autoFocusTitle] = useState(() => !window.matchMedia('(pointer: coarse)').matches);

  const [photos, setPhotos] = useState<File[]>([]);
  const addPhotos = (files: FileList | null) => {
    if (!files || !files.length) return;
    setPhotos(prev => [...prev, ...Array.from(files)]);
  };
  const removePhoto = (index: number) => setPhotos(prev => prev.filter((_, idx) => idx !== index));

  // Held from the first tap on Create until the photos have uploaded too, so a second tap while they
  // upload can't raise the same ticket twice. A ref as well, because two taps can land before React
  // re-renders with the disabled button.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    getValues,
    formState: { errors, isDirty, submitCount },
  } = useForm<TicketFields>({
    resolver: zodResolver(schema),
    // Front-line staff start on "What is it about?", which is the category route.
    defaultValues: { priority: 'MEDIUM', assignmentMode: ownScopeOnly ? 'AUTO' : 'MANUAL', ...initialDue, ...(draft?.payload as Partial<TicketFields> | undefined) },
  });
  // After the first Create press, every change re-checks its field so a fixed error clears at once.
  const validateOnChange = submitCount > 0;
  const dirty = isDirty || photos.length > 0;

  const assignmentMode = useWatch({ control, name: 'assignmentMode' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const departmentId = useWatch({ control, name: 'departmentId' });
  const priority = useWatch({ control, name: 'priority' });
  const assigneeId = useWatch({ control, name: 'assigneeId' });
  const tagIds = useWatch({ control, name: 'tagIds' });
  const dueDate = useWatch({ control, name: 'dueDate' });
  const dueTime = useWatch({ control, name: 'dueTime' });
  const startDate = useWatch({ control, name: 'startDate' });
  // Front-line staff never pick a person, so they don't need anyone's list.
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
    const opts = { shouldValidate: true, shouldDirty: true };
    setValue('categoryId', category.id, opts);
    setValue('departmentId', deptId, opts);
    setValue('assigneeId', category.assigneeIds?.[0]?.id ?? '', opts);
    if (category.tatHours) {
      const due = new Date(Date.now() + category.tatHours * 60 * 60 * 1000);
      setValue('dueDate', toDateInput(due), opts);
      setValue('dueTime', toTimeInput(due), opts);
    }
  }, [setValue]);

  const selectCategory = (id: string) => {
    const category = categories?.find(c => c.id === id);
    if (category) applyCategory(category);
    else setValue('categoryId', id, { shouldValidate: true, shouldDirty: true });
  };

  // Front-line only: "Not listed? Send to a department" and back again.
  const sendToDepartment = (yes: boolean) => {
    const opts = { shouldDirty: true };
    setValue('assignmentMode', yes ? 'MANUAL' : 'AUTO', opts);
    setValue('categoryId', '', opts);
    setValue('departmentId', '', opts);
    setValue('assigneeId', '', opts);
  };

  // The due moment as one Date for the picker; the form keeps it as day + time strings.
  const due = dueDate ? new Date(`${dueDate}T${dueTime || '18:00'}`) : null;
  const start = startDate ? new Date(`${startDate}T00:00`) : null;
  const setDue = (d: Date | null) => {
    const opts = { shouldValidate: validateOnChange, shouldDirty: true };
    setValue('dueDate', d ? toDateInput(d) : '', opts);
    setValue('dueTime', d ? toTimeInput(d) : '', opts);
  };
  const setStart = (d: Date | null) => setValue('startDate', d ? toDateInput(d) : '', { shouldValidate: validateOnChange, shouldDirty: true });

  const onSubmit = async (data: TicketFields) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const tatHours = data.assignmentMode === 'MANUAL' && data.dueDate && data.dueTime
      ? hoursUntil(new Date(`${data.dueDate}T${data.dueTime}`))
      : undefined;

    let createdId: string;
    try {
      const created = await mutation.mutateAsync({
        title: data.title,
        description: data.description,
        priority: data.priority,
        assignmentMode: data.assignmentMode,
        categoryId: data.categoryId !== '' ? data.categoryId : undefined,
        departmentId: data.departmentId !== '' ? data.departmentId : undefined,
        // Front-line staff only ever carry the category's own person here, never one they picked.
        assigneeId: data.assigneeId || undefined,
        tatHours: tatHours ?? (data.assignmentMode === 'AUTO' ? (selectedCategory?.tatHours ?? 24) : undefined),
        startDate: data.assignmentMode === 'MANUAL' && !ownScopeOnly && data.startDate ? new Date(`${data.startDate}T00:00`).toISOString() : undefined,
        tagIds: !ownScopeOnly && data.tagIds?.length ? data.tagIds : undefined,
      });
      createdId = created.id;
      if (draft) deleteDraft.mutate(draft.id);
    } catch {
      // The server's own message shows next to the Create button (mutation.error).
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    let photosFailed = false;
    if (photos.length) {
      try {
        await ticketApi.uploadAttachments(createdId, photos);
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        void invalidateScoreCaches(queryClient);
      } catch {
        photosFailed = true;
      }
    }

    // One toast at the end, with a way straight into the new ticket.
    const open = { label: 'Open', onClick: () => navigate(`/tickets?open=${createdId}`) };
    if (photosFailed) toast.error("Ticket created. The photos didn't upload, open it and add them again.", { action: open });
    else toast.success('Ticket created', { action: open });
    onClose();
  };

  // A failed Create brings the first problem into view and puts the cursor there.
  const onInvalid = (formErrors: FieldErrors<TicketFields>) => {
    haptic('error');
    const first = FIELD_ORDER.find(k => formErrors[k]);
    if (!first) return;
    const anchor = formRef.current?.querySelector<HTMLElement>(`[data-field="${anchorFor(first)}"]`);
    if (!anchor) return;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    anchor.querySelector<HTMLElement>('input:not([type="file"]):not([type="hidden"]), textarea, button')?.focus({ preventScroll: true });
  };

  const handleSaveDraft = async () => {
    const values = getValues();
    try {
      await saveDraft.mutateAsync({ id: draft?.id, title: values.title?.trim() ?? '', payload: values as Record<string, unknown> });
    } catch {
      return;
    }
    haptic('success');
    toast.success(photos.length ? 'Draft saved. Photos are not kept in a draft, add them when you send it.' : 'Draft saved', {
      description: 'Find it under Drafts on the Tickets page.',
    });
    onClose();
  };

  const handleCancel = async () => {
    if (dirty && !(await confirm({
      title: 'Discard changes?',
      description: 'What you entered here will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      variant: 'danger',
    }))) return;
    onClose();
  };

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-2 sm:gap-3">
      {/* The server's reason when Create failed, right beside the button; otherwise what is still missing. */}
      {mutation.isError ? (
        <p role="alert" className="flex items-start gap-1.5 t-meta font-medium font-display text-danger min-w-0">
          <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 break-words">{errorMessage(mutation.error, "Couldn't create the ticket. Try again.")}</span>
        </p>
      ) : (
        <FormProgress control={control} requirePerson={!ownScopeOnly} showOnPhone={submitCount > 0} />
      )}

      {/* Phones: one full-width Create; the X in the header dismisses. Desktop keeps Cancel. */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
        <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={submitting} className="hidden sm:inline-flex font-display">
          Cancel
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleSaveDraft()} isLoading={saveDraft.isPending} disabled={submitting} className="max-sm:h-11 font-display">
          {!saveDraft.isPending && <FileClock size={15} aria-hidden />}
          {draft ? 'Update draft' : 'Save draft'}
        </Button>
        <Button type="submit" form="ticket-form" variant="primary" size="sm" isLoading={submitting} disabled={saveDraft.isPending} className="max-sm:flex-1 max-sm:h-11 font-display">
          {!submitting && <Check size={16} strokeWidth={2.5} />}
          {submitting ? (photos.length ? 'Adding photos…' : 'Creating…') : 'Create ticket'}
        </Button>
      </div>
    </div>
  );

  const categorySummary = selectedCategory && (
    <div className={INFO_BOX_CLASS}>
      <p className="flex items-center gap-1.5 t-meta font-display font-semibold text-text">
        <Route size={14} className="text-text-light" aria-hidden />
        Goes where "{selectedCategory.name}" sends it
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {selectedCategory.departmentId.name ? <DepartmentChip name={selectedCategory.departmentId.name} /> : null}
        {/* Front-line staff don't choose the person, so they aren't shown one either. */}
        {!ownScopeOnly && (selectedCategory.assigneeIds.length > 0 ? (
          <IconChip
            icon={UserCheck}
            tone="bg-success"
            label={`${[selectedCategory.assigneeIds[0].firstName, selectedCategory.assigneeIds[0].lastName].filter(Boolean).join(' ')}${selectedCategory.assigneeIds.length > 1 ? ` +${selectedCategory.assigneeIds.length - 1}` : ''}`}
            title="Person set for this category"
          />
        ) : (
          <IconChip icon={UserCheck} tone="bg-warning" label="Nobody set yet" />
        ))}
        <IconChip icon={Clock} tone="bg-text-muted" label={`Due in ${selectedCategory.tatHours ?? 24} hours`} />
      </div>
      <p className="t-meta font-display text-text-muted">
        {ownScopeOnly
          ? (selectedCategory.assigneeIds.length === 0 ? 'The department head will pick who works on it.' : 'Nothing else to choose.')
          : selectedCategory.assigneeIds.length === 0
            ? (assignmentMode === 'AUTO'
              ? 'Nobody is set for this category yet, so the department head will be asked to pick someone. Switch to Choose myself to pick now.'
              : 'Nobody is set for this category yet. Pick who should handle it below.')
            : assignmentMode === 'AUTO'
              ? 'Nothing else to choose. Switch to Choose myself for a different person.'
              : 'Filled in for you. You can change the person or the due time.'}
      </p>
    </div>
  );

  const dueError = errors.dueDate?.message ?? errors.dueTime?.message ?? errors.startDate?.message;
  const dueField = (
    <div data-field="dueDate">
      <FormField
        label="Due"
        icon={<Clock size={14} className="text-text-light" />}
        required
        hint="Pick a quick option or an exact day and time. Quick options are due at 6 PM."
        error={dueError}
      >
        <DueDateField
          due={due}
          onDueChange={setDue}
          canSetStart={!ownScopeOnly}
          start={start}
          onStartChange={setStart}
          invalid={!!dueError}
        />
      </FormField>
    </div>
  );

  // Category picker, shared by both routes. Front-line staff read it as "What is it about?".
  const categoryField = (label: string, hint: string, required: boolean) => (
    <div data-field="categoryId">
      <FormField
        label={label}
        icon={<Route size={14} className="text-text-light" />}
        required={required}
        optional={!required}
        hint={hint}
        error={errors.categoryId?.message}
      >
        <Combobox
          value={categoryId ?? ''}
          onChange={selectCategory}
          placeholder="Search the list..."
          emptyOptionLabel={required ? 'Choose one' : 'No category'}
          options={(categories ?? []).map(c => ({ value: c.id, label: c.name }))}
          onCreateNew={isVerifier ? () => setCreating('category') : undefined}
          createNewLabel="New category"
          className={`w-full ${FIELD_TRIGGER_CLASS} ${errors.categoryId ? 'border-danger/60' : ''}`}
        />
      </FormField>
    </div>
  );

  const departmentField = (hint: string) => (
    <div data-field="departmentId">
      <FormField
        label="Department"
        icon={<Building2 size={14} className="text-text-light" />}
        required
        hint={hint}
        error={errors.departmentId?.message}
      >
        <Combobox
          value={departmentId ?? ''}
          onChange={v => setValue('departmentId', v, { shouldValidate: validateOnChange, shouldDirty: true })}
          disabled={!ownScopeOnly && !!selectedCategory}
          placeholder="Search departments..."
          emptyOptionLabel="Choose a department"
          options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
          onCreateNew={isVerifier ? () => setCreating('department') : undefined}
          createNewLabel="New department"
          className={`w-full ${FIELD_TRIGGER_CLASS} ${errors.departmentId ? 'border-danger/60' : ''}`}
        />
      </FormField>
    </div>
  );

  const autoDueNote = (
    <div className={`${INFO_BOX_CLASS} flex-row items-center`} role="status">
      <Clock size={16} className="shrink-0 text-text-light" aria-hidden />
      <p className="t-meta font-display text-text-secondary">
        Due in <strong className="font-semibold text-text">{selectedCategory?.tatHours ?? 24} hours</strong>
        {selectedCategory?.tatHours ? ', set by this category.' : '.'}
      </p>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      size="2xl"
      icon={<TicketIcon className="w-5 h-5" />}
      title={draft ? 'Finish draft ticket' : 'New ticket'}
      description={<span className="hidden sm:inline">Describe the problem on the left, then choose where it goes on the right.</span>}
      footer={footer}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // X on phones only, where the footer has just the Create button. Desktop keeps Cancel.
      closeButtonClassName="sm:hidden"
    >
      {/* One column on a phone, in the order to fill it in: 1) what happened, 2) where it goes.
          From lg up the two steps sit side by side, so nothing needs scrolling to find. */}
      <form
        ref={formRef}
        id="ticket-form"
        onSubmit={(e) => handleSubmit(onSubmit, onInvalid)(e)}
        className="grid gap-6 px-5 pb-4 pt-0 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
        noValidate
      >
        {/* Step 1: the problem itself. */}
        <div className="flex flex-col gap-5 min-w-0">
          <StepHeading step={1} title="What happened" subtitle="Tell us the problem. Photos help a lot." />

          <div data-field="title">
            <FormField
              label="Title"
              htmlFor="title"
              icon={<Type size={14} className="text-text-light" />}
              required
              hint="Short and specific: what is wrong and where."
              error={errors.title?.message}
            >
              <Input
                id="title"
                placeholder="e.g. Card machine at counter 2 not printing"
                className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
                {...register('title')}
                // Not on a phone: the keyboard would open at once and cover most of the form.
                autoFocus={autoFocusTitle}
              />
            </FormField>
          </div>

          <div data-field="description">
            <FormField
              label="Description"
              htmlFor="description"
              icon={<AlignLeft size={14} className="text-text-light" />}
              required
              hint="What happened, when it started, and who it affects. Tap the camera to add a photo."
              error={errors.description?.message}
            >
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <TaskDescriptionField
                    id="description"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    rows={5}
                    placeholder="e.g. Since this morning the printer shows an error light and no bills come out. Customers are waiting at the counter."
                    toolbar={<PhotoToolbar onAdd={addPhotos} />}
                    containerClassName={errors.description ? 'border-danger' : 'border-transparent bg-surface-hover/50 focus-within:bg-surface'}
                  >
                    {photos.length > 0 && <StagedFileChips files={photos} onRemove={removePhoto} />}
                  </TaskDescriptionField>
                )}
              />
            </FormField>
          </div>
        </div>

        {/* Step 2: where it goes. A bordered panel on desktop, plain on a phone. */}
        <div className="flex flex-col gap-5 min-w-0 lg:self-start lg:p-4 lg:rounded-lg lg:border lg:border-border/60 lg:bg-surface-hover/30">
          <StepHeading
            step={2}
            title="Where it goes"
            subtitle={ownScopeOnly ? 'Pick what it is about and the rest fills in for you.' : 'Pick a category and the rest fills in for you.'}
          />

          {ownScopeOnly ? (
            assignmentMode === 'AUTO' ? (
              <>
                <div className="flex flex-col gap-1">
                  {categoryField('What is it about?', 'Pick the closest match. It decides which team gets it and when it is due.', true)}
                  <button type="button" onClick={() => sendToDepartment(true)} className={SWITCH_LINK_CLASS}>
                    Not listed? Send to a department
                    <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
                {categorySummary}
                {autoDueNote}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {departmentField('The department head picks who works on it.')}
                  <button type="button" onClick={() => sendToDepartment(false)} className={SWITCH_LINK_CLASS}>
                    Pick from the list instead
                  </button>
                </div>
                {dueField}
              </>
            )
          ) : (
            <>
              <AssignmentModeToggle
                mode={assignmentMode}
                onChange={m => {
                  setValue('assignmentMode', m, { shouldDirty: true });
                  // "By category" means the category decides, so a person picked by hand earlier is put back to the category's.
                  if (m === 'AUTO' && selectedCategory) applyCategory(selectedCategory);
                }}
              />

              {categoryField(
                'Category',
                isVerifier
                  ? 'Sends the ticket to the right team and sets the due time.'
                  : "Sends the ticket to the right team and sets the due time. Can't find yours? Ask an admin to add it.",
                assignmentMode === 'AUTO',
              )}

              {categorySummary}

              {assignmentMode === 'MANUAL' ? (
                <>
                  {departmentField(selectedCategory ? 'Set by the category above.' : 'Which team should handle this?')}

                  <div data-field="assigneeId">
                    <FormField
                      label="Person"
                      icon={<UserCheck size={14} className="text-text-light" />}
                      required
                      hint={departmentId || selectedCategory ? 'Who will work on it.' : 'Choose a department first.'}
                      error={errors.assigneeId?.message}
                    >
                      <AssigneeField
                        single
                        hideLabel
                        selectedIds={assigneeId ? [assigneeId] : []}
                        onChange={ids => setValue('assigneeId', ids[0] ?? '', { shouldValidate: validateOnChange, shouldDirty: true })}
                        users={assigneeChoices}
                        isLoading={isLoadingAssignableUsers}
                        disabled={!departmentId && !selectedCategory}
                      />
                    </FormField>
                  </div>

                  {dueField}
                </>
              ) : (
                autoDueNote
              )}
            </>
          )}

          <FormField
            label="Priority"
            icon={<Flag size={14} className="text-text-light" />}
            hint="Critical is for work that has stopped. Most tickets are Medium."
          >
            <TicketPriorityChipPicker fullWidth value={priority} onChange={v => setValue('priority', v, { shouldDirty: true })} />
          </FormField>

          {/* Labels are for the people who sort and report on tickets, not the person raising one.
              No Reviewers picker: PC and Admin already verify every ticket by default. */}
          {!ownScopeOnly && (
            <LabelsField
              tags={tags ?? []}
              selectedIds={tagIds ?? []}
              onChange={v => setValue('tagIds', v, { shouldDirty: true })}
              canCreate={isVerifier}
            />
          )}
        </div>
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
          onCreated={(created) => setValue('departmentId', created.id, { shouldValidate: true, shouldDirty: true })}
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
  const btn = 'flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-light hover:text-text hover:bg-surface-hover transition-colors cursor-pointer shrink-0';
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
