import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiGet, KaryaApiError } from './api.js';
import { config, orgToday } from './config.js';

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: err instanceof Error ? err.message : 'Something went wrong talking to KaryaOS.' }],
});

const limitSchema = z.number().int().min(1).max(config.maxRows).optional().describe(`How many rows to return, at most ${config.maxRows}.`);

const cap = (limit: number | undefined) => Math.min(limit ?? 10, config.maxRows);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'ON_HOLD'] as const;

const counts = (value: unknown) => {
  const source = rec(value);
  return { pending: num(source.pending), delayed: num(source.overdue), new: num(source.newToday), total: num(source.total) };
};

const approvalSource = async (path: string, limit: number) => {
  try {
    const body = rec(await apiGet(path));
    const meta = rec(body.meta);
    const rows = arr(body.data).slice(0, limit).map((row) => {
      const r = rec(row);
      return { id: str(r.id), title: str(r.title), store: str(r.storeName), submittedBy: str(r.submittedBy), waitingSince: str(r.waitingSince) };
    });
    return { total: num(meta.total) || arr(body.data).length, over24Hours: num(meta.over24h), rows };
  } catch (err) {
    if (err instanceof KaryaApiError && (err.status === 403 || err.status === 404)) return { unavailable: 'Your role cannot see this list.' };
    return { unavailable: err instanceof Error ? err.message : 'Could not load this list.' };
  }
};

export const registerTools = (server: McpServer): void => {
  server.registerTool(
    'list_tickets',
    {
      title: 'List tickets',
      description: 'Tickets the signed-in person can see, newest first. Filter by status or only the late ones.',
      inputSchema: {
        status: z.enum(TICKET_STATUSES).optional().describe('Only tickets in this status.'),
        overdue: z.boolean().optional().describe('Only tickets past their due time.'),
        limit: limitSchema,
      },
      annotations: { title: 'List tickets', ...READ_ONLY },
    },
    async ({ status, overdue, limit }) => {
      try {
        const size = cap(limit);
        const body = rec(await apiGet('/tickets', { page: 1, limit: size, status, overdue }));
        const meta = rec(body.meta);
        const tickets = arr(body.data).slice(0, size).map((row) => {
          const t = rec(row);
          return {
            id: str(t.id),
            title: str(t.title),
            status: str(t.status),
            priority: str(t.priority),
            category: str(rec(t.category).name),
            assignee: str(rec(t.assignee).firstName),
            dueAt: str(t.tatDueAt),
            createdAt: str(t.createdAt),
          };
        });
        return ok({ total: num(meta.total) || tickets.length, shown: tickets.length, tickets });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'get_today_numbers',
    {
      title: "Today's numbers",
      description: 'Pending, delayed, new and total counts for delegations, tickets, checklists (today) and, for your own view, to-dos.',
      inputSchema: {
        scope: z.enum(['mine', 'visible']).default('mine').describe('"mine" is only your own work. "visible" is everything your role can see.'),
      },
      annotations: { title: "Today's numbers", ...READ_ONLY },
    },
    async ({ scope }) => {
      try {
        const body = rec(await apiGet('/dashboard/summaries', { scope, today: orgToday() }));
        const data = rec(body.data);
        const checklist = scope === 'visible' ? (data.scopeChecklistToday ?? data.checklistToday) : data.checklistToday;
        return ok({
          scope,
          date: orgToday(),
          delegations: counts(data.tasksKpi),
          tickets: counts(data.ticketsKpi),
          checklistsToday: { ...counts(checklist), completed: num(rec(checklist).completed) },
          ...(scope === 'mine' ? { todos: counts(data.todos) } : {}),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_pending_approvals',
    {
      title: 'Pending approvals',
      description: 'Tickets, delegations and checklists waiting for your approval, oldest first, with how many are over 24 hours.',
      inputSchema: { limit: limitSchema },
      annotations: { title: 'Pending approvals', ...READ_ONLY },
    },
    async ({ limit }) => {
      try {
        const size = cap(limit);
        const [tickets, delegations, checklists] = await Promise.all([
          approvalSource('/tickets/pending-approval', size),
          approvalSource('/tasks/pending-approval', size),
          approvalSource('/checklist-instances/pending-approval-preview', size),
        ]);
        return ok({ tickets, delegations, checklists });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    'list_team_checklists',
    {
      title: 'Team checklists',
      description: 'Checklist runs for the people you manage (everyone for Admin and PC). Includes runs nobody has started.',
      inputSchema: {
        status: z.enum(['pending', 'overdue', 'completed', 'all']).default('pending').describe('Which runs to list.'),
        period: z.enum(['today', 'month']).default('today').describe('Today only, or the whole month so far.'),
        storeId: z.string().min(1).optional().describe('Only one store.'),
        notStartedOnly: z.boolean().optional().describe('Only runs with no question answered yet.'),
        limit: limitSchema,
      },
      annotations: { title: 'Team checklists', ...READ_ONLY },
    },
    async ({ status, period, storeId, notStartedOnly, limit }) => {
      try {
        const size = cap(limit);
        const to = orgToday();
        const from = period === 'today' ? to : `${to.slice(0, 8)}01`;
        const serverStatus = { pending: 'OPEN', overdue: 'OVERDUE', completed: 'COMPLETED', all: undefined }[status];
        const body = rec(await apiGet('/checklist-instances', { page: 1, limit: notStartedOnly ? config.maxRows * 4 : size, status: serverStatus, from, to, storeId }));
        const meta = rec(body.meta);
        const runs = arr(body.data)
          .map((row) => {
            const r = rec(row);
            const items = arr(r.items).map(rec);
            const done = items.filter((i) => i.isDone === true).length;
            return {
              id: str(r.id),
              title: str(r.title),
              storeId: str(r.storeId),
              repeats: str(r.recurrence),
              review: str(r.verificationStatus),
              doneQuestions: done,
              totalQuestions: items.length,
              started: done > 0,
              submittedAt: str(r.submittedAt),
            };
          })
          .filter((run) => !notStartedOnly || !run.started)
          .slice(0, size);
        return ok({ period, status, total: num(meta.total) || runs.length, shown: runs.length, runs });
      } catch (err) {
        return fail(err);
      }
    },
  );
};
