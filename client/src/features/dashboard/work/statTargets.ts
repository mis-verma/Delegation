import type { WorkKind, WorkMetric } from '../../../api/dashboard';
import { moduleListHref, workListHref, type WorkScope } from './workMetrics';
import { APPROVAL_PARAMS, QUEUE_PARAM, STAT_ROUTES, type ApprovalParam } from './statsConfig';

export type StatModule = WorkKind | 'approvals' | 'work';

export interface StatTargetContext {
  scope: WorkScope;
  team?: boolean;
  userId?: string;
  approvalsBase?: string;
}

const QUEUE_TAB = Object.fromEntries(APPROVAL_PARAMS.map((a) => [a.key, a.queueTab])) as Record<ApprovalParam, string>;

export type { ApprovalParam };

const approvalsHref = (status: WorkMetric, param: ApprovalParam | undefined, base: string | undefined): string => {
  const target = base ?? STAT_ROUTES.approvalQueue;
  const [path = STAT_ROUTES.approvalQueue, existing = ''] = target.split('?');
  const params = new URLSearchParams(existing);
  if (path === STAT_ROUTES.approvalQueue) {
    if (param) params.set(QUEUE_PARAM.tab, QUEUE_TAB[param]);
    if (status === 'delayed') params.set(QUEUE_PARAM.age, QUEUE_PARAM.olderThanDay);
  } else if (param === 'checklist') {
    params.set(QUEUE_PARAM.tab, QUEUE_TAB.checklist);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

export const getStatTargetUrl = (module: StatModule, status: WorkMetric, subParam: ApprovalParam | undefined, ctx: StatTargetContext): string => {
  if (module === 'work') return workListHref(status, ctx.scope);
  if (module === 'approvals') return approvalsHref(status, subParam, ctx.approvalsBase);
  return moduleListHref(module, status, ctx.team === true, ctx.userId);
};
