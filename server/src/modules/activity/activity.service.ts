import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../config/db.js"
import { auditLogs, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, taskStatusUpdates, tasks } from "../../db/schema/task.js"
import { ticketStatusUpdates, tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"

export type ActivityEntity = "Task" | "Ticket"

export type ActivityKind = "created" | "status" | "approved" | "sent_back" | "due_changed" | "priority_changed" | "reassigned" | "edited"

export type ActivityEvent = {
    id: string
    kind: ActivityKind
    at: string
    actor: { name: string; role: string | null } | null
    /** Before and after for status, due date, priority and assignee (people by name). */
    from?: string | null
    to?: string | null
    /** The reason given with a status move, when one was recorded. */
    remark?: string | null
    /** Names of the fields an "edited" entry touched. Never their values. */
    fields?: string[]
}

export type ActivitySummary = {
    status: string
    createdAt: string
    createdBy: string | null
    assignee: string | null
    /** When it moved into its current status. */
    statusSince: string
    dueAt: string | null
}

export type ActivityFeed = { entityType: ActivityEntity; summary: ActivitySummary; events: ActivityEvent[]; truncated: boolean }

const isHod = (role: string) => role === "MANAGER" || role === "SENIOR"
const MAX_ROWS = 300

type Snapshot = Record<string, unknown>
const asSnapshot = (value: unknown): Snapshot => (value && typeof value === "object" ? (value as Snapshot) : {})
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const iso = (v: unknown) => (typeof v === "string" ? v : v instanceof Date ? v.toISOString() : null)

// Field names a person would recognise. Anything not listed (internal columns, timestamps) is not
// reported at all: an "edited" entry names only these, and never shows what they were changed to.
const FIELD_LABEL: Record<string, string> = {
    title: "title",
    description: "description",
    departmentId: "department",
    categoryId: "category",
    storeId: "store",
    startDate: "start date",
    tagIds: "labels",
    reviewerIds: "reviewers",
    category: "type",
}

const statusLabel = (value: unknown) =>
    typeof value === "string" ? value.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null

const DONE = new Set(["done", "CLOSED"])
const SUBMITTED = new Set(["pending_approval", "PENDING_APPROVAL"])

export const activityService = {
    /**
     * A plain history of one delegation or ticket for the people who work on it: who made it, who moved
     * it, who approved or sent it back, and when the due date, priority or assignee changed. Field
     * contents (descriptions, remarks on other fields, attachments) are never part of it. ADMIN and PC
     * see everything; the creator, the assignee (and extra assignees) and the department head see this
     * feed; anyone else gets a 403.
     */
    async forEntity(viewer: AccessTokenPayload, entityType: ActivityEntity, entityId: string): Promise<ActivityFeed> {
        const entity = entityType === "Task"
            ? (await db.select({ id: tasks.id, userId: tasks.userId, assigneeId: tasks.assigneeId, departmentId: tasks.departmentId, createdAt: tasks.createdAt, status: tasks.status, due: tasks.dueDate })
                .from(tasks).where(and(eq(tasks.id, entityId), isNull(tasks.deletedAt))).limit(1))[0]
            : (await db.select({ id: tickets.id, userId: tickets.userId, assigneeId: tickets.assigneeId, departmentId: tickets.departmentId, createdAt: tickets.createdAt, status: tickets.status, due: tickets.tatDueAt })
                .from(tickets).where(and(eq(tickets.id, entityId), isNull(tickets.deletedAt))).limit(1))[0]
        if (!entity) throw AppError.notFound(entityType === "Task" ? "Delegation not found" : "Ticket not found")

        const orgWide = viewer.role === "ADMIN" || viewer.role === "PC"
        let allowed = orgWide || entity.userId === viewer.sub || entity.assigneeId === viewer.sub
            || (isHod(viewer.role) && !!viewer.departmentId && viewer.departmentId === entity.departmentId)
        if (!allowed && entityType === "Task") {
            const [extra] = await db.select({ id: taskAdditionalAssignees.id }).from(taskAdditionalAssignees)
                .where(and(eq(taskAdditionalAssignees.taskId, entityId), eq(taskAdditionalAssignees.userId, viewer.sub))).limit(1)
            allowed = !!extra
        }
        if (!allowed) throw AppError.forbidden()

        const [auditRows, remarkRows] = await Promise.all([
            db.select({ id: auditLogs.id, action: auditLogs.action, actorId: auditLogs.actorId, actorName: auditLogs.actorName, before: auditLogs.before, after: auditLogs.after, createdAt: auditLogs.createdAt })
                .from(auditLogs).where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId))).orderBy(desc(auditLogs.createdAt)).limit(MAX_ROWS + 1),
            entityType === "Task"
                ? db.select({ by: taskStatusUpdates.changedBy, to: taskStatusUpdates.toStatus, remark: taskStatusUpdates.remark, at: taskStatusUpdates.createdAt }).from(taskStatusUpdates).where(eq(taskStatusUpdates.taskId, entityId))
                : db.select({ by: ticketStatusUpdates.changedBy, to: ticketStatusUpdates.toStatus, remark: ticketStatusUpdates.remark, at: ticketStatusUpdates.createdAt }).from(ticketStatusUpdates).where(eq(ticketStatusUpdates.ticketId, entityId)),
        ])
        const truncated = auditRows.length > MAX_ROWS
        const rows = truncated ? auditRows.slice(0, MAX_ROWS) : auditRows

        // Everyone named anywhere in the feed, looked up once.
        const ids = new Set<string>([entity.userId])
        if (entity.assigneeId) ids.add(entity.assigneeId)
        for (const r of rows) {
            ids.add(r.actorId)
            const b = asSnapshot(r.before), a = asSnapshot(r.after)
            for (const v of [b.assigneeId, a.assigneeId]) if (typeof v === "string") ids.add(v)
        }
        const people = ids.size
            ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(inArray(users.id, [...ids]))
            : []
        const byId = new Map(people.map((p) => [p.id, { name: `${p.firstName} ${p.lastName ?? ""}`.trim(), role: p.role as string }]))
        const nameOf = (id: unknown) => (typeof id === "string" ? byId.get(id)?.name ?? "Someone who has left" : null)

        const events: ActivityEvent[] = []
        let sawCreate = false
        // A remark belongs to the move it was written with: same person, same destination, seconds apart.
        const remarkFor = (actorId: string, to: unknown, at: Date) =>
            remarkRows.find((m) => m.by === actorId && m.to === to && Math.abs(m.at.getTime() - at.getTime()) < 15_000)?.remark ?? null

        for (const r of rows) {
            const at = r.createdAt.toISOString()
            const known = byId.get(r.actorId)
            const actor = known ? { name: known.name, role: known.role } : r.actorName ? { name: r.actorName, role: null } : null
            const push = (e: Omit<ActivityEvent, "id" | "at" | "actor">, suffix: string) => events.push({ id: `${r.id}-${suffix}`, at, actor, ...e })
            const b = asSnapshot(r.before), a = asSnapshot(r.after)

            if (r.action === "CREATE") { sawCreate = true; push({ kind: "created" }, "c"); continue }
            if (r.action === "VERIFY" || r.action === "APPROVE") { push({ kind: "approved" }, "v"); continue }
            if (r.action === "REJECT") { push({ kind: "sent_back" }, "r"); continue }
            if (r.action !== "UPDATE") continue

            if (!same(b.status, a.status) && a.status != null) {
                const from = b.status, to = a.status
                const decided = typeof from === "string" && SUBMITTED.has(from)
                if (decided && typeof to === "string" && DONE.has(to)) push({ kind: "approved", from: statusLabel(from), to: statusLabel(to) }, "s")
                else if (decided) push({ kind: "sent_back", from: statusLabel(from), to: statusLabel(to), remark: remarkFor(r.actorId, to, r.createdAt) }, "s")
                else push({ kind: "status", from: statusLabel(from), to: statusLabel(to), remark: remarkFor(r.actorId, to, r.createdAt) }, "s")
            }
            const dueKey = entityType === "Task" ? "dueDate" : "tatDueAt"
            if (!same(b[dueKey], a[dueKey])) push({ kind: "due_changed", from: iso(b[dueKey]), to: iso(a[dueKey]) }, "d")
            if (!same(b.priority, a.priority) && a.priority != null) push({ kind: "priority_changed", from: statusLabel(b.priority), to: statusLabel(a.priority) }, "p")
            if (!same(b.assigneeId, a.assigneeId)) push({ kind: "reassigned", from: nameOf(b.assigneeId), to: nameOf(a.assigneeId) }, "a")
            const touched = Object.keys(FIELD_LABEL).filter((k) => !same(b[k], a[k]))
            if (touched.length) push({ kind: "edited", fields: touched.map((k) => FIELD_LABEL[k]) }, "e")
        }

        // Older records may have no CREATE row: the record itself still says who made it and when.
        if (!sawCreate && !truncated) {
            const maker = byId.get(entity.userId)
            events.push({ id: "created", kind: "created", at: entity.createdAt.toISOString(), actor: maker ? { name: maker.name, role: maker.role } : null })
        }

        // A review decision can be logged twice (a VERIFY row and the status change it caused): keep one.
        const deduped = events.filter((e, i) => !(e.kind === "approved" && events.findIndex((o, j) => j < i && o.kind === "approved" && o.actor?.name === e.actor?.name && Math.abs(new Date(o.at).getTime() - new Date(e.at).getTime()) < 5000) !== -1))
        deduped.sort((x, y) => y.at.localeCompare(x.at))

        const lastStatus = deduped.find((e) => e.kind === "status" || e.kind === "approved" || e.kind === "sent_back" || e.kind === "created")
        return {
            entityType,
            truncated,
            events: deduped,
            summary: {
                status: String(entity.status),
                createdAt: entity.createdAt.toISOString(),
                createdBy: nameOf(entity.userId),
                assignee: nameOf(entity.assigneeId),
                statusSince: lastStatus?.at ?? entity.createdAt.toISOString(),
                dueAt: entity.due ? entity.due.toISOString() : null,
            },
        }
    },
}
