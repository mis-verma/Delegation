import {useCreateChecklistTemplateMutation,  useDepartmentsQuery } from '../hook';
import { ChecklistTemplateFormUI, type ChecklistTemplateFormPayload } from './ChecklistTemplateFormUi';

export const ChecklistTemplateForm = ({ onClose }: { onClose: () => void }) => {
  const { data: departments = [] } = useDepartmentsQuery();
  const createMutation = useCreateChecklistTemplateMutation();

  const handleSubmit = (payload: ChecklistTemplateFormPayload) => {
    createMutation.mutate(
      {
        name: payload.name.trim(),
        appliesTo: payload.appliesTo,
        departmentId: payload.departmentId || undefined,
        items: payload.items.length ? payload.items : undefined,
      },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <ChecklistTemplateFormUI
      departments={departments}
      isSaving={createMutation.isPending}
      saveError={createMutation.error?.message}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
};