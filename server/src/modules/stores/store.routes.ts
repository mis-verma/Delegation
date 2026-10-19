import { z } from "zod"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { createLookupRouter, describeBlockers } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
import {
    stores,
    users,
    departments,
    tickets,
    checklistDefinitions,
    checklistDefinitionStores,
    checklistInstances,
} from "../../db/schema/index.js"

const storeBodySchema = z.object({
    name: z.string().trim().min(1).max(191),
    code: z.string().trim().max(191).optional(),
    address: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
})

const countOf = async (query: Promise<{ n: number }[]>) => Number((await query)[0]?.n ?? 0)

const storeBlockers = async (store: { id: string; name: string }) => {
    const id = store.id
    const [people, depts, openTickets, definitions, runs] = await Promise.all([
        countOf(db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.storeId, id))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(departments).where(eq(departments.storeId, id))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(tickets)
            .where(and(eq(tickets.storeId, id), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt)))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(checklistDefinitionStores)
            .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionStores.definitionId))
            .where(and(eq(checklistDefinitionStores.storeId, id), isNull(checklistDefinitions.deletedAt)))),
        countOf(db.select({ n: sql<number>`count(*)` }).from(checklistInstances).where(eq(checklistInstances.storeId, id))),
    ]);
    return describeBlockers(store.name, [
        { count: people, one: "person", many: "people" },
        { count: depts, one: "department", many: "departments" },
        { count: openTickets, one: "open ticket", many: "open tickets" },
        { count: definitions, one: "checklist", many: "checklists" },
        { count: runs, one: "checklist run", many: "checklist runs" },
    ]);
};

export const StoreRouter = createLookupRouter(stores, storeBodySchema, {
    entityType: "Store",
    deleteBlockers: storeBlockers,
})
