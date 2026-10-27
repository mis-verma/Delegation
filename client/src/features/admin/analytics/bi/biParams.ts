import type { ExplorerParams, ExplorerView } from '../../../../api/scores';
import type { TrailItem } from '../../../scores/scoresDisplay';

export interface BiLevel {
  view: ExplorerView;
  parent: Pick<TrailItem, 'id' | 'kind'> | null;
  ancestorStoreId?: string;
}

export interface BiFilters {
  storeId: string;
  departmentId: string;
}

export const biLevelParams = (win: { from: string; to: string }, filters: BiFilters, level: BiLevel): ExplorerParams => ({
  from: win.from,
  to: win.to,
  view: level.view,
  parentId: level.parent?.id,
  storeId: level.ancestorStoreId || filters.storeId || undefined,
  departmentId: level.view === 'store' || level.parent?.kind === 'person' ? undefined : filters.departmentId || undefined,
});
