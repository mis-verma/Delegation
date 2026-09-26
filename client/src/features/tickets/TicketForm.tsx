import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ticket as TicketIcon, AlertCircle, Check, Type, AlignLeft, SlidersHorizontal, Camera, Image as ImageIcon } from 'lucide-react';

import { Button, Modal, Input, Combobox } from '../../components';
import { useCreateTicketMutation, useAssignableUsersQuery, useDepartmentsQuery } from './hook';
import { useCategoriesQuery } from '../settings/hook';
import { useTagsQuery } from '../tags/hook';
import { LabelsField } from '../tags/LabelsField';
import { AssigneeField } from '../assignees/AssigneeField';
import { ticketApi } from '../../api/ticket';
import { ticketSchema, type TicketFields } from './form/ticketFormSchema';
import { AssignmentModeToggle } from './form/AssignmentModeToggle';
import { DueDateField } from './form/DueDateField';
import { ReviewersField } from '../reviewers/ReviewersField';
import { TicketPriorityChipPicker } from './form/TicketPriorityChipPicker';
import { TaskDescriptionField } from '../tasks/TaskDescriptionField';
import { StagedFileChips } from '../tasks/StagedFileChips';
import { DETAIL_HEADING_CLASS, CHIP_TRIGGER_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';

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
  const { data: departments } = useDepartmentsQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: tags } = useTagsQuery();
  const mutation = useCreateTicketMutation();
  const queryClient = useQueryClient();

  const [photos, setPhotos] = useState<File[]>([]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
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
    resolver: zodResolver(ticketSchema),
    defaultValues: { priority: 'MEDIUM', assignmentMode: 'MANUAL' },
  });

  const assignmentMode = useWatch({ control, name: 'assignmentMode' });
  const categoryId = useWatch({ control, name: 'categoryId' });
  const departmentId = useWatch({ control, name: 'departmentId' });
  const priority = useWatch({ control, name: 'priority' });
  const assigneeId = useWatch({ control, name: 'assigneeId' });
  const tagIds = useWatch({ control, name: 'tagIds' });
  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useAssignableUsersQuery(departmentId || undefined);

  const selectedCategory = categories?.find(c => c.id === categoryId);

  useEffect(() => {
    if (categoryId) return;
    setValue('assigneeId', '');
  }, [departmentId, categoryId, setValue]);

  useEffect(() => {
    if (!selectedCategory) return;

    setValue('departmentId', selectedCategory.departmentId.id);
    setValue('assigneeId', selectedCategory.assigneeIds[0]?.id ?? '');

    if (selectedCategory.tatHours) {
      const due = new Date(Date.now() + selectedCategory.tatHours * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setValue('dueDate', `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`);
      setValue('dueTime', `${pad(due.getHours())}:${pad(due.getMinutes())}`);
    }
  }, [selectedCategory, setValue]);

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
        reviewerIds: reviewerIds.length ? reviewerIds : undefined,
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
  }, [mutation, photos, queryClient, onClose, selectedCategory, reviewerIds]);

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
      {/* Desktop-only: on a phone the red * on the two labels already says it. */}
      <p className="hidden sm:block text-xs font-medium text-text-light font-display">
        <span className="text-danger">*</span> Title and description are required. Everything else can be added later.
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
      description={<span className="hidden sm:inline">Say what's wrong, then choose who picks it up.</span>}
      footer={footer}
      bodyClassName="p-0 sm:p-0 overflow-y-auto"
      headerClassName="border-b-0"
      footerClassName="border-t-0"
      // X on phones only, where the footer has just the Create button. Desktop keeps Cancel.
      closeButtonClassName="sm:hidden"
    >
      {/* Same layout as the New delegation form: icon labels over Title and Description, then
          one Details row of chips (category, department, priority, assignee, due date). */}
      <form id="ticket-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-4 pb-4 pt-0 sm:p-5" noValidate>
        {/* First, because it decides what the Details row below offers. */}
        <AssignmentModeToggle mode={assignmentMode} onChange={m => setValue('assignmentMode', m)} />

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
          <div className="flex flex-wrap items-center gap-2">
            {/* Picking a category fills in department, assignee and the due date. */}
            <div title="Category">
              <Combobox
                value={categoryId ?? ''}
                onChange={v => setValue('categoryId', v)}
                placeholder="Search categories..."
                emptyOptionLabel="No category"
                options={(categories ?? []).map(c => ({ value: c.id, label: c.name }))}
                className={`${CHIP_TRIGGER_CLASS} max-w-[13rem]`}
              />
            </div>

            <div title="Department">
              <Combobox
                value={departmentId ?? ''}
                onChange={v => setValue('departmentId', v)}
                disabled={!!selectedCategory}
                placeholder="Search departments..."
                emptyOptionLabel="Any department"
                options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
                className={`${CHIP_TRIGGER_CLASS} max-w-[13rem]`}
              />
            </div>

            <TicketPriorityChipPicker value={priority} onChange={v => setValue('priority', v)} />

            <div title="Assignee" className="flex items-center">
              <AssigneeField
                single
                hideLabel
                selectedIds={assigneeId ? [assigneeId] : []}
                onChange={ids => setValue('assigneeId', ids[0] ?? '')}
                users={assignableUsers}
                isLoading={isLoadingAssignableUsers}
                disabled={!!selectedCategory}
              />
            </div>

            {assignmentMode === 'MANUAL' && (
              <div title="Due date">
                <DueDateField
                  mode="MANUAL"
                  hideLabel
                  triggerClassName={CHIP_TRIGGER_CLASS}
                  control={control}
                  setValue={setValue}
                  errors={errors}
                  categoryTatHours={selectedCategory?.tatHours}
                />
              </div>
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
        </div>

        {/* Labels and Reviewers are desktop-only, same as the delegation form: optional extras that
            doubled the form's length on a phone. Reviewers can still be set from the ticket sheet. */}
        <div className="hidden sm:flex flex-col gap-5">
          <LabelsField
            tags={tags ?? []}
            selectedIds={tagIds ?? []}
            onChange={v => setValue('tagIds', v)}
            canCreate={isVerifier}
          />
          <ReviewersField
            departmentId={departmentId || undefined}
            selected={reviewerIds}
            onChange={setReviewerIds}
          />
        </div>

        {mutation.isError && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger font-display flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {mutation.error instanceof Error ? mutation.error.message : "Couldn't create the ticket. Check the fields and try again."}
          </div>
        )}
      </form>
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
  const btn = 'flex items-center justify-center size-8 rounded-lg text-text-light hover:text-primary-600 hover:bg-surface-hover transition-colors cursor-pointer shrink-0';
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
