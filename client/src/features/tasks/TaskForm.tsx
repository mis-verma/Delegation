import { useState } from 'react';
import { haptic } from '../../lib/haptics';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { endOfDay } from './taskDisplay';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckSquare, Check, FileEdit, Type, AlignLeft, Building2, UserCheck, CalendarDays, Flag, AlertCircle } from 'lucide-react';
import { Input, Modal, DateRangePicker, Button, useConfirm } from '../../components';
import type { DateRangeValue } from '../../components';
import { useCreateTaskWithAttachmentsMutation, useAssignableUsersQuery } from './hook';
import { useAssignableUsersQuery as useDepartmentPeopleQuery } from '../tickets/hook';
import { useTagsQuery } from '../tags/hook';
import { LabelsField } from '../tags/LabelsField';
import { TaskDescriptionField } from './TaskDescriptionField';
import { AttachFilesToolbar } from './AttachFilesToolbar';
import { StagedFileChips } from './StagedFileChips';
import { useDepartmentsQuery } from '../tickets/hook';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import type { Task } from '../../api/task';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { TaskPriorityChipPicker } from './TaskPriorityChipPicker';
import { TaskQuickDue } from './form/TaskQuickDue';
import { TaskFormProgress } from './form/TaskFormProgress';
import { FormField, StepHeading } from '../tickets/form/FormField';
import { FIELD_TRIGGER_CLASS } from '../tickets/form/formConstants';
import { FIELD_CARD_CLASS } from './taskFormFieldStyles';
import { errorMessage } from '../../lib/queryHelpers';

const baseSchema = z.object({
  title:        z.string().trim().min(1, 'Title is required'),
  description:  z.string().optional(),
  priority:     z.enum(['low', 'medium', 'high']),
  departmentId: z.string().optional().or(z.literal('')),
});

export type TaskFields = z.infer<typeof baseSchema>;

const ERROR_ID = 'task-form-error';
const DEPARTMENT_FIELD_ID = 'task-form-department';

// The department picker is a Combobox behind a Controller, so react-hook-form can't focus it on its
// own; this brings it into view and focuses its trigger.
const focusDepartmentField = () => {
  const field = document.getElementById(DEPARTMENT_FIELD_ID);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
};

// Quiet, borderless-until-interaction fill instead of a visible box outline at rest — same
// reference as the Create Ticket modal. Only applied while a field has no error: Input's own
// danger border+tint has to win the moment validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';
interface TaskFormProps {
  onClose: () => void;
  onCreated?: (task: Task) => void;
  /** Starts the due date on this day (the Calendar's "New delegation" for the picked day). */
  defaultDueDate?: Date;
}

export const TaskForm = ({ onClose, onCreated, defaultDueDate }: TaskFormProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // Same role test the rest of Delegation uses. Gates the "create a new label" affordance, which
  // is what the server's /tags write routes allow.
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  // Front-line staff send work to a department; a manager (or Admin/PC) picks who does it. Same
  // role set the server already stops from re-assigning once a delegation exists.
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  // A manager almost always delegates inside their own team, so it starts there (still changeable).
  const startsOnOwnDepartment = ownScopeOnly || user?.role === 'MANAGER';
  const mutation = useCreateTaskWithAttachmentsMutation();
  const { data: allAssignable, isLoading: isLoadingAllUsers } = useAssignableUsersQuery();
  const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();
  const { data: tags } = useTagsQuery();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  // Local state rather than a form field: the label set is a list of ids toggled by pills, with
  // nothing for zod to validate beyond what the server already enforces (existing ids, max 12).
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: defaultDueDate ?? null });
  // One due day by default. Managers and up can add a start day too (a span of work); front-line
  // staff only say when it is needed by.
  const [showStart, setShowStart] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // Which footer button triggered the submit — both are type="submit" for the same form, so this
  // is the only way onSubmit (one handler, native form submission) can tell "Create" apart from
  // "Save as Draft" once react-hook-form's validation passes.
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  // Focus the title on a desktop so typing can start at once; a phone's keyboard would cover the form.
  const [autoFocusTitle] = useState(() => !window.matchMedia('(pointer: coarse)').matches);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty, submitCount },
  } = useForm<TaskFields>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      priority: 'medium',
      // Front-line staff and managers start on their own department; everyone else starts with
      // none, so the person picker lists everyone until a department is chosen, and then only that
      // department's people.
      departmentId: startsOnOwnDepartment ? user?.departmentId ?? '' : '',
      description: '',
    },
  });

  // Choosing a department narrows the person picker to that department's people, for every role (front-line
  // staff only see the picker once a department is chosen). With no department it lists everyone allowed.
  const departmentId = useWatch({ control, name: 'departmentId' });
  const { data: departmentPeople, isLoading: isLoadingDepartmentPeople } = useDepartmentPeopleQuery(departmentId || undefined, undefined, undefined, !!departmentId && !ownScopeOnly);
  const assignableUsers = departmentId ? departmentPeople : allAssignable;
  const isLoadingUsers = departmentId ? isLoadingDepartmentPeople : isLoadingAllUsers;
  // A different department means a different set of people: the old pick no longer applies.
  const [prevDepartmentId, setPrevDepartmentId] = useState(departmentId);
  if (departmentId !== prevDepartmentId) {
    setPrevDepartmentId(departmentId);
    setAssigneeIds([]);
  }

  const isBusy = mutation.isPending || isSubmitting;
  // Both footer buttons submit the same form/mutation, so a single shared `isBusy` flipped BOTH
  // buttons into their own busy label/spinner at once — clicking "Save as draft" made "Create"
  // show a spinner too, which read as two operations running (or the wrong one). Only the button
  // that was actually clicked (tracked via `saveAsDraft`, set on click before submit) should show
  // its busy state; the other one just disables, label and icon unchanged.
  const isCreateBusy = isBusy && !saveAsDraft;
  const isDraftBusy = isBusy && saveAsDraft;

  // Anything typed, picked or attached. Closing then asks first (Modal `dirty`).
  const hasInput = isDirty
    || assigneeIds.length > 0
    || tagIds.length > 0
    || files.length > 0
    || dateRange.from !== null
    || (dateRange.to?.getTime() ?? null) !== (defaultDueDate?.getTime() ?? null);

  const cancel = async () => {
    if (hasInput) {
      const ok = await confirm({
        title: 'Discard changes?',
        description: 'What you entered here will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  const onSubmit = (data: TaskFields) => {
    // Front-line staff send work to a department (its manager picks the person), so for them the
    // department is the one routing choice and can't be left empty. A draft can still be saved
    // without one: it goes nowhere until it is published.
    if (ownScopeOnly && !saveAsDraft && !data.departmentId) {
      setError('departmentId', { message: 'Pick the department that should do this' });
      haptic('error');
      focusDepartmentField();
      return;
    }
    mutation.mutate(
      {
        payload: {
          title:                 data.title,
          description:           data.description,
          status:                saveAsDraft ? 'draft' : undefined,
          priority:              data.priority,
          startDate:             dateRange.from ? dateRange.from.toISOString() : undefined,
          dueDate:               dateRange.to ? endOfDay(dateRange.to).toISOString() : undefined,
          assigneeId:            assigneeIds[0],
          additionalAssigneeIds: assigneeIds.slice(1),
          departmentId:          data.departmentId !== '' ? data.departmentId : undefined,
          // Omitted when empty so the request says nothing about labels rather than sending an
          // explicit "clear them" — harmless on create, but it keeps the payload honest and
          // matches how the update path reads the same field.
          tagIds:                tagIds.length ? tagIds : undefined,
        },
        files,
      },
      {
        onSuccess: ({ filesFailed, ...createdTask }) => {
          const isDraft = createdTask.status === 'draft';
          const action = isDraft
            ? { label: 'View drafts', onClick: () => navigate('/tasks/draft') }
            : { label: 'Open', onClick: () => navigate(`/tasks?open=${createdTask.id}`) };
          if (filesFailed) {
            toast.warning("Delegation created, but the files didn't upload. Open it to add them again.", { action });
          } else {
            toast.success(isDraft ? 'Saved as draft' : 'Delegation created', { action });
          }
          onCreated?.(createdTask);
          onClose();
        },
        // The message sits beside the buttons (the hook shows no toast); move focus to it so a
        // screen reader reads it and a phone scrolls it into view.
        onError: () => requestAnimationFrame(() => document.getElementById(ERROR_ID)?.focus()),
      }
    );
  };

  const statusLine = mutation.isError ? (
    <p
      id={ERROR_ID}
      tabIndex={-1}
      role="alert"
      className="flex items-start gap-1.5 t-meta font-display font-medium text-danger outline-none"
    >
      <AlertCircle size={14} className="shrink-0 mt-px" aria-hidden />
      <span>{errorMessage(mutation.error, "Couldn't create the delegation. Try again.")}</span>
    </p>
  ) : (
    /* Lists what is still needed, then what is not set yet. On a phone it waits for the first Create tap. */
    /* No "person not set" nudge for front-line staff: picking one isn't theirs to do. */
    <TaskFormProgress
      control={control}
      hasPerson={ownScopeOnly || assigneeIds.length > 0}
      hasDates={!!dateRange.to}
      needsDepartment={ownScopeOnly}
      attempted={submitCount > 0}
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      dirty={hasInput}
      size="2xl"
      icon={<CheckSquare className="w-5 h-5" />}
      title="New delegation"
      description={<span className="hidden sm:inline">Describe the work on the left, then choose who does it and when it is due on the right.</span>}
      // One scrollbar for the whole body instead of a separate one per pane.
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // X on phones only: there the footer is just Draft + Create, so the X is the one dismiss
      // action. Desktop keeps Cancel instead.
      closeButtonClassName="sm:hidden"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
          <div className="min-w-0 sm:flex-1">{statusLine}</div>

          {/* Phones: Draft + Create split the full width; Cancel is desktop-only there, the X in the
              header dismisses instead. Desktop keeps all three right-aligned at natural width. */}
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={() => void cancel()} disabled={isBusy} className="hidden sm:inline-flex font-display">
              Cancel
            </Button>
            {/* Same form, same validation (still needs a title); tags the submission as a draft before
                onSubmit reads the flag, so a half-filled delegation has somewhere to go. */}
            <Button
              type="submit"
              form="task-form"
              variant="outline"
              size="sm"
              onClick={() => setSaveAsDraft(true)}
              disabled={isBusy}
              isLoading={isDraftBusy}
              className="font-display"
            >
              {!isDraftBusy && <FileEdit size={14} strokeWidth={2.5} />}
              {isDraftBusy ? 'Saving…' : <><span className="sm:hidden">Draft</span><span className="hidden sm:inline">Save as draft</span></>}
            </Button>
            <Button
              type="submit"
              form="task-form"
              variant="primary"
              size="sm"
              onClick={() => setSaveAsDraft(false)}
              disabled={isBusy}
              isLoading={isCreateBusy}
              className="font-display"
            >
              {!isCreateBusy && <Check size={16} strokeWidth={2.5} />}
              {isCreateBusy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      }
    >
      {/* One column on a phone, in the order to fill it in: 1) the work, 2) who and when. From lg up
          the two steps sit side by side, same layout as the New ticket form. */}
      <form
        id="task-form"
        onSubmit={handleSubmit(onSubmit, () => haptic('error'))}
        className="grid gap-6 px-5 pb-4 pt-0 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
        noValidate
        aria-busy={isBusy}
      >
        {/* Step 1: the work itself. */}
        <div className="flex flex-col gap-5 min-w-0">
          <StepHeading step={1} title="What needs to be done" subtitle="Say what the work is. Attach anything that helps." />

          <FormField
            label="Title"
            htmlFor="title"
            icon={<Type size={14} className="text-text-light" />}
            required
            hint="One line that says the job, so it is clear in a list."
            error={errors.title?.message}
          >
            <Input
              id="title"
              placeholder="e.g. Complete the hallmarking audit for the Karol Bagh showroom"
              className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
              containerClassName={FIELD_CARD_CLASS}
              {...register('title')}
              // Not on a phone: the keyboard would open at once and cover most of the form.
              autoFocus={autoFocusTitle}
            />
          </FormField>

          {/* Controller, so a keystroke re-renders this field and not the whole form. */}
          <FormField
            label="Description"
            icon={<AlignLeft size={14} className="text-text-light" />}
            optional
            hint="Context, steps, links and what done looks like. Add files or photos below the text."
          >
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <TaskDescriptionField
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  rows={5}
                  placeholder="e.g. Check every counter's hallmark records against the register, note any gaps, and send the list to the manager by Friday."
                  toolbar={<AttachFilesToolbar onFiles={(list) => setFiles((prev) => [...prev, ...Array.from(list)])} disabled={isBusy} />}
                  containerClassName="border-transparent bg-surface-hover/50 focus-within:bg-surface"
                >
                  {files.length > 0 && (
                    <StagedFileChips files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                  )}
                </TaskDescriptionField>
              )}
            />
          </FormField>
        </div>

        {/* Step 2: who and when. A bordered panel on desktop, plain on a phone. */}
        <div className="flex flex-col gap-5 min-w-0 lg:self-start lg:p-4 lg:rounded-lg lg:border lg:border-border/60 lg:bg-surface-hover/30">
          <StepHeading step={2} title="Who and when" subtitle={ownScopeOnly ? 'Pick the team. Its manager chooses who does it.' : 'Pick the team first, then the people.'} />

          {/* The flow is department first, then the person: the person list shows only that
              department's people, so it stays closed until a department is chosen. */}
          <div id={DEPARTMENT_FIELD_ID}>
            <FormField
              label="Department"
              icon={<Building2 size={14} className="text-text-light" />}
              required={ownScopeOnly}
              optional={!ownScopeOnly}
              hint={ownScopeOnly ? 'Which team should do this? A manager will assign the person.' : 'Pick the team first. The people list then shows only that team.'}
              error={errors.departmentId?.message}
            >
              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <TaskFormDepartmentField
                    hideLabel
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    departments={departments}
                    isLoading={isLoadingDepts}
                    triggerClassName={`w-full ${FIELD_TRIGGER_CLASS}`}
                  />
                )}
              />
            </FormField>
          </div>

          {/* Front-line staff send the work to a department and its head picks the person (the
              server tells the department's Manager/Senior), so they get no person picker. */}
          {!ownScopeOnly && (
            <FormField
              label="Assign to"
              icon={<UserCheck size={14} className="text-text-light" />}
              optional
              hint={departmentId ? 'Pick one or more people. The first one is the main owner.' : 'Choose a department first.'}
            >
              {departmentId ? (
                <AssigneeField
                  hideLabel
                  selectedIds={assigneeIds}
                  onChange={setAssigneeIds}
                  users={assignableUsers}
                  isLoading={isLoadingUsers}
                />
              ) : (
                <span className="inline-flex h-8 w-fit items-center rounded-full border border-border px-3 t-meta font-display text-text-light">
                  Pick a department first
                </span>
              )}
            </FormField>
          )}

          <FormField
            label="Due"
            icon={<CalendarDays size={14} className="text-text-light" />}
            optional
            hint={showStart ? 'Pick the start day and the due day.' : 'Pick a quick due day, or open the calendar.'}
          >
            <TaskQuickDue value={dateRange} onChange={setDateRange} />
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              dueOnly={!showStart}
              // The quick-day chips just above already offer these.
              hidePresets
              placeholder={showStart ? 'Choose start and due day' : 'Choose a due day'}
              // A new delegation cannot be due before today.
              minDate={new Date()}
              triggerClassName={`w-full ${FIELD_TRIGGER_CLASS}`}
            />
            {!ownScopeOnly && (
              <button
                type="button"
                onClick={() => {
                  if (showStart) setDateRange((prev) => ({ from: null, to: prev.to }));
                  setShowStart((v) => !v);
                }}
                className="self-start inline-flex items-center h-8 pointer-coarse:h-11 -ml-1 px-1 rounded-md t-meta font-display font-semibold text-text-secondary hover:text-text transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                {showStart ? 'Remove start day' : 'Add start day'}
              </button>
            )}
          </FormField>

          <FormField
            label="Priority"
            icon={<Flag size={14} className="text-text-light" />}
            hint="High is for work that cannot wait. Most delegations are Medium."
          >
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <TaskPriorityChipPicker value={field.value} onChange={field.onChange} disabled={isBusy} fullWidth />
              )}
            />
          </FormField>

          {/* No Reviewers picker: PC and Admin verify every delegation by default, same as
              Tickets, so naming one was a manual step that changed nothing. */}
          <LabelsField
            tags={tags ?? []}
            selectedIds={tagIds}
            onChange={setTagIds}
            canCreate={isVerifier}
            disabled={isBusy}
          />
        </div>
      </form>
    </Modal>
  );
};
