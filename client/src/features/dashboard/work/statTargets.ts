import { MODULE_STATS_SCHEMA, STAT_ROUTES, VIEWER, type ApprovalParam, type ModuleKey, type RouteQuery, type StatusKey } from './statsConfig';

export type { ApprovalParam };

export type StatScopeKey = 'mine' | 'visible';

export interface StatTargetContext {
  scope: StatScopeKey;
  team?: boolean;
  userId?: string;
  routeOverride?: string;
}

const EMPTY: RouteQuery = {};

const withStatus = (params: URLSearchParams, query: RouteQuery, status: StatusKey) => {
  const value = query.status?.values[status];
  if (query.status && value) params.set(query.status.name, value);
};

const withSub = (params: URLSearchParams, query: RouteQuery, sub: ApprovalParam | undefined) => {
  const value = sub ? query.sub?.values[sub] : undefined;
  if (query.sub && value) params.set(query.sub.name, value);
};

const withSolo = (params: URLSearchParams, query: RouteQuery, ctx: StatTargetContext) => {
  const value = query.solo?.value === VIEWER ? ctx.userId : query.solo?.value;
  if (query.solo && !ctx.team && value) params.set(query.solo.name, value);
};

export const buildModuleRoute = (module: ModuleKey, status: StatusKey, subParam: ApprovalParam | undefined, ctx: StatTargetContext): string => {
  const schema = MODULE_STATS_SCHEMA[module];
  const target = ctx.routeOverride ?? (ctx.team ? schema.teamRoute : undefined) ?? schema.route;
  const [path = schema.route, existing = ''] = target.split('?');
  const query = schema.routes[path] ?? EMPTY;
  const params = new URLSearchParams(existing);
  withStatus(params, query, status);
  withSub(params, query, subParam);
  withSolo(params, query, ctx);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

export const buildWorkRoute = (status: StatusKey, scope: StatScopeKey): string =>
  `${STAT_ROUTES.work}?${new URLSearchParams({ metric: status, scope }).toString()}`;
