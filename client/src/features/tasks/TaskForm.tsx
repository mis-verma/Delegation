import { useEffect, useState } from 'react';
import { clearKept, readKept, writeKept } from '../../lib/keptForm';
import { haptic } from '../../lib/haptics';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { endOfDay } from './taskDisplay';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckSquare, Check, FileEdit, Type, AlignLeft, Building2, UserCheck, CalendarDays, Flag, AlertCircle, ShieldQuestion, Plus, X } from 'lucide-react';
import { Input, Modal, DateRangePicker, Button, NoticeBanner, useConfirm } from '../../components';
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

const focusDepartmentField = () => {
  const field = document.getElementById(DEPARTMENT_FIELD_ID);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
};

const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';
interface TaskFormProps {
  onClose: () => void;
  onCreated?: (task: Task) => void;
  defaultDueDate?: Date;
}

export const TaskForm = ({ onClose, onCreated, defaultDueDate }: TaskFormProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const startsOnOwnDepartment = ownScopeOnly || user?.role === 'MANAGER';
  const mutation = useCreateTaskWithAttachmentsMutation();
  const { data: allAssignable, isLoading: isLoadingAllUsers } = useAssignableUsersQuery();
  const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();
  const { data: tags } = useTagsQuery();
  const keptKey = `delegation:${user?.id ?? 'anon'}`;
  const [kept] = useState(() => readKept<Partial<TaskFields> & { assigneeIds?: string[]; tagIds?: string[]; from?: string | null; to?: string | null }>(keptKey));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(kept?.assigneeIds ?? []);
  const [tagIds, setTagIds] = useState<string[]>(kept?.tagIds ?? []);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: kept?.from ? new Date(kept.from) : null,
    to: kept?.to ? new Date(kept.to) : defaultDueDate ?? null,
  });
  const [showStart, setShowStart] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [autoFocusTitle] = useState(() => !window.matchMedia('(pointer: coarse)').matches);

  const {
    register,
    handleSubmit,
    control,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, submitCount },
  } = useForm<TaskFields>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      priority: 'medium',
      departmentId: startsOnOwnDepartment ? user?.departmentId ?? '' : '',
      description: '',
      ...(kept ? { title: kept.title, description: kept.description ?? '', priority: kept.priority ?? 'medium', departmentId: kept.departmentId ?? '' } : {}),
    },
  });

  const allValues = useWatch({ control });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (allValues.title?.trim() || allValues.description?.trim()) {
        writeKept(keptKey, {
          title: allValues.title, description: allValues.description, priority: allValues.priority, departmentId: allValues.departmentId,
          assigneeIds, tagIds, from: dateRange.from?.toISOString() ?? null, to: dateRange.to?.toISOString() ?? null,
        });
      } else {
        clearKept(keptKey);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [allValues, assigneeIds, tagIds, dateRange, keptKey]);

  useEffect(() => {
    if (!kept) return;
    toast.info('Brought back what you were typing.', {
      action: {
        label: 'Start over',
        onClick: () => {
          clearKept(keptKey);
          reset({ priority: 'medium', departmentId: startsOnOwnDepartment ? user?.departmentId ?? '' : '', description: '' });
          setAssigneeIds([]);
          setTagIds([]);
          setDateRange({ from: null, to: defaultDueDate ?? null });
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const departmentId = useWatch({ control, name: 'departmentId' });
  const { data: departmentPeople, isLoading: isLoadingDepartmentPeople } = useDepartmentPeopleQuery(departmentId || undefined, undefined, undefined, !!departmentId && !ownScopeOnly);
  const assignableUsers = departmentId ? departmentPeople : allAssignable;
  const isLoadingUsers = departmentId ? isLoadingDepartmentPeople : isLoadingAllUsers;
  const [prevDepartmentId, setPrevDepartmentId] = useState(departmentId);
  if (departmentId !== prevDepartmentId) {
    setPrevDepartmentId(departmentId);
    setAssigneeIds([]);
  }

  const isLeadership = user?.role === 'ADMIN' || user?.role === 'PC';
  const isTargetHead = (user?.role === 'MANAGER' || user?.role === 'SENIOR') && !!departmentId && user.departmentId === departmentId;
  const needsHeadOk = !!departmentId && !isLeadership && !isTargetHead && !saveAsDraft;
  const targetDepartmentName = departments?.find((d) => d.id === departmentId)?.name;

  const isBusy = mutation.isPending || isSubmitting;
  const isCreateBusy = isBusy && !saveAsDraft;
  const isDraftBusy = isBusy && saveAsDraft;

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
    clearKept(keptKey);
    onClose();
  };

  const onSubmit = (data: TaskFields) => {
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
          dueDate:               dateRange.to ? (dateRange.to.getHours() || dateRange.to.getMinutes() ? dateRange.to : endOfDay(dateRange.to)).toISOString() : undefined,
          assigneeId:            assigneeIds[0],
          additionalAssigneeIds: assigneeIds.slice(1),
          departmentId:          data.departmentId !== '' ? data.departmentId : undefined,
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
          clearKept(keptKey);
          onCreated?.(createdTask);
          onClose();
        },
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
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      closeButtonClassName="sm:hidden"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
          <div className="min-w-0 sm:flex-1">{statusLine}</div>

          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={() => void cancel()} disabled={isBusy} className="hidden sm:inline-flex font-display">
              Cancel
            </Button>
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
      <form
        id="task-form"
        onSubmit={handleSubmit(onSubmit, () => haptic('error'))}
        className="grid gap-6 px-5 pb-4 pt-0 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
        noValidate
        aria-busy={isBusy}
      >
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
              placeholder="e.g. Complete the hallmarking audit"
              className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
              containerClassName={FIELD_CARD_CLASS}
              {...register('title')}
              autoFocus={autoFocusTitle}
            />
          </FormField>

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

        <div className="flex flex-col gap-5 min-w-0 lg:self-start lg:p-4 lg:rounded-lg lg:border lg:border-border/60 lg:bg-surface-hover/30">
          <StepHeading step={2} title="Who and when" subtitle={ownScopeOnly ? 'Pick the team. Its manager chooses who does it.' : 'Pick the team first, then the people.'} />

          {needsHeadOk && (
            <NoticeBanner tone="warning" icon={ShieldQuestion}>
              <span className="font-semibold">{targetDepartmentName ? `The ${targetDepartmentName} head approves this first.` : 'The department head approves this first.'}</span> Work starts once they say yes. If they decline, you will see why.
            </NoticeBanner>
          )}

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
              tiles
              showTime
              value={dateRange}
              onChange={setDateRange}
              dueOnly={!showStart}
              hidePresets
              placeholder={showStart ? 'Choose start and due day' : 'Choose a due day'}
              minDate={new Date()}
            />
            {!ownScopeOnly && (
              <button
                type="button"
                onClick={() => {
                  if (showStart) setDateRange((prev) => ({ from: null, to: prev.to }));
                  setShowStart((v) => !v);
                }}
                className="self-start inline-flex items-center gap-1.5 h-8 pointer-coarse:h-11 px-2 rounded-md t-meta font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                {showStart ? <X size={13} strokeWidth={2.5} aria-hidden="true" /> : <Plus size={13} strokeWidth={2.5} aria-hidden="true" />}
                {showStart ? 'Remove start day' : 'Add start day and time'}
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
