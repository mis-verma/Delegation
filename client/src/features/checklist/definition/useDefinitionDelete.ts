import { useConfirm } from '@/components/confirmDialog';
import { useDeleteChecklistDefinitionMutation } from '../hook';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';

export const useDefinitionDelete = (definition: Pick<ChecklistDefinition, 'id' | 'name'>) => {
  const confirm = useConfirm();
  const mutation = useDeleteChecklistDefinitionMutation();
  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${definition.name}"?`,
      description: 'This checklist and every run tied to it will disappear from the app: My Checklists, Compliance, the Dashboard, everywhere.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (ok) mutation.mutate(definition.id);
  };
  return { remove, isDeleting: mutation.isPending };
};
