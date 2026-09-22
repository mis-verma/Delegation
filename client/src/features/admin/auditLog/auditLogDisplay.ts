import {
  TicketCheck, CheckSquare, ClipboardCheck, ClipboardList, ListChecks,
  Contact, Sparkles, Building2, CalendarClock, FolderKanban, Settings,
  Plus, Pencil, Trash2, ShieldCheck, ShieldX, Power, PowerOff, KeyRound,
  type LucideIcon,
} from 'lucide-react';
import type { AuditEntityType, AuditAction } from '../../../api/auditLogs';

// Same icon each entity already uses in the main Sidebar/AdminLayout nav, so an "Audit Log" row
// reads as the same concept the rest of the app already taught, not a fresh visual vocabulary.
export const ENTITY_TYPE_CONFIG: Record<AuditEntityType, { label: string; icon: LucideIcon }> = {
  Ticket: { label: 'Ticket', icon: TicketCheck },
  Task: { label: 'Delegation', icon: CheckSquare },
  ChecklistDefinition: { label: 'Recurring Checklist', icon: ClipboardCheck },
  ChecklistTemplate: { label: 'Checklist Template', icon: ListChecks },
  ChecklistInstance: { label: 'Checklist Run', icon: ClipboardList },
  User: { label: 'User', icon: Contact },
  Category: { label: 'Category', icon: Sparkles },
  Department: { label: 'Department', icon: Building2 },
  Event: { label: 'Event', icon: CalendarClock },
  Project: { label: 'Project', icon: FolderKanban },
  Settings: { label: 'Settings', icon: Settings },
};

// tone = the IconChip icon-circle bg-* class. Same green/blue/red/amber vocabulary StatusChip and
// PriorityChip already use for "good/neutral/bad/caution" everywhere else in the app.
export const ACTION_CONFIG: Record<AuditAction, { label: string; icon: LucideIcon; tone: string }> = {
  CREATE: { label: 'Created', icon: Plus, tone: 'bg-success' },
  UPDATE: { label: 'Updated', icon: Pencil, tone: 'bg-primary-600' },
  DELETE: { label: 'Deleted', icon: Trash2, tone: 'bg-danger' },
  VERIFY: { label: 'Verified', icon: ShieldCheck, tone: 'bg-success' },
  APPROVE: { label: 'Approved', icon: ShieldCheck, tone: 'bg-success' },
  REJECT: { label: 'Rejected', icon: ShieldX, tone: 'bg-danger' },
  ACTIVATE: { label: 'Activated', icon: Power, tone: 'bg-success' },
  DEACTIVATE: { label: 'Deactivated', icon: PowerOff, tone: 'bg-text-muted' },
  PASSWORD_RESET: { label: 'Password reset', icon: KeyRound, tone: 'bg-warning' },
};

// entityType/action are free-form strings on the wire (see server/src/modules/audit), not a real
// enum — a value this page has never seen before (a future module, or a typo'd action) still has
// to render as *something* rather than crash, hence the fallback here instead of a straight index.
export const entityTypeConfig = (entityType: string) =>
  ENTITY_TYPE_CONFIG[entityType as AuditEntityType] ?? { label: entityType, icon: ClipboardList };

export const actionConfig = (action: string) =>
  ACTION_CONFIG[action as AuditAction] ?? { label: action, icon: Pencil, tone: 'bg-text-muted' };

// Raw column names read fine for "tatDueAt" (-> "Tat Due At") but not for the foreign-key columns
// every module has — a QC reviewer shouldn't have to know the schema to read "Tag Ids" as "Labels"
// or "Assignee Id" as "Assignee". Override just the ones that read wrong; everything else still
// falls back to the camelCase splitter below.
const KEY_LABEL_OVERRIDES: Record<string, string> = {
  tagIds: 'Labels',
  reviewerIds: 'Reviewers',
  additionalAssigneeIds: 'Additional Assignees',
  assigneeId: 'Assignee',
  categoryId: 'Category',
  departmentId: 'Department',
  storeId: 'Store',
  ownerId: 'Owner',
  userId: 'User',
  createdById: 'Created By',
  updatedById: 'Updated By',
  verifiedById: 'Verified By',
  approvedById: 'Approved By',
  rejectedById: 'Rejected By',
  reviewedById: 'Reviewed By',
  isActive: 'Active',
  tatDueAt: 'TAT Due',
  tatHours: 'TAT (hours)',
};

// camelCase -> "Title Case", e.g. "tatDueAt" -> "Tat Due At". Good enough for every field name
// this table actually has — a real i18n label map isn't worth it for an admin-only diff view.
export const humanizeKey = (key: string) =>
  KEY_LABEL_OVERRIDES[key] ??
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

const isIsoDateString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);

// id -> display name lookup tables, built once per page load (see useAuditIdResolvers) and handed
// down to every diff so a changed foreign key reads as "Ravi Shah" instead of "v68akuycdhetoep…".
export type AuditIdResolvers = Partial<{
  users: Map<string, string>;
  tags: Map<string, string>;
  departments: Map<string, string>;
  categories: Map<string, string>;
  stores: Map<string, string>;
}>;

// Which lookup table a given field's id(s) resolve against. Covers both a singular fk column
// (assigneeId) and its plural array cousin (reviewerIds) with the same map.
const ID_FIELD_RESOLVER: Record<string, keyof AuditIdResolvers> = {
  tagIds: 'tags',
  reviewerIds: 'users',
  additionalAssigneeIds: 'users',
  assigneeId: 'users',
  ownerId: 'users',
  userId: 'users',
  createdById: 'users',
  updatedById: 'users',
  verifiedById: 'users',
  approvedById: 'users',
  rejectedById: 'users',
  reviewedById: 'users',
  categoryId: 'categories',
  departmentId: 'departments',
  storeId: 'stores',
};

// Every other *Id/*Ids column (ticketId, taskId, checklistDefinitionId, ...) points at an entity
// this diff view has no lookup table for. Showing the full 20+ char id is still noise, so it's
// shortened to a scannable "#a1b2c3d4" instead — same idea as a git short hash.
const isIdLikeKey = (key: string) => key === 'entityId' || /Ids?$/.test(key);
const shortId = (value: string) => `#${value.slice(0, 8)}`;

const resolveId = (key: string, id: unknown, resolvers: AuditIdResolvers | undefined): string | null => {
  if (typeof id !== 'string' || !id) return null;
  const resolverKey = ID_FIELD_RESOLVER[key];
  const name = resolverKey ? resolvers?.[resolverKey]?.get(id) : undefined;
  if (name) return name;
  return isIdLikeKey(key) ? shortId(id) : null;
};

const formatScalar = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isIsoDateString(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
};

// Long id arrays (e.g. every tagId ever attached) would otherwise blow out the row — cap what's
// spelled out and summarize the rest, same "+N more" pattern chip collections use elsewhere.
const MAX_LIST_ITEMS = 4;

export const formatDiffValue = (key: string, value: unknown, resolvers?: AuditIdResolvers): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    const names = value.map((v) => resolveId(key, v, resolvers) ?? formatScalar(v));
    const shown = names.length > MAX_LIST_ITEMS
      ? [...names.slice(0, MAX_LIST_ITEMS), `+${names.length - MAX_LIST_ITEMS} more`]
      : names;
    return shown.join(', ');
  }

  return resolveId(key, value, resolvers) ?? formatScalar(value);
};

export type DiffRow = { key: string; label: string; before: string; after: string };

// Technical/noisy keys every full-row snapshot carries but that never say anything useful about
// "what changed" — always different (updatedAt) or never meaningfully different (id, any *Hash).
const DIFF_SKIP_KEYS = new Set(['id', 'createdAt', 'updatedAt']);

/**
 * Generic before/after diff — works uniformly whether `before`/`after` are full entity row
 * snapshots (most modules) or a small hand-picked subset (User, which deliberately excludes
 * passwordHash etc.) since it only ever looks at whatever keys are actually present. CREATE (no
 * `before`) shows every `after` key as newly-set; DELETE (no `after`) shows every `before` key as
 * removed — both fall out of the same key-union loop for free, no special-casing needed.
 *
 * `resolvers` (see useAuditIdResolvers) turns raw foreign-key ids into names where a lookup table
 * is available; it's optional so the function still degrades gracefully (shortened ids) before
 * those queries have loaded.
 */
export const diffAuditLog = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  resolvers?: AuditIdResolvers,
): DiffRow[] => {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const rows: DiffRow[] = [];

  for (const key of keys) {
    if (DIFF_SKIP_KEYS.has(key) || key.endsWith('Hash')) continue;
    const beforeVal = before?.[key];
    const afterVal = after?.[key];
    if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue;

    const beforeText = formatDiffValue(key, beforeVal, resolvers);
    const afterText = formatDiffValue(key, afterVal, resolvers);
    // A CREATE row's "before" is always missing (null before object) while a not-yet-set column
    // is explicit `null` — different raw values, but both render as "—", so without this check
    // every untouched optional field on every CREATE would show as a confusing "— → —" row.
    if (beforeText === afterText) continue;

    rows.push({ key, label: humanizeKey(key), before: beforeText, after: afterText });
  }

  return rows;
};
