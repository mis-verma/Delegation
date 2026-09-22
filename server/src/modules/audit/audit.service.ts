import { db } from "../../config/db.js";
import { auditLogs, users } from "../../db/schema/core.js";
import { eq, and, desc, gte, lte, sql, type SQL } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const DEFAULT_PAGE_SIZE = 50

// Same clamp-and-offset helper as checklistInstance.service.ts's own paginate() — kept local
// rather than shared since neither module reads the other and there's no third caller yet to
// justify pulling this into a shared util.
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

// The audit service is the "write it down" part of our compliance trail.
// Whenever something important happens (a Ticket is created/updated/deleted, a User's role changes, etc.)
// other parts of the app call auditService.record(...) to save a snapshot of what changed and who did it.
// This is valuable because later, if something looks wrong, an admin can look at the audit log and see
// exactly who changed a record, when, and what the data looked like before and after - accountability + debugging.
export const auditService = {
    // Records one audit log entry describing a single change to a single entity.
    async record( params : {
        entityType : string; // e.g. "Ticket", "User" - what kind of thing changed
        entityId : string; // the id of the specific record that changed
        action : string; // e.g. "CREATE", "UPDATE", "DELETE" - what kind of change happened
        actorId : string; // the id of the user who made the change (for accountability - "who did this?")
        before?:unknown; // a snapshot of the data before the change (optional, e.g. not applicable on CREATE)
        after?:unknown; // a snapshot of the data after the change (optional, e.g. not applicable on DELETE)
    }){
        try{
            // AuditLog.id is a client-generated cuid (see src/db/schema/core.ts) — generate it
            // up front, matching the convention used everywhere else in the migration.
            // save a new AuditLog row with all the details of this change
            await db.insert(auditLogs).values({
                id: createId(),
                entityType : params.entityType,
                entityId : params.entityId,
                action : params.action,
                actorId : params.actorId,
                before : params.before ?? null, // if no "before" was given, store null instead of undefined
                after : params.after ?? null, // if no "after" was given, store null instead of undefined
            });
        }catch(err){
            // We deliberately swallow (catch) the error here instead of throwing it.
            // Why? Writing an audit log is a side effect - if it fails, we don't want it to block or
            // crash the main action (e.g. creating a ticket) just because logging failed.
            // We still log the error to the console so a developer can notice it.
            console.error("Failed to write audit log", err)
        }
    },

    // Fetches audit history, newest first, filtered by whichever of these were actually passed —
    // "show me everything that ever happened to Ticket #123" (entityType+entityId), "everything
    // Priya did last week" (actorId+from+to), or "every REJECT, anywhere" (action alone). All
    // optional, so the same method also serves the admin-wide Audit Log browser with no filters
    // at all — one query builder instead of a narrow single-entity method plus a separate list one.
    async list(filters: {
        entityType?: string;
        entityId?: string;
        actorId?: string;
        action?: string;
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
        if (filters.from) conditions.push(gte(auditLogs.createdAt, new Date(filters.from)));
        if (filters.to) conditions.push(lte(auditLogs.createdAt, new Date(filters.to)));
        const where = conditions.length ? and(...conditions) : undefined;

        const p = paginate(filters.page, filters.limit);

        const [rows, [{ value: total }]] = await Promise.all([
            // AuditLog.actorId is intentionally NOT a foreign key to User (see
            // src/db/schema/core.ts — actor identity here can't be joined to Users directly, e.g.
            // system actors), so there's no relations() entry to use with the relational query
            // API's `with`. A plain LEFT JOIN reproduces that lookup instead — `actor` comes back
            // null for any actorId that doesn't match a real user.
            db
                .select({
                    id: auditLogs.id,
                    entityType: auditLogs.entityType,
                    entityId: auditLogs.entityId,
                    action: auditLogs.action,
                    actorId: auditLogs.actorId,
                    before: auditLogs.before,
                    after: auditLogs.after,
                    createdAt: auditLogs.createdAt,
                    updatedAt: auditLogs.updatedAt,
                    actor: {
                        id: users.id,
                        email: users.email,
                        firstName: users.firstName,
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

        return { data: rows, meta: buildMeta(p, Number(total)) };
    },
}
