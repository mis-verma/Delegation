import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../config/db.js"
import { auditLogs, users } from "../../db/schema/core.js"
import { taskAdditionalAssignees, taskStatusUpdates, tasks } from "../../db/schema/task.js"
import { ticketStatusUpdates, tickets } from "../../db/schema/ticket.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"

export type ActivityEntity = "Task" | "Ticket"

export type ActivityKind =
    | "created"
    | "status"
    | "approved"
    | "sent_back"
    | "due_changed"
    | "priority_changed"
    | "reassigned"
    | "progress"
    | "head_approved"
    | "declined"
    | "reopened"
    | "edited"

export type ActivityEvent = {
    id: string
    kind: ActivityKind
    at: string
    actor: { name: string; role: string | null } | null
    from?: string | null
    to?: string | null
    remark?: string | null
    fields?: string[]
}

export type ActivitySummary = {
    status: string
    createdAt: string
    createdBy: string | null
    assignee: string | null
    statusSince: string
    dueAt: string | null
}

export type ActivityFeed = {
    entityType: ActivityEntity
    summary: ActivitySummary
    events: ActivityEvent[]
    truncated: boolean
}

type RemarkRow = {
    by: string
    to: string
    remark: string | null
    at: Date
}

const isHod = (role: string) => role === "MANAGER" || role === "SENIOR"
const MAX_ROWS = 300

type Snapshot = Record<string, unknown>
const asSnapshot = (value: unknown): Snapshot => (value && typeof value === "object" ? (value as Snapshot) : {})
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const iso = (v: unknown) => (typeof v === "string" ? v : v instanceof Date ? v.toISOString() : null)

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
    typeof value === "string"
        ? value
              .toLowerCase()
              .split("_")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
        : null

const DONE = new Set(["done", "CLOSED"])
const SUBMITTED = new Set(["pending_approval", "PENDING_APPROVAL"])

export const activityService = {
    async forEntity(viewer: AccessTokenPayload, entityType: ActivityEntity, entityId: string): Promise<ActivityFeed> {
        const entity = entityType === "Task"
            ? (await db.select({
                id: tasks.id,
                userId: tasks.userId,
                assigneeId: tasks.assigneeId,
                departmentId: tasks.departmentId,
                createdAt: tasks.createdAt,
                status: tasks.status,
                due: tasks.dueDate,
            }).from(tasks).where(and(eq(tasks.id, entityId), isNull(tasks.deletedAt))).limit(1))[0]
            : (await db.select({
                id: tickets.id,
                userId: tickets.userId,
                assigneeId: tickets.assigneeId,
                departmentId: tickets.departmentId,
                createdAt: tickets.createdAt,
                status: tickets.status,
                due: tickets.tatDueAt,
            }).from(tickets).where(and(eq(tickets.id, entityId), isNull(tickets.deletedAt))).limit(1))[0]

        if (!entity) throw AppError.notFound(entityType === "Task" ? "Delegation not found" : "Ticket not found")

        const orgWide = viewer.role === "ADMIN" || viewer.role === "PC"
        let allowed = orgWide || entity.userId === viewer.sub || entity.assigneeId === viewer.sub
            || (isHod(viewer.role) && !!viewer.departmentId && viewer.departmentId === entity.departmentId)

        if (!allowed && entityType === "Task") {
            const [extra] = await db.select({ id: taskAdditionalAssignees.id })
                .from(taskAdditionalAssignees)
                .where(and(eq(taskAdditionalAssignees.taskId, entityId), eq(taskAdditionalAssignees.userId, viewer.sub)))
                .limit(1)
            allowed = !!extra
        }
        if (!allowed) throw AppError.forbidden()

        const [auditRows, remarkRows] = await Promise.all([
            db.select({
                id: auditLogs.id,
                action: auditLogs.action,
                actorId: auditLogs.actorId,
                actorName: auditLogs.actorName,
                before: auditLogs.before,
                after: auditLogs.after,
                createdAt: auditLogs.createdAt,
            }).from(auditLogs).where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
              .orderBy(desc(auditLogs.createdAt)).limit(MAX_ROWS + 1),

            entityType === "Task"
                ? db.select({ by: taskStatusUpdates.changedBy, to: taskStatusUpdates.toStatus, remark: taskStatusUpdates.remark, at: taskStatusUpdates.createdAt })
                    .from(taskStatusUpdates).where(eq(taskStatusUpdates.taskId, entityId))
                : db.select({ by: ticketStatusUpdates.changedBy, to: ticketStatusUpdates.toStatus, remark: ticketStatusUpdates.remark, at: ticketStatusUpdates.createdAt })
                    .from(ticketStatusUpdates).where(eq(ticketStatusUpdates.ticketId, entityId)),
        ])

        const truncated = auditRows.length > MAX_ROWS
        const rows = truncated ? auditRows.slice(0, MAX_ROWS) : auditRows

        const remarkMap = new Map<string, RemarkRow[]>()
        for (const r of remarkRows) {
            const key = `${r.by}:${r.to}`
            const list = remarkMap.get(key)
            if (list) {
                list.push(r)
            } else {
                remarkMap.set(key, [r])
            }
        }

        const remarkFor = (actorId: string, to: unknown, at: Date) =>
            remarkMap.get(`${actorId}:${to}`)?.find((m) => Math.abs(m.at.getTime() - at.getTime()) < 15_000)?.remark ?? null

        const ids = new Set<string>()
        const addStringId = (id: unknown) => { if (typeof id === "string" && id) ids.add(id) }

        addStringId(entity.userId)
        addStringId(entity.assigneeId)

        for (const r of rows) {
            addStringId(r.actorId)
            const b = asSnapshot(r.before), a = asSnapshot(r.after)
            addStringId(b.assigneeId)
            addStringId(a.assigneeId)
        }

        const people = ids.size
            ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role })
                .from(users).where(inArray(users.id, [...ids]))
            : []

        const byId = new Map(people.map((p) => [p.id, { name: `${p.firstName} ${p.lastName ?? ""}`.trim(), role: p.role as string }]))
        const nameOf = (id: unknown) => (typeof id === "string" ? byId.get(id)?.name ?? "Someone who has left" : null)

        const events: ActivityEvent[] = []
        let sawCreate = false

        for (const r of rows) {
            const at = r.createdAt.toISOString()
            const known = byId.get(r.actorId)
            const actor = known ? { name: known.name, role: known.role } : r.actorName ? { name: r.actorName, role: null } : null
            const push = (e: Omit<ActivityEvent, "id" | "at" | "actor">, suffix: string) => events.push({ id: `${r.id}-${suffix}`, at, actor, ...e })
            const b = asSnapshot(r.before), a = asSnapshot(r.after)

            if (r.action === "CREATE") { sawCreate = true; push({ kind: "created" }, "c"); continue }
            if (r.action === "VERIFY" || r.action === "APPROVE") { push({ kind: "approved" }, "v"); continue }
            if (r.action === "REJECT") { push({ kind: "sent_back" }, "r"); continue }
            if (r.action === "DECLINE") { push({ kind: "declined", remark: typeof a.declineReason === "string" ? a.declineReason : null }, "x"); continue }
            if (r.action === "PROGRESS") { push({ kind: "progress", remark: remarkFor(r.actorId, "IN_PROGRESS", r.createdAt) }, "g"); continue }
            if (r.action === "REOPEN") { push({ kind: "reopened" }, "o"); continue }
            if (r.action !== "UPDATE") continue

            if (b.awaitingHeadApproval && !a.awaitingHeadApproval && !a.declinedAt) push({ kind: "head_approved" }, "h")

            if (!same(b.status, a.status) && a.status != null) {
                const from = b.status, to = a.status
                const decided = typeof from === "string" && SUBMITTED.has(from)
                const remark = remarkFor(r.actorId, to, r.createdAt)

                if (decided && typeof to === "string" && DONE.has(to)) push({ kind: "approved", from: statusLabel(from), to: statusLabel(to) }, "s")
                else if (decided) push({ kind: "sent_back", from: statusLabel(from), to: statusLabel(to), remark }, "s")
                else push({ kind: "status", from: statusLabel(from), to: statusLabel(to), remark }, "s")
            }

            const dueKey = entityType === "Task" ? "dueDate" : "tatDueAt"
            if (!same(b[dueKey], a[dueKey])) push({ kind: "due_changed", from: iso(b[dueKey]), to: iso(a[dueKey]) }, "d")
            if (!same(b.priority, a.priority) && a.priority != null) push({ kind: "priority_changed", from: statusLabel(b.priority), to: statusLabel(a.priority) }, "p")
            if (!same(b.assigneeId, a.assigneeId)) push({ kind: "reassigned", from: nameOf(b.assigneeId), to: nameOf(a.assigneeId) }, "a")

            const touched = Object.keys(FIELD_LABEL).filter((k) => !same(b[k], a[k]))
            if (touched.length) push({ kind: "edited", fields: touched.map((k) => FIELD_LABEL[k]) }, "e")
        }

        if (!sawCreate && !truncated) {
            const maker = byId.get(entity.userId)
            events.push({ id: "created", kind: "created", at: entity.createdAt.toISOString(), actor: maker ? { name: maker.name, role: maker.role } : null })
        }

        events.sort((x, y) => y.at.localeCompare(x.at))

        const deduped: ActivityEvent[] = []
        for (const e of events) {
            const isDuplicate = e.kind === "approved" && deduped.some(
                (prev) => prev.kind === "approved"
                    && prev.actor?.name === e.actor?.name
                    && Math.abs(new Date(prev.at).getTime() - new Date(e.at).getTime()) < 5000
            )

            if (!isDuplicate) deduped.push(e)
        }

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