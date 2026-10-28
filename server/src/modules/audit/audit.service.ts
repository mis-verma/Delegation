import { db } from "../../config/db.js";
import { auditLogs, users } from "../../db/schema/core.js";
import { tickets } from "../../db/schema/ticket.js";
import { tasks } from "../../db/schema/task.js";
import { checklistInstances } from "../../db/schema/checklistInstance.js";
import { checklistDefinitions } from "../../db/schema/checklistDefinition.js";
import { eq, and, desc, gte, lte, sql, like, inArray, type SQL } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const DEFAULT_PAGE_SIZE = 50

const paginate = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

const buildMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

export const AUDIT_GROUPS = ["checklists", "tickets", "tasks", "people", "settings"] as const
export type AuditGroup = (typeof AUDIT_GROUPS)[number]
const GROUP_CONDITIONS: Record<AuditGroup, SQL> = {
    checklists: like(auditLogs.entityType, "Checklist%"),
    tickets: like(auditLogs.entityType, "Ticket%"),
    tasks: inArray(auditLogs.entityType, ["Task", "Project"]),
    people: inArray(auditLogs.entityType, ["User", "Department", "Store"]),
    settings: inArray(auditLogs.entityType, ["Settings", "Holiday", "DressType", "Category", "Event", "ApprovalCover"]),
}

type AuditParams = {
    entityType : string;
    entityId : string;
    action : string;
    actorId : string;
    before?:unknown;
    after?:unknown;
    source?: string;
}

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const loadEntityTitles = async (rows: { entityType: string; entityId: string }[]) => {
    const idsOf = (type: string) => [...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId))]
    const titles = new Map<string, string>()
    const [instanceIds, definitionIds, ticketIds, taskIds] = [idsOf("ChecklistInstance"), idsOf("ChecklistDefinition"), idsOf("Ticket"), idsOf("Task")]
    await Promise.all([
        instanceIds.length
            ? db.select({ id: checklistInstances.id, title: checklistInstances.title }).from(checklistInstances).where(inArray(checklistInstances.id, instanceIds))
                .then((found) => found.forEach((r) => titles.set(`ChecklistInstance:${r.id}`, r.title)))
            : null,
        definitionIds.length
            ? db.select({ id: checklistDefinitions.id, title: checklistDefinitions.name }).from(checklistDefinitions).where(inArray(checklistDefinitions.id, definitionIds))
                .then((found) => found.forEach((r) => titles.set(`ChecklistDefinition:${r.id}`, r.title)))
            : null,
        ticketIds.length
            ? db.select({ id: tickets.id, title: tickets.title }).from(tickets).where(inArray(tickets.id, ticketIds))
                .then((found) => found.forEach((r) => titles.set(`Ticket:${r.id}`, r.title)))
            : null,
        taskIds.length
            ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds))
                .then((found) => found.forEach((r) => titles.set(`Task:${r.id}`, r.title)))
            : null,
    ])
    return titles
}

export const auditService = {
    async recordInTx(tx : DbTransaction, params : AuditParams){
        const [actor] = await tx.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, params.actorId)).limit(1)
        const actorName = actor ? `${actor.firstName}${actor.lastName ? ` ${actor.lastName}` : ""}` : params.actorId.slice(0, 191)
        await tx.insert(auditLogs).values({
            id: createId(),
            entityType : params.entityType,
            entityId : params.entityId,
            action : params.action,
            actorId : params.actorId,
            actorName,
            source : params.source ?? (actor ? "APP" : "SYSTEM"),
            before : params.before ?? null,
            after : params.after ?? null,
        });
    },

    async record( params : AuditParams ){
        try{
            const [actor] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, params.actorId)).limit(1)
            const actorName = actor ? `${actor.firstName}${actor.lastName ? ` ${actor.lastName}` : ""}` : params.actorId.slice(0, 191)
            await db.insert(auditLogs).values({
                id: createId(),
                entityType : params.entityType,
                entityId : params.entityId,
                action : params.action,
                actorId : params.actorId,
                actorName,
                source : params.source ?? (actor ? "APP" : "SYSTEM"),
                before : params.before ?? null,
                after : params.after ?? null,
            });
        }catch(err){
            console.error("Failed to write audit log", err)
        }
    },

    async list(filters: {
        entityType?: string;
        entityId?: string;
        actorId?: string;
        action?: string;
        group?: AuditGroup;
        source?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }) {
        const conditions: SQL[] = [];
        if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
        if (filters.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
        if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
        if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
        if (filters.source) conditions.push(eq(auditLogs.source, filters.source));
        if (filters.group) conditions.push(GROUP_CONDITIONS[filters.group]);
        if (filters.from) conditions.push(gte(auditLogs.createdAt, new Date(filters.from)));
        if (filters.to) conditions.push(lte(auditLogs.createdAt, new Date(filters.to)));
        const where = conditions.length ? and(...conditions) : undefined;

        const p = paginate(filters.page, filters.limit);

        const [rows, [{ value: total } = { value: 0 }]] = await Promise.all([
            db
                .select({
                    id: auditLogs.id,
                    entityType: auditLogs.entityType,
                    entityId: auditLogs.entityId,
                    action: auditLogs.action,
                    actorId: auditLogs.actorId,
                    actorName: auditLogs.actorName,
                    source: auditLogs.source,
                    before: auditLogs.before,
                    after: auditLogs.after,
                    createdAt: auditLogs.createdAt,
                    updatedAt: auditLogs.updatedAt,
                    actor: {
                        id: users.id,
                        email: users.email,
                        firstName: users.firstName,
                        lastName: users.lastName,
                        role: users.role,
                    },
                })
                .from(auditLogs)
                .leftJoin(users, eq(auditLogs.actorId, users.id))
                .where(where)
                .orderBy(desc(auditLogs.createdAt))
                .limit(p.limit)
                .offset(p.offset),
            db.select({ value: sql<number>`COUNT(*)` }).from(auditLogs).where(where),
        ]);

        const titles = await loadEntityTitles(rows);
        const data = rows.map((r) => ({ ...r, entityTitle: titles.get(`${r.entityType}:${r.entityId}`) ?? null }));
        return { data, meta: buildMeta(p, Number(total)) };
    },
}
