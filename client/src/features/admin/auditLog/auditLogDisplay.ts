import {
  TicketCheck, CheckSquare, ClipboardCheck, ClipboardList, ListChecks,
  Contact, Sparkles, Building2, CalendarClock, FolderKanban, Settings,
  Plus, Pencil, Trash2, ShieldCheck, ShieldX, Power, PowerOff, KeyRound,
  Store, CalendarOff, CheckCheck, Camera, ImageIcon, Send, Undo2, RotateCcw, ArrowRightLeft, UserMinus,
  MessageCircle, Bot, UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { AuditEntityType, AuditAction, AuditLog, AuditLogFilter } from '../../../api/auditLogs';
import type { StatusChipStatus, PriorityChipMeta } from '../../../components';
import { PRIORITY_CONFIG } from '../../tickets/ticketDisplay';
import { PRIORITY_MAP } from '../../tasks/taskDisplay';

// Same icon each entity already uses in the main Sidebar/AdminLayout nav, so an "Audit Log" row
// reads as the same concept the rest of the app already taught, not a fresh visual vocabulary.
export const ENTITY_TYPE_CONFIG: Record<AuditEntityType, { label: string; icon: LucideIcon }> = {
  Ticket: { label: 'Ticket', icon: TicketCheck },
  Task: { label: 'Delegation', icon: CheckSquare },
  ChecklistDefinition: { label: 'Recurring Checklist', icon: ClipboardCheck },
  ChecklistTemplate: { label: 'Checklist Template', icon: ListChecks },
  ChecklistInstance: { label: 'Checklist Run', icon: ClipboardList },
  ChecklistInstanceItem: { label: 'Checklist Question', icon: CheckCheck },
  ChecklistInstanceImage: { label: 'Checklist Photo', icon: Camera },
  ChecklistInstanceItemSubmissionImage: { label: 'Answer Photo', icon: ImageIcon },
  User: { label: 'User', icon: Contact },
  Category: { label: 'Category', icon: Sparkles },
  Department: { label: 'Department', icon: Building2 },
  Store: { label: 'Store', icon: Store },
  Holiday: { label: 'Holiday', icon: CalendarOff },
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
  SUBMIT: { label: 'Submitted', icon: Send, tone: 'bg-primary-600' },
  SEND_BACK: { label: 'Sent back', icon: Undo2, tone: 'bg-warning' },
  REOPEN_APPROVAL: { label: 'Reopened approval', icon: RotateCcw, tone: 'bg-warning' },
  REOPEN: { label: 'Reopened', icon: RotateCcw, tone: 'bg-warning' },
  COMPLETE: { label: 'Completed', icon: CheckCheck, tone: 'bg-success' },
  REASSIGN: { label: 'Reassigned', icon: ArrowRightLeft, tone: 'bg-primary-600' },
  OFFBOARD: { label: 'Offboarded', icon: UserMinus, tone: 'bg-danger' },
};

// The verb as it reads inside a sentence ("Ravi Shah <verb> Ticket 'Fix store lights'").
const ACTION_VERB: Record<AuditAction, string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
  VERIFY: 'verified',
  APPROVE: 'approved',
  REJECT: 'rejected',
  ACTIVATE: 'activated',
  DEACTIVATE: 'deactivated',
  PASSWORD_RESET: 'reset the password for',
  SUBMIT: 'submitted',
  SEND_BACK: 'sent back',
  REOPEN_APPROVAL: 'reopened the approval for',
  REOPEN: 'reopened',
  COMPLETE: 'completed',
  REASSIGN: 'reassigned',
  OFFBOARD: 'offboarded',
};

export const actionVerb = (action: string) =>
  ACTION_VERB[action as AuditAction] ?? action.toLowerCase().replace(/_/g, ' ');

// Where a change came from, for the small source chip. 'APP' (a person at a screen) gets no chip:
// it is the normal case, so only the exceptions are worth a label.
export const SOURCE_CONFIG: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle, tone: 'bg-success' },
  SYSTEM: { label: 'Automatic', icon: Bot, tone: 'bg-text-muted' },
  APP: { label: 'App', icon: UserRound, tone: 'bg-primary-600' },
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
  verifiedBy: 'Verified By',
  verificationStatus: 'Approval Status',
  verificationNote: 'Approval Note',
  sentBackItemIds: 'Questions Sent Back',
  submittedAt: 'Submitted At',
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
  verifiedBy: 'users',
  categoryId: 'categories',
  departmentId: 'departments',
  storeId: 'stores',
};

// Every other *Id/*Ids column (ticketId, taskId, checklistDefinitionId, ...) points at an entity
// this diff view has no lookup table for. Showing the full 20+ char id is still noise, so it's
// shortened to a scannable "#a1b2c3d4" instead — same idea as a git short hash.
const isIdLikeKey = (key: string) => key === 'entityId' || key === 'verifiedBy' || /Ids?$/.test(key);
const shortId = (value: string) => `#${value.slice(0, 8)}`;

const resolveId = (key: string, id: unknown, resolvers: AuditIdResolvers | undefined): string | null => {
  if (typeof id !== 'string' || !id) return null;
  const resolverKey = ID_FIELD_RESOLVER[key];
  const name = resolverKey ? resolvers?.[resolverKey]?.get(id) : undefined;
  if (name) return name;
  return isIdLikeKey(key) ? shortId(id) : null;
};

// Matches a raw DB enum verbatim — status/role/priority/category columns all store one of these
// (ON_HOLD, PENDING_APPROVAL, ADMIN, HIGH, ...) and used to render exactly like that: shouting,
// underscored, unmistakably a database value leaking into a page a non-technical reviewer reads.
// Every other status/role/priority display in the app goes through its own *_LABEL map instead —
// this diff view is generic across every module's columns, so it can't know which specific map
// applies, but it doesn't need to: the shape alone (all caps, optional underscores) is enough to
// safely retitle it, and no real remark/title text will ever accidentally match it.
const isShoutingEnum = (value: string): boolean => /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(value);
const humanizeEnum = (value: string) =>
  value.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// The internal "no value" marker diffAuditLog compares against. ActivityTimeline (a shared
// component outside this folder) still tests for this exact character, so it stays as the stored
// value; the Audit Log page swaps it for the word via `displayValue` before anything is drawn.
export const EMPTY_MARK = '—';
export const EMPTY_LABEL = 'Empty';
export const displayValue = (text: string) => (text === EMPTY_MARK ? EMPTY_LABEL : text);

const formatScalar = (value: unknown): string => {
  if (value === null || value === undefined) return EMPTY_MARK;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isIsoDateString(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (typeof value === 'string') return isShoutingEnum(value) ? humanizeEnum(value) : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
};

// Long id arrays (e.g. every tagId ever attached) would otherwise blow out the row — cap what's
// spelled out and summarize the rest, same "+N more" pattern chip collections use elsewhere.
const MAX_LIST_ITEMS = 4;

export const formatDiffValue = (key: string, value: unknown, resolvers?: AuditIdResolvers): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_MARK;
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

// ---------------------------------------------------------------------------------------------
// Sentence building: everything the row needs to read as "Ravi Shah updated Ticket 'Fix lights'".
// ---------------------------------------------------------------------------------------------

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** A short, git-style id for when an entry has no readable name. Never the full cuid. */
export const shortEntityId = (id: string) => `#${id.slice(0, 8)}`;

// Where the name's own link goes, if the thing still has a screen. Deleted things have nowhere to land.
export const entityLink = (log: Pick<AuditLog, 'entityType' | 'entityId' | 'action'>): string | null => {
  if (log.action === 'DELETE') return null;
  const id = encodeURIComponent(log.entityId);
  switch (log.entityType) {
    case 'Ticket': return `/tickets?open=${id}`;
    case 'Task': return `/tasks?open=${id}`;
    case 'ChecklistInstance': return `/checklists/${id}`;
    case 'ChecklistDefinition': return `/admin/scheduled-checklists/${id}`;
    default: return null;
  }
};

export type EntityName = { text: string; isId: boolean };

/**
 * The thing's own name, read from whichever snapshot has one. Users show their full name, Settings
 * shows the names of the options that were changed, and anything without a name falls back to a
 * short id so a row never shows a raw cuid.
 */
export const resolveEntityName = (log: AuditLog, rows: DiffRow[]): EntityName => {
  const snap = log.after ?? log.before ?? {};
  const named = asText(snap.title) ?? asText(snap.name) ?? asText(snap.label) ?? asText(log.entityTitle)
    ?? (log.entityType === 'ChecklistInstanceItem' ? asText(snap.question) ?? asText(snap.text) : null);
  if (named) return { text: named, isId: false };

  const fullName = [asText(snap.firstName), asText(snap.lastName)].filter(Boolean).join(' ');
  if (fullName) return { text: fullName, isId: false };

  const email = asText(snap.email);
  if (email) return { text: email, isId: false };

  if (log.entityType === 'Settings' && rows.length > 0) {
    const labels = rows.slice(0, 3).map((r) => r.label);
    const extra = rows.length - labels.length;
    return { text: `${labels.join(', ')}${extra > 0 ? ` +${extra} more` : ''}`, isId: false };
  }

  return { text: shortEntityId(log.entityId), isId: true };
};

// ---- Status / priority chips: only where the snapshot's value maps cleanly onto a shared chip. ----

const STATUS_CHIP_KEYS = new Set<string>([
  'due', 'overdue', 'on_hold', 'open', 'in_progress', 'in_review', 'pending', 'pending_approval', 'completed', 'closed',
]);

/** A status the shared StatusChip can draw, or null. Only tickets and delegations carry one worth showing. */
export const snapshotStatus = (log: AuditLog): StatusChipStatus | null => {
  if (log.entityType !== 'Ticket' && log.entityType !== 'Task') return null;
  const raw = asText((log.after ?? log.before)?.status);
  const key = raw?.toLowerCase();
  return key && STATUS_CHIP_KEYS.has(key) ? (key as StatusChipStatus) : null;
};

/** Priority look for a ticket or delegation snapshot, or null when it has none or an unknown one. */
export const snapshotPriority = (log: AuditLog): PriorityChipMeta | null => {
  const raw = asText((log.after ?? log.before)?.priority);
  if (!raw) return null;
  if (log.entityType === 'Ticket') return PRIORITY_CONFIG[raw.toUpperCase() as keyof typeof PRIORITY_CONFIG] ?? null;
  if (log.entityType === 'Task') return PRIORITY_MAP[raw.toLowerCase() as keyof typeof PRIORITY_MAP] ?? null;
  return null;
};

// ---- Facts: the few details worth showing for a new (or one-sided) record. ----

// Shown in this order, ahead of any other field. title/name are left out because the headline has them.
const FACT_KEY_ORDER = [
  'status', 'priority', 'assigneeId', 'reviewerIds', 'departmentId', 'storeId', 'categoryId',
  'role', 'email', 'tatDueAt', 'dueDate', 'date', 'verificationStatus',
];
const FACT_SKIP_KEYS = new Set(['title', 'name', 'label', 'firstName', 'lastName']);
const MAX_FACTS = 4;

export type FactRow = { key: string; label: string; value: string };

/** Key details of a record that only has one side (CREATE, or a snapshot with no "after"). */
export const buildFacts = (rows: DiffRow[]): FactRow[] => {
  const valueOf = (r: DiffRow) => (r.after !== EMPTY_MARK ? r.after : r.before);
  const usable = rows.filter((r) => !FACT_SKIP_KEYS.has(r.key));
  const ranked = [...usable].sort((a, b) => {
    const ai = FACT_KEY_ORDER.indexOf(a.key);
    const bi = FACT_KEY_ORDER.indexOf(b.key);
    return (ai === -1 ? FACT_KEY_ORDER.length : ai) - (bi === -1 ? FACT_KEY_ORDER.length : bi);
  });
  return ranked.slice(0, MAX_FACTS).map((r) => ({ key: r.key, label: r.label, value: valueOf(r) }));
};

// ---- Time ----

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const FULL_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const formatClock = (iso: string) => CLOCK_FORMAT.format(new Date(iso));
export const formatFullDateTime = (iso: string) => FULL_FORMAT.format(new Date(iso));

/** "Just now", "12m ago", "2h ago", "3d ago"; empty once it is over a month old (the day heading says enough). */
export const formatRelative = (iso: string, now: number = Date.now()): string => {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days <= 30 ? `${days}d ago` : '';
};

const localDayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Stable key for grouping rows by the viewer's local calendar day. */
export const dayKey = (iso: string) => localDayKey(new Date(iso));

/** "Today", "Yesterday", or "Mon 5 Oct" (with the year when it is not this year). */
export const dayHeading = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  if (localDayKey(date) === localDayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(date) === localDayKey(yesterday)) return 'Yesterday';
  return (date.getFullYear() === now.getFullYear() ? DAY_FORMAT : DAY_YEAR_FORMAT).format(date).replace(',', '');
};

/** How many of the filter panel's controls are set. The section tabs have their own highlight, so they do not count. */
export const countActiveFilters = (filter: AuditLogFilter) =>
  [filter.entityType, filter.action, filter.actorId, filter.source, filter.from || filter.to].filter(Boolean).length;
