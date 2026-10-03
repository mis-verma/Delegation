import { db } from "../../config/db.js";
import { departments, users, categories } from "../../db/schema/core.js";
import { tickets, tasks, checklistTemplates } from "../../db/schema/index.js";
import { describeBlockers } from "../../utils/lookupModule.js";
import { eq, ne, and, asc, sql, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./department.validation.js";
import { auditService } from "../audit/audit.service.js";
import { cached, invalidate, cacheKey } from "../../config/queryCache.js";

// Departments feed every dropdown, filter bar and the org tree, and change a handful of times
// a year — so a long TTL with explicit invalidation on write, rather than a short guess.
const CACHE_PREFIX = "lookup:Department";
const CACHE_TTL_SECONDS = 300;
const dropCache = () => invalidate(CACHE_PREFIX);

const getByIdOrThrow = async (id: string) => {
    const [department] = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
    if (!department) throw AppError.notFound("Department not found");
    return department;
};

const dbCode = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.cause?.code ?? e?.code;
};
const isDuplicateEntry = (err: unknown) => dbCode(err) === "ER_DUP_ENTRY";
const isStillReferenced = (err: unknown) => dbCode(err) === "ER_ROW_IS_REFERENCED_2";

const countOf = async (query: Promise<{ n: number }[]>) => Number((await query)[0]?.n ?? 0);

// What still points at a department. Deleting it with any of these around would orphan them (or hit
// a foreign key), so the delete is refused with a plain sentence instead.
const departmentBlockers = async (department: { id: string; name: string }) => {
    const id = department.id;
    const [people, cats, openTickets, openTasks, templates] = await Promise.all([
        countOf(db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.departmentId, id))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(categories).where(eq(categories.departmentId, id))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(tickets)
            .where(and(eq(tickets.departmentId, id), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt)))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(tasks)
            .where(and(eq(tasks.departmentId, id), ne(tasks.status, "done"), isNull(tasks.deletedAt)))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(checklistTemplates)
            .where(and(eq(checklistTemplates.departmentId, id), isNull(checklistTemplates.deletedAt)))),
    ]);
    return describeBlockers(department.name, [
        { count: people, one: "person", many: "people" },
        { count: openTickets, one: "open ticket", many: "open tickets" },
        { count: openTasks, one: "open delegation", many: "open delegations" },
        { count: cats, one: "category", many: "categories" },
        { count: templates, one: "checklist template", many: "checklist templates" },
    ]);
};

export const departmentService = {
    // page/limit are optional — pass both for a paginated slice (the admin directory list), omit
    // both for the full list unchanged (dropdowns, org structure, etc.).
    async list(page?: number, limit?: number) {
        if (page && limit) {
            const [rows, totalRows] = await cached(cacheKey(CACHE_PREFIX, "page", page, limit), CACHE_TTL_SECONDS, () => Promise.all([
                db.select().from(departments).orderBy(asc(departments.name)).offset((page - 1) * limit).limit(limit),
                db.select({ count: sql<number>`count(*)` }).from(departments),
            ]));
            const total = Number(totalRows[0]?.count ?? 0);
            return {
                data: rows,
                meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
            };
        }

        const data = await cached(cacheKey(CACHE_PREFIX, "all"), CACHE_TTL_SECONDS, () =>
            db.select().from(departments).orderBy(asc(departments.name)));
        return { data };
    },

    async getById(id: string) {
        return getByIdOrThrow(id);
    },

    async create(input: CreateDepartmentInput, actorId: string) {
        const name = input.name.trim();
        const [existing] = await db.select({ id: departments.id }).from(departments).where(eq(departments.name, name)).limit(1);
        if (existing) throw AppError.conflict("Name already exists");

        const id = createId();
        try {
            await db.insert(departments).values({
                id,
                name,
                isActive: input.isActive,
                storeId: input.storeId ?? null,
            });
        } catch (err) {
            if (isDuplicateEntry(err)) throw AppError.conflict("Name already exists");
            throw err;
        }

        const created = await getByIdOrThrow(id);
        await auditService.record({ entityType: "Department", entityId: id, action: "CREATE", actorId, after: created });
        await dropCache();
        return created;
    },

    async update(id: string, input: UpdateDepartmentInput, actorId: string) {
        const before = await getByIdOrThrow(id);

        // Same duplicate-name pre-check as create (renaming onto another department's name).
        const patch = { ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) };
        if (patch.name !== undefined) {
            const [existing] = await db.select({ id: departments.id }).from(departments).where(eq(departments.name, patch.name)).limit(1);
            if (existing && existing.id !== id) throw AppError.conflict("Name already exists");
        }

        try {
            await db.update(departments)
                .set({ ...patch, updatedAt: new Date() })
                .where(eq(departments.id, id));
        } catch (err) {
            if (isDuplicateEntry(err)) throw AppError.conflict("Name already exists");
            throw err;
        }

        const after = await getByIdOrThrow(id);
        await auditService.record({ entityType: "Department", entityId: id, action: "UPDATE", actorId, before, after });
        await dropCache();
        return after;
    },

    async remove(id: string, actorId: string) {
        const department = await getByIdOrThrow(id);
        const blocked = await departmentBlockers(department);
        if (blocked) throw AppError.conflict(blocked);
        try {
            await db.delete(departments).where(eq(departments.id, id));
        } catch (err) {
            // Old closed tickets or tasks still carry this department: it can't vanish from them.
            if (isStillReferenced(err)) {
                throw AppError.conflict(`${department.name} is still used by older records, so it can't be deleted. Deactivate it instead.`);
            }
            throw err;
        }
        await auditService.record({ entityType: "Department", entityId: id, action: "DELETE", actorId, before: department });
        await dropCache();
        return department;
    },

    // Free-text -> Department resolution for the AI task-creation pipeline. Mirrors the client's
    // findDepartmentByName (SmartTaskModal.tsx), which has no server-side equivalent today.
    async resolveByName(name: string) {
        const clean = name.replace(/\b(department|dept|team)\b/gi, "").trim().toLowerCase();
        if (!clean) return null;
        const active = await db.select().from(departments).where(eq(departments.isActive, true));

        // Prefer an exact (case-insensitive) match over a substring match — otherwise "IT" could
        // resolve to whichever of "IT" / "IT Support" happens to come first in query order, and a
        // message meant for one department silently routes to the other.
        const exact = active.find((d) => d.name.toLowerCase() === clean);
        if (exact) return exact;

        // Among ambiguous substring matches, prefer the shortest department name — the tightest
        // match to what was actually extracted, instead of picking by array/insertion order.
        const substringMatches = active.filter((d) => d.name.toLowerCase().includes(clean));
        if (substringMatches.length === 0) return null;
        return substringMatches.reduce((best, d) => (d.name.length < best.name.length ? d : best));
    }
};
