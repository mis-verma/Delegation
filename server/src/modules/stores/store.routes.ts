// This factory function builds a ready-made Express router that already knows
// how to list, create, update, and delete records for a given Drizzle table.
// We import it here instead of writing our own GET/POST/PATCH/DELETE handlers.
import { z } from "zod"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { createLookupRouter, describeBlockers } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
// The Store table represents a simple "lookup" table (a list of stores, like
// a dropdown reference list) that other parts of the app (e.g. tickets) point to.
import {
    stores,
    users,
    departments,
    tickets,
    checklistDefinitions,
    checklistDefinitionStores,
    checklistInstances,
} from "../../db/schema/index.js"

// Matches StoreForm.tsx's own schema (name required, code/address optional) plus isActive, the
// one field the list view's toggle patches that the form itself never touches.
// max() bounds mirror the actual column widths (db/schema/core.ts's Store table) — an overlong
// value used to reach MySQL's ER_DATA_TOO_LONG, which isn't one of errorHandler.ts's specific
// branches, so it fell through to a masked generic 500 instead of a clean 400 here.
const storeBodySchema = z.object({
    name: z.string().trim().min(1).max(191),
    code: z.string().trim().max(191).optional(),
    address: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
})

const countOf = async (query: Promise<{ n: number }[]>) => Number((await query)[0]?.n ?? 0)

// What still points at a store: people, departments, open tickets and the checklists (and their
// runs) set up for it. Deleting it would orphan them, so the delete is refused with a plain sentence.
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

// Call the factory with the Store table. This single line gives us a fully
// working router with routes for:
//   GET    /        -> list all stores (sorted by name), open to any logged-in user
//   POST   /         -> create a new store (admin only)
//   PATCH  /:id       -> update an existing store by its id (admin only)
//   DELETE /:id       -> delete a store by its id (admin only)
// Using this shared factory avoids copy/pasting the same CRUD code for every
// simple reference table (Stores, Departments, Categories, etc.) - this is
// the "Don't Repeat Yourself" (DRY) principle in action.
// Create/update/delete are written to the audit log as "Store" rows, like Department's own.
export const StoreRouter = createLookupRouter(stores, storeBodySchema, {
    entityType: "Store",
    deleteBlockers: storeBlockers,
})
