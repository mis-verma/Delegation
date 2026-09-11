import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckSquare, CalendarClock, Check } from 'lucide-react';
import { Input, Modal, DateRangePicker, Loader } from '../../components';
import type { DateRangeValue } from '../../components';
import { useCreateTaskWithAttachmentsMutation, useAssignableUsersQuery } from './hook';
import { useTagsQuery } from '../tags/hook';
import { LabelsField } from '../tags/LabelsField';
import { TaskDescriptionField } from './TaskDescriptionField';
import { AttachFilesToolbar } from './AttachFilesToolbar';
import { StagedFileChips } from './StagedFileChips';
import { useDepartmentsQuery } from '../tickets/hook';
import { useAuth } from '../../context/AuthContext';
import type { Task } from '../../api/task';
import { TaskFormDepartmentField } from './TaskFormDepartmentField';
import { AssigneeField } from '../assignees/AssigneeField';
import { TaskFormPrioritySelector } from './TaskFormPrioritySelector';
import { TaskFormErrorBanner } from './TaskFormErrorBanner';
import { FIELD_LABEL_CLASS, FIELD_LABEL_ICON_CLASS, FIELD_CARD_CLASS, SECTION_LABEL_CLASS } from './taskFormFieldStyles';

const taskSchema = z.object({
  title:        z.string().trim().min(1, 'Title is required'),
  description:  z.string().optional(),
  priority:     z.enum(['low', 'medium', 'high']),
  departmentId: z.string().optional().or(z.literal('')),
});

type TaskFields = z.infer<typeof taskSchema>;

interface TaskFormProps {
  onClose: () => void;
  onCreated?: (task: Task) => void;
}

export const TaskForm = ({ onClose, onCreated }: TaskFormProps) => {
  const { user } = useAuth();
  // Same role test the rest of Delegation uses. Gates the "create a new label" affordance, which
  // is what the server's /tags write routes allow.
  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
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

  const onSubmit = (data: TaskFields) => {
    mutation.mutate(
      {
        payload: {
          title:                 data.title,
          description:           data.description,
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
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
          <CheckSquare className="w-5 h-5 text-primary-600" />
        </div>
      }
      title={<span className="text-xl font-semibold text-text">Add new delegation</span>}
      // Says what the two panes are, in the order they're read: what the work is, then who and
      // when. The old copy ("Define objectives, set priorities…") described the act of filling
      // a form rather than telling anyone anything.
      description="Describe the work, then set who owns it and by when."
      // One scrollbar for the whole body instead of a separate one per pane. Two nested scroll
      // areas meant fields below the fold in the sidebar (Department, Labels) were reachable only
      // by scrolling inside a region with no visible affordance — so they read as missing.
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      // No rules under the title or above the buttons: the modal's own edge already separates it
      // from the page, and the panes are plain white, so an internal divider is the only thing
      // adding a line here.
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // No X in the corner: the footer's Cancel is the dismiss action, and two of them in one
      // small dialog is one too many. Escape and the backdrop still close it, so nothing is
      // trapped by removing it.
      showCloseButton={false}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between w-full gap-3">
          {/* Only the title is mandatory, so say so once here instead of leaving people to
              discover it by submitting. */}
          <p className="text-xs font-medium text-text-light">
            <span className="text-danger">*</span> Title is required — everything else can be added later.
          </p>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none transition-all duration-200 ease-in-out cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            {/* "Create", not "Create delegation" — the narrower modal wrapped the longer label
                onto two lines, which made the button taller than Cancel beside it. The icon
                carries the rest of the meaning, and the dialog title already says what's being
                created. `whitespace-nowrap` so it can never wrap again. */}
            <button
              type="submit"
              form="task-form"
              disabled={isBusy}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary-700 hover:bg-primary-800 rounded-lg transition-all duration-200 ease-in-out inline-flex items-center justify-center gap-2 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBusy ? <Loader size="sm" variant="white" /> : <Check size={16} strokeWidth={2.5} />}
              {isBusy ? 'Creating…' : 'Create'}
            </button>
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
        <div className="flex flex-col gap-5 p-5">
          <section className="flex flex-col gap-4">
            <h3 className={SECTION_LABEL_CLASS}>The work</h3>

            <Input
              id="title"
              label={<>Delegation title <span className="text-danger">*</span></>}
              placeholder="e.g. Complete the hallmarking audit for the Karol Bagh showroom"
              error={errors.title?.message}
              className="text-base font-medium py-2.5 border-border focus:border-primary-500 focus:ring-primary-500/20 rounded-lg transition-all duration-200 ease-in-out"
              labelClassName={FIELD_LABEL_CLASS}
              containerClassName={FIELD_CARD_CLASS}
              {...register('title')}
              autoFocus
            />

            {/* Edge-to-edge is gone. Bleeding this to the modal's edges produced two full-width
                rules cutting across the dialog and an unlabelled grey toolbar band under them —
                it read as a seam in the layout, not as a field. It's a normal bordered box again,
                matching the title input above it, and it has a visible label like every other
                field instead of relying on its placeholder to say what it is.

                Controller, so a keystroke re-renders this field and not the whole form. */}
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <TaskDescriptionField
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  rows={4}
                  label="Details"
                  placeholder="Context, constraints, acceptance criteria, links…"
                  toolbar={<AttachFilesToolbar onFiles={(list) => setFiles((prev) => [...prev, ...Array.from(list)])} />}
                >
                  {files.length > 0 && (
                    <StagedFileChips files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                  )}
                </TaskDescriptionField>
              )}
            />
          </section>

          <section className="flex flex-col gap-4">
            <h3 className={SECTION_LABEL_CLASS}>Assignment</h3>

            {/* Two-up from sm. These five are all short controls; stacked one per row they made a
                long ribbon of half-empty lines, and the modal taller than it needs to be. Pairing
                them also puts each label at the same height as its neighbour, which is the "equal
                alignment" the two-pane version could never give. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <AssigneeField
                selectedIds={assigneeIds}
                onChange={setAssigneeIds}
                users={assignableUsers}
                isLoading={isLoadingUsers}
              />

              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <TaskFormPrioritySelector
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isBusy}
                  />
                )}
              />

              <div className={`group/field flex flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
                <label className={FIELD_LABEL_CLASS}>
                  <CalendarClock className={FIELD_LABEL_ICON_CLASS} />
                  Timeline
                </label>
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  placeholder="Start → deadline"
                  triggerClassName="w-full py-2.5 bg-surface border border-border rounded-lg hover:border-border-hover focus:ring-2 focus:ring-primary-500/20 transition-all duration-200 ease-in-out"
                />
              </div>

              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <TaskFormDepartmentField
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    departments={departments}
                    isLoading={isLoadingDepts}
                  />
                )}
              />

              {/* Full width: the label chips and the suggestion dropdown both need the room, and
                  this is the field most likely to hold several values. */}
              <div className="sm:col-span-2">
                <LabelsField
                  tags={tags ?? []}
                  selectedIds={tagIds}
                  onChange={setTagIds}
                  canCreate={isVerifier}
                  disabled={isBusy}
                />
              </div>
            </div>
          </section>

          {mutation.isError && (
            <TaskFormErrorBanner error={mutation.error} fallback="Failed to create task. Please verify your inputs and try again." />
          )}
        </div>
      </form>
    </Modal>
  );
};