import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckSquare, Check, FileEdit, Type, AlignLeft, SlidersHorizontal } from 'lucide-react';
import { Input, Modal, DateRangePicker, Button } from '../../components';
import type { DateRangeValue } from '../../components';
import { useCreateTaskWithAttachmentsMutation, useAssignableUsersQuery } from './hook';
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
import { TaskFormErrorBanner } from './TaskFormErrorBanner';
import { FIELD_CARD_CLASS, DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from './taskFormFieldStyles';

const taskSchema = z.object({
  title:        z.string().trim().min(1, 'Title is required'),
  description:  z.string().optional(),
  priority:     z.enum(['low', 'medium', 'high']),
  departmentId: z.string().optional().or(z.literal('')),
});

type TaskFields = z.infer<typeof taskSchema>;

// Quiet, borderless-until-interaction fill instead of a visible box outline at rest — same
// reference as the Create Ticket modal. Only applied while a field has no error: Input's own
// danger border+tint has to win the moment validation fails.
const QUIET_FIELD_CLASS = 'font-display border-transparent bg-surface-hover/50 hover:bg-surface-hover focus:bg-surface';
interface TaskFormProps {
  onClose: () => void;
  onCreated?: (task: Task) => void;
}

export const TaskForm = ({ onClose, onCreated }: TaskFormProps) => {
  const { user } = useAuth();
  // Same role test the rest of Delegation uses. Gates the "create a new label" affordance, which
  // is what the server's /tags write routes allow.
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  // Front-line staff send work to a department; a manager (or Admin/PC) picks who does it. Same
  // role set the server already stops from re-assigning once a delegation exists.
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const mutation = useCreateTaskWithAttachmentsMutation();
  const { data: assignableUsers, isLoading: isLoadingUsers } = useAssignableUsersQuery();
  const { data: departments, isLoading: isLoadingDepts } = useDepartmentsQuery();
  const { data: tags } = useTagsQuery();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  // Local state rather than a form field: the label set is a list of ids toggled by pills, with
  // nothing for zod to validate beyond what the server already enforces (existing ids, max 12).
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: null });
  const [files, setFiles] = useState<File[]>([]);
  // Which footer button triggered the submit — both are type="submit" for the same form, so this
  // is the only way onSubmit (one handler, native form submission) can tell "Create" apart from
  // "Save as Draft" once react-hook-form's validation passes.
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TaskFields>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      priority: 'medium',
      departmentId: user?.departmentId ?? '',
      description: '',
    },
  });

  const isBusy = mutation.isPending || isSubmitting;
  // Both footer buttons submit the same form/mutation, so a single shared `isBusy` flipped BOTH
  // buttons into their own busy label/spinner at once — clicking "Save as draft" made "Create"
  // show a spinner too, which read as two operations running (or the wrong one). Only the button
  // that was actually clicked (tracked via `saveAsDraft`, set on click before submit) should show
  // its busy state; the other one just disables, label and icon unchanged.
  const isCreateBusy = isBusy && !saveAsDraft;
  const isDraftBusy = isBusy && saveAsDraft;

  const onSubmit = (data: TaskFields) => {
    mutation.mutate(
      {
        payload: {
          title:                 data.title,
          description:           data.description,
          status:                saveAsDraft ? 'draft' : undefined,
          priority:              data.priority,
          startDate:             dateRange.from ? dateRange.from.toISOString() : undefined,
          dueDate:               dateRange.to ? dateRange.to.toISOString() : undefined,
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
        onSuccess: (createdTask) => {
          onCreated?.(createdTask);
          onClose();
        },
      }
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      // xl (max-w-2xl), down from 3xl (max-w-5xl). A single column doesn't want 1024px of width:
      // the title input becomes a 900px-wide line for a one-line sentence, which is both harder
      // to read and further from the label than it should be.
      size="xl"
      // Was a fully pre-built rounded-full circle in a hardcoded, dark-mode-unaware bg-primary-100
      // — Modal.tsx already wraps `icon` in its own size-10 rounded-xl tinted tile (see
      // ICON_TONE_CLASS), so this was two tinted boxes nested inside each other, of two different
      // shapes. Every other form (Ticket/Event/Category/Store/User/Department) just passes the
      // bare icon and lets Modal's own tile do the work — matching that here instead.
      icon={<CheckSquare className="w-5 h-5" />}
      title="Add new delegation"
      // Says what the two panes are, in the order they're read: what the work is, then who and
      // when. The old copy ("Define objectives, set priorities…") described the act of filling
      // a form rather than telling anyone anything.
      // Desktop-only: on a phone this sentence cost two lines of an already-tight sheet.
      description={<span className="hidden sm:inline">{ownScopeOnly ? 'Describe the work and pick a department. A manager will assign it.' : 'Describe the work, then set who owns it and by when.'}</span>}
      // One scrollbar for the whole body instead of a separate one per pane. Two nested scroll
      // areas meant fields below the fold in the sidebar (Department, Labels) were reachable only
      // by scrolling inside a region with no visible affordance — so they read as missing.
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      // No rules under the title or above the buttons: the modal's own edge already separates it
      // from the page, and the panes are plain white, so an internal divider is the only thing
      // adding a line here.
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // X on phones only: there the footer is just Draft + Create, so the X is the one dismiss
      // action. Desktop keeps Cancel instead — two dismiss controls in one dialog is one too many.
      closeButtonClassName="sm:hidden"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-3">
          {/* Only the title is mandatory, so say so once here instead of leaving people to
              discover it by submitting. */}
          {/* Desktop-only — the red * on the title label already says it on a phone. */}
          <p className="hidden sm:block text-xs font-medium text-text-light">
            <span className="text-danger">*</span> Only the title is required. Add the rest now or later.
          </p>

          {/* Three hand-rolled <button>s with their own duplicated Tailwind soup — missing the
              font-display class every other form's footer buttons carry, missing the press-feedback
              (active:scale) the shared Button already gives every other button in the app, and
              "Cancel"/"Save as draft" looked identical (nothing set them apart in emphasis).
              Button's own outline/secondary/primary variants already express exactly that
              hierarchy, and isLoading already swaps in the spinner — no need to hand-roll either. */}
          {/* Phones: Draft + Create split the full width; Cancel is desktop-only there, the ✕ in the
              header dismisses instead. Desktop keeps all three right-aligned at natural width. */}
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isBusy} className="hidden sm:inline-flex font-display">
              Cancel
            </Button>
            {/* Same form, same validation (still needs a title) — just tags the submission as a
                draft before onSubmit reads the flag, so a half-filled-out delegation has somewhere
                to go besides "finish it now or lose it". */}
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
            {/* "Create", not "Create delegation" — the narrower modal wrapped the longer label
                onto two lines, which made the button taller than Cancel beside it. The icon
                carries the rest of the meaning, and the dialog title already says what's being
                created. */}
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
        onSubmit={handleSubmit(onSubmit)}
        // Single column, not the two panes this used to be. A flex row is as tall as its tallest
        // child, and the two sides hold two fields and five — so the short side ended in a large
        // empty rectangle, and no amount of matching padding could even them up. One column has
        // no tall side, so every field is the same width and nothing is left over.
        className="flex flex-col w-full"
        noValidate
        aria-busy={isBusy}
      >
        {/* Same layout and design language as the delegation detail sheet: Title and Description
            with the shared icon labels, then one Details row of chips (assignee, priority, dates,
            department) using the same chip pickers the detail sheet uses. It was a grid of boxed
            fields with mixed label styles and an "L / M / H" priority toggle. */}
        {/* No top padding on phones: the dialog already puts a 20px gap between header and body,
            and adding 16px on top of it left a hole under the title. */}
        <div className="flex flex-col gap-5 px-4 pb-4 pt-0 sm:p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className={DETAIL_HEADING_CLASS}>
              <Type size={14} className="text-text-light" />
              Title <span className="text-danger">*</span>
            </label>
            <Input
              id="title"
              placeholder="e.g. Complete the hallmarking audit for the Karol Bagh showroom"
              error={errors.title?.message}
              className={errors.title ? 'font-display' : QUIET_FIELD_CLASS}
              containerClassName={FIELD_CARD_CLASS}
              {...register('title')}
              autoFocus
            />
          </div>

          {/* Controller, so a keystroke re-renders this field and not the whole form. */}
          <div className="flex flex-col gap-1.5">
            <span className={DETAIL_HEADING_CLASS}>
              <AlignLeft size={14} className="text-text-light" />
              Description
            </span>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <TaskDescriptionField
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  rows={4}
                  placeholder="Context, constraints, acceptance criteria, links…"
                  toolbar={<AttachFilesToolbar onFiles={(list) => setFiles((prev) => [...prev, ...Array.from(list)])} />}
                  containerClassName="border-transparent bg-surface-hover/50 focus-within:bg-surface"
                >
                  {files.length > 0 && (
                    <StagedFileChips files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                  )}
                </TaskDescriptionField>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={DETAIL_HEADING_CLASS}>
              <SlidersHorizontal size={14} className="text-text-light" />
              Details
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {!ownScopeOnly && (
                <div title="Assignees" className="flex items-center">
                  <AssigneeField
                    hideLabel
                    selectedIds={assigneeIds}
                    onChange={setAssigneeIds}
                    users={assignableUsers}
                    isLoading={isLoadingUsers}
                  />
                </div>
              )}

              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <TaskPriorityChipPicker value={field.value} onChange={field.onChange} disabled={isBusy} />
                )}
              />

              <div title="Timeline">
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  placeholder="Add dates"
                  triggerClassName={CHIP_TRIGGER_CLASS}
                />
              </div>

              <div title="Department">
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
                      triggerClassName={`${CHIP_TRIGGER_CLASS} max-w-[13rem]`}
                    />
                  )}
                />
              </div>
            </div>
          </div>

          {/* No Reviewers picker: PC and Admin verify every delegation by default, same as
              Tickets, so naming one was a manual step that changed nothing. */}
          <LabelsField
            tags={tags ?? []}
            selectedIds={tagIds}
            onChange={setTagIds}
            canCreate={isVerifier}
            disabled={isBusy}
          />

          {mutation.isError && (
            <TaskFormErrorBanner error={mutation.error} fallback="Failed to create task. Please verify your inputs and try again." />
          )}
        </div>
      </form>
    </Modal>
  );
};