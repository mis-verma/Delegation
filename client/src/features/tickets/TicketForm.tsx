import { useLiveOnlyAttachments } from '../../lib/useLiveOnlyAttachments';
import { LivePhotoTrigger } from '../checklist/instance/LivePhotoTrigger';
import { useForm, useWatch, Controller, type FieldErrors } from 'react-hook-form';
import { haptic } from '../../lib/haptics';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket as TicketIcon, AlertCircle, Check, FileClock, Type, AlignLeft, Building2, Flag, Camera, Image as ImageIcon, Route, Clock, UserCheck, ShieldQuestion } from 'lucide-react';

import { Button, Modal, Input, Combobox, DepartmentChip, IconChip, NoticeBanner, PriorityChip, TagChip } from '../../components';
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
import { hoursUntil, PRIORITY_CONFIG } from './ticketDisplay';
import { TaskDescriptionField } from '../tasks/TaskDescriptionField';
import { StagedFileChips } from '../tasks/StagedFileChips';
import { useAuth } from '../../context/AuthContext';
import { clearKept, readKept, writeKept } from '../../lib/keptForm';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { errorMessage, invalidateScoreCaches } from '../../lib/queryHelpers';
import type { Draft } from '../../api/drafts';
import { useDeleteDraftMutation, useSaveDraftMutation } from '../drafts/hook';

const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';

const INFO_BOX_CLASS = 'flex flex-col gap-2 p-3 rounded-xl border border-border/60 bg-surface-hover/40';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const FIELD_ORDER = ['title', 'description', 'categoryId', 'departmentId', 'assigneeId', 'dueDate', 'dueTime', 'startDate'] as const;
const anchorFor = (field: (typeof FIELD_ORDER)[number]) => (field === 'dueTime' || field === 'startDate' ? 'dueDate' : field);

interface TicketFormProps {
  onClose: () => void;
  defaultDueDate?: Date;
  draft?: Draft;
  prefill?: Partial<TicketFields>;
}

export const TicketForm = ({ onClose, defaultDueDate, draft, prefill }: TicketFormProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const { data: departments } = useDepartmentsQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: tags } = useTagsQuery(!ownScopeOnly);
  const mutation = useCreateTicketMutation();
  const saveDraft = useSaveDraftMutation('TICKET');
  const deleteDraft = useDeleteDraftMutation('TICKET');
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<'category' | 'department' | null>(null);
  const schema = useMemo(() => buildTicketSchema({ requirePerson: !ownScopeOnly }), [ownScopeOnly]);
  const formRef = useRef<HTMLFormElement>(null);

  const [autoFocusTitle] = useState(() => !window.matchMedia('(pointer: coarse)').matches);

  const [photos, setPhotos] = useState<File[]>([]);
  const addPhotos = (files: FileList | null) => {
    if (!files || !files.length) return;
    setPhotos(prev => [...prev, ...Array.from(files)]);
  };
  const removePhoto = (index: number) => setPhotos(prev => prev.filter((_, idx) => idx !== index));

  const keptKey = `ticket:${user?.id ?? 'anon'}`;
  const [kept] = useState(() => (draft || prefill ? null : readKept<Partial<TicketFields>>(keptKey)));

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    reset,
    formState: { errors, isDirty, submitCount },
  } = useForm<TicketFields>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', assignmentMode: ownScopeOnly ? 'AUTO' : 'MANUAL', ...initialDue, ...prefill, ...(kept ?? {}), ...(draft?.payload as Partial<TicketFields> | undefined) },
  });

  const allValues = useWatch({ control });
  useEffect(() => {
    if (draft) return;
    const timer = setTimeout(() => {
      if (allValues.title?.trim() || allValues.description?.trim()) writeKept(keptKey, allValues);
      else clearKept(keptKey);
    }, 400);
    return () => clearTimeout(timer);
  }, [allValues, draft, keptKey]);

  useEffect(() => {
    if (!kept) return;
    toast.info('Brought back what you were typing.', {
      action: { label: 'Start over', onClick: () => { clearKept(keptKey); reset(); } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useAssignableUsersQuery(departmentId || undefined, undefined, undefined, !ownScopeOnly);

  const [justCreated, setJustCreated] = useState<Category | null>(null);
  const selectedCategory = categories?.find(c => c.id === categoryId) ?? (justCreated && justCreated.id === categoryId ? justCreated : undefined);

  const categoryPeople = useMemo<AssignableUser[]>(() => (selectedCategory?.assigneeIds ?? []).map(a => {
    const known = assignableUsers?.find(u => u.id === a.id);
    return known ?? { id: a.id, firstName: a.firstName, lastName: a.lastName, email: a.email, role: 'USER', departmentId: null };
  }), [selectedCategory, assignableUsers]);
  const assigneeChoices = categoryPeople.length ? categoryPeople : assignableUsers;

  const lastDepartmentRef = useRef(departmentId);
  useEffect(() => {
    if (lastDepartmentRef.current === departmentId) return;
    lastDepartmentRef.current = departmentId;
    if (categoryId) return;
    setValue('assigneeId', '');
  }, [departmentId, categoryId, setValue]);

  const autoLabelIds = useRef<string[]>([]);
  const swapCategoryLabels = useCallback((next: string[]) => {
    const kept = (getValues('tagIds') ?? []).filter(id => !autoLabelIds.current.includes(id));
    autoLabelIds.current = next;
    setValue('tagIds', [...new Set([...kept, ...next])], { shouldDirty: true });
  }, [getValues, setValue]);

  const applyCategory = useCallback((category: Category) => {
    const deptId = typeof category.departmentId === 'object' ? category.departmentId.id : String(category.departmentId);
    const opts = { shouldValidate: true, shouldDirty: true };
    swapCategoryLabels((category.tags ?? []).map(t => t.id));
    if (category.priority) setValue('priority', category.priority, opts);
    setValue('categoryId', category.id, opts);
    setValue('departmentId', deptId, opts);
    setValue('assigneeId', category.assigneeIds?.[0]?.id ?? '', opts);
    if (category.tatHours) {
      const due = new Date(Date.now() + category.tatHours * 60 * 60 * 1000);
      setValue('dueDate', toDateInput(due), opts);
      setValue('dueTime', toTimeInput(due), opts);
    }
  }, [setValue, swapCategoryLabels]);

  const selectCategory = (id: string) => {
    const category = categories?.find(c => c.id === id);
    if (category) applyCategory(category);
    else {
      swapCategoryLabels([]);
      setValue('categoryId', id, { shouldValidate: true, shouldDirty: true });
    }
  };

  const sendToDepartment = (yes: boolean) => {
    const opts = { shouldDirty: true };
    swapCategoryLabels([]);
    setValue('assignmentMode', yes ? 'MANUAL' : 'AUTO', opts);
    setValue('categoryId', '', opts);
    setValue('departmentId', '', opts);
    setValue('assigneeId', '', opts);
  };

  const due = dueDate ? new Date(`${dueDate}T${dueTime || '18:00'}`) : null;
  const setDue = (d: Date | null) => {
    const opts = { shouldValidate: validateOnChange, shouldDirty: true };
    setValue('dueDate', d ? toDateInput(d) : '', opts);
    setValue('dueTime', d ? toTimeInput(d) : '', opts);
  };

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
        assigneeId: data.assigneeId || undefined,
        tatHours: tatHours ?? (data.assignmentMode === 'AUTO' ? (selectedCategory?.tatHours ?? 24) : undefined),
        startDate: data.assignmentMode === 'MANUAL' && !ownScopeOnly && data.startDate ? new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00`).toISOString() : undefined,
        tagIds: !ownScopeOnly && data.tagIds?.length ? data.tagIds : undefined,
      });
      createdId = created.id;
      clearKept(keptKey);
      if (draft) deleteDraft.mutate(draft.id);
    } catch {
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

    const open = { label: 'Open', onClick: () => navigate(`/tickets?open=${createdId}`) };
    if (photosFailed) toast.error("Ticket created. The photos didn't upload, open it and add them again.", { action: open });
    else toast.success('Ticket created', { action: open });
    onClose();
  };

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
    clearKept(keptKey);
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
    clearKept(keptKey);
    onClose();
  };

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-2 sm:gap-3">
      {mutation.isError ? (
        <p role="alert" className="flex items-start gap-1.5 t-meta font-medium font-display text-danger min-w-0">
          <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span className="min-w-0 break-words">{errorMessage(mutation.error, "Couldn't create the ticket. Try again.")}</span>
        </p>
      ) : (
        <FormProgress control={control} requirePerson={!ownScopeOnly} showOnPhone={submitCount > 0} />
      )}

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
        {selectedCategory.priority && <PriorityChip meta={PRIORITY_CONFIG[selectedCategory.priority]} />}
        {selectedCategory.tags.map(t => <TagChip key={t.id} tag={t} />)}
      </div>
      <p className="t-meta font-display text-text-muted">
        {ownScopeOnly
          ? (selectedCategory.assigneeIds.length === 0 ? 'The department head will pick who works on it.' : 'Nothing else to choose.')
          : selectedCategory.assigneeIds.length === 0
            ? (assignmentMode === 'AUTO'
              ? 'Nobody is set for this category yet, so the department head will be asked to pick someone. Switch to Manual to pick now.'
              : 'Nobody is set for this category yet. Pick who should handle it below.')
            : assignmentMode === 'AUTO'
              ? 'Nothing else to choose. Switch to Manual for a different person.'
              : 'Filled in for you. You can change the person or the due time.'}
      </p>
    </div>
  );

  const targetDepartmentId = departmentId || (selectedCategory ? (typeof selectedCategory.departmentId === 'object' ? selectedCategory.departmentId.id : String(selectedCategory.departmentId)) : '');
  const isTargetHead = (user?.role === 'MANAGER' || user?.role === 'SENIOR') && user.departmentId === targetDepartmentId;
  const needsHeadOk = !!targetDepartmentId && !isTargetHead;
  const targetDepartmentName = departments?.find((d) => d.id === targetDepartmentId)?.name;

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
          invalid={!!dueError}
        />
      </FormField>
    </div>
  );

  const categoryOptions = useMemo(
    () => (categories ?? [])
      .filter(c => c.isActive || c.id === categoryId)
      .map(c => ({
        value: c.id,
        label: c.name,
        group: c.departmentId?.name || 'No department',
        hint: c.tatHours ? `Due in ${c.tatHours % 24 === 0 ? `${c.tatHours / 24}d` : `${c.tatHours}h`}` : undefined,
      }))
      .sort((a, b) => (a.group === 'No department' ? 1 : b.group === 'No department' ? -1 : a.group.localeCompare(b.group)) || a.label.localeCompare(b.label)),
    [categories, categoryId],
  );

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
          options={categoryOptions}
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
      closeButtonClassName="sm:hidden"
    >
      <form
        ref={formRef}
        id="ticket-form"
        onSubmit={(e) => handleSubmit(onSubmit, onInvalid)(e)}
        className="grid gap-6 px-5 pb-4 pt-0 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
        noValidate
      >
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

        <div className="flex flex-col gap-5 min-w-0 lg:self-start lg:p-4 lg:rounded-lg lg:border lg:border-border/60 lg:bg-surface-hover/30">
          <StepHeading
            step={2}
            title="Where it goes"
            subtitle={ownScopeOnly ? 'Pick what it is about and the rest fills in for you.' : 'Pick a category and the rest fills in for you.'}
          />

          {needsHeadOk && (
            <NoticeBanner tone="warning" icon={ShieldQuestion}>
              <span className="font-semibold">{targetDepartmentName ? `The ${targetDepartmentName} head approves this first.` : 'The department head approves this first.'}</span> Work starts once they say yes. If they decline, you will see why.
            </NoticeBanner>
          )}

          {ownScopeOnly ? (
            <>
              <AssignmentModeToggle frontLine mode={assignmentMode} onChange={(m) => { if (m !== assignmentMode) sendToDepartment(m === 'MANUAL'); }} />
              {assignmentMode === 'AUTO' ? (
                <>
                  {categoryField('What is it about?', 'Pick the closest match. Not listed? Switch to By department.', true)}
                  {categorySummary}
                  {autoDueNote}
                </>
              ) : (
                <>
                  {departmentField('Which team should handle this?')}
                  {dueField}
                </>
              )}
            </>
          ) : (
            <>
              <AssignmentModeToggle
                mode={assignmentMode}
                onChange={m => {
                  setValue('assignmentMode', m, { shouldDirty: true });
                  if (m === 'AUTO' && selectedCategory) applyCategory(selectedCategory);
                  if (m === 'MANUAL') setValue('categoryId', '', { shouldDirty: true });
                }}
              />

              {assignmentMode === 'AUTO' && categoryField(
                'Category',
                isVerifier
                  ? 'Sends the ticket to the right team and sets the due time.'
                  : "Sends the ticket to the right team and sets the due time. Can't find yours? Ask an admin to add it.",
                true,
              )}

              {assignmentMode === 'AUTO' && categorySummary}

              {assignmentMode === 'MANUAL' ? (
                <>
                  {departmentField('Which team should handle this?')}

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

          {!ownScopeOnly && (
            <LabelsField
              tags={tags ?? []}
              selectedIds={tagIds ?? []}
              onChange={v => setValue('tagIds', v, { shouldDirty: true })}
              canCreate={isVerifier}
              lockedIds={selectedCategory?.tags.map(t => t.id)}
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

const PhotoToolbar = ({ onAdd }: { onAdd: (files: FileList | null) => void }) => {
  const liveOnly = useLiveOnlyAttachments();
  const galleryRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onAdd(e.target.files);
    e.target.value = '';
  };
  const btn = 'flex items-center justify-center size-8 pointer-coarse:size-11 rounded-lg text-text-light hover:text-text hover:bg-surface-hover transition-colors cursor-pointer shrink-0';
  return (
    <div className="flex items-center gap-0.5">
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
      <LivePhotoTrigger className={btn} onFiles={onAdd}>
        <Camera size={15} aria-label="Take photo" />
      </LivePhotoTrigger>
      {!liveOnly && <button type="button" title="Add photo from gallery" aria-label="Add photo from gallery" className={btn} onClick={() => galleryRef.current?.click()}>
        <ImageIcon size={15} />
      </button>}
    </div>
  );
};
