export type DefinitionState = 'live' | 'draft' | 'paused';

export const definitionState = (d: { isActive: boolean; assigneeIds: readonly string[] }): DefinitionState =>
  d.isActive ? 'live' : d.assigneeIds.length === 0 ? 'draft' : 'paused';

export const STATE_LABEL: Record<DefinitionState, string> = { live: 'Active', draft: 'Draft', paused: 'Paused' };

export const addPeoplePath = (id: string) => `/admin/scheduled-checklists/builder/${id}?step=assign`;
