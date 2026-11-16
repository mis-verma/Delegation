import { memo, type ComponentType, type ReactElement } from 'react';
import { Skeleton } from '../../components';
import { TableSkeleton } from '../../components/dataTable';
import type { LeaveView, LeaveViewProps } from './leaveDisplay';
import { LeaveCards } from './LeaveCards';
import { LeaveRows } from './LeaveRows';
import { LeaveTable } from './LeaveTable';

const LIST_GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3';

const VIEW_COMPONENTS: Record<LeaveView, ComponentType<LeaveViewProps>> = {
  cards: LeaveCards,
  list: LeaveRows,
  table: LeaveTable,
};

const SKELETONS: Record<LeaveView, () => ReactElement> = {
  cards: () => (
    <div className={LIST_GRID}>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
    </div>
  ),
  list: () => (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
    </div>
  ),
  table: () => <TableSkeleton rows={6} label="Loading leave" />,
};

export const LeaveViews = memo(({ view, ...props }: LeaveViewProps & { view: LeaveView }) => {
  const Active = VIEW_COMPONENTS[view];
  return <Active {...props} />;
});
LeaveViews.displayName = 'LeaveViews';

export const LeaveListSkeleton = ({ view }: { view: LeaveView }) => {
  const Active = SKELETONS[view];
  return <Active />;
};
