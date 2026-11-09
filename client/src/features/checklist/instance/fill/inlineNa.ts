import type { ChecklistInstanceItem } from '../../../../api/checklistInstances';

export const hasInlineNa = (item: Pick<ChecklistInstanceItem, 'itemType'>) => item.itemType === 'YES_NO' || item.itemType === 'PASS_FAIL';
