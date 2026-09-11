import { Router } from "express"
import { z } from "zod"
import type { AnyMySqlColumn, MySqlTableWithColumns } from "drizzle-orm/mysql-core"
import { asc, eq, sql, getTableName } from "drizzle-orm"
// Middleware that checks the user is logged in (authenticate) and that they have a
// specific role, like "ADMIN" (requireRole).
import { authenticate, requireRole } from "../middleware/auth/auth.js"
// Our reusable wrapper (see asyncHandler.ts) that catches errors from async route handlers
// and forwards them to Express's error-handling middleware instead of crashing/hanging.
import { asyncHandler } from "./asyncHandler.js"
// Our custom error class that carries an HTTP status code (see AppError.ts).
import { AppError } from "./AppError.js"
import { db } from "../config/db.js"
import { cached, invalidate, cacheKey } from "../config/queryCache.js"

// This is a "router factory": a function that BUILDS and returns an Express Router,
// instead of a router being hand-written directly.
//
// Why does this exist? Many parts of this app have simple "lookup" data - small reference
// lists like Store (currently the only real consumer — Department/Category grew their own
// full controllers instead) - that all need basically the exact same CRUD (Create, Read,
// Update, Delete) API: list them all, add a new one, edit one, delete one. Rather than
// copy-pasting nearly identical route code, we write the logic ONCE here as a generic
// function, and any lookup table just calls `createLookupRouter(someTable)`.
//
// Migrated from a Mongoose `Model<any>` to a Drizzle table generic. Every lookup table is
// expected to have `id` and `name` columns (that's all this factory ever touches) — Drizzle
// doesn't have a shared "every table" base type the way Mongoose's `Model` did, so we
// constrain the generic to just those two required columns via an intersection type.
type LookupTable = MySqlTableWithColumns<any> & { id: AnyMySqlColumn; name: AnyMySqlColumn }

// Both optional — see user.validation.ts's listUsersQuerySchema for the same reasoning: the
// admin directory's Stores tab passes page+limit, every other caller (dropdowns, org structure)
// passes neither and must keep getting the full list back, unchanged.
const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})

// Every caller of this factory (Store, Tag) only ever needs a `name` plus a handful of simple
// optional fields — bodySchema whitelists exactly those. z.object().parse() already strips any
// key not declared on the schema (id/createdAt/updatedAt included), which is what stops a caller
// mass-assigning those on create or overwriting them on update, on top of catching a missing
// `name` as a clean 400 instead of a raw NOT NULL constraint error surfacing as a masked 500.
export const createLookupRouter = (table: LookupTable, bodySchema: z.AnyZodObject) => {
    const updateSchema = bodySchema.partial()
    // Lookup rows change a few times a year and are read on nearly every page (every dropdown,
    // the org tree, filter bars), so they cache well.
    //
    // The key MUST include the table name: this factory builds a router per lookup table, and a
    // shared key would serve one table's rows for another's request. Drizzle's own getTableName()
    // rather than poking at internal symbols, which would silently return undefined — and
    // undefined would collapse every router onto the same key, which is exactly the bug.
    const CACHE_PREFIX = cacheKey("lookup", getTableName(table))
    const CACHE_TTL_SECONDS = 300
    const dropCache = () => invalidate(CACHE_PREFIX)

    // Create a fresh, isolated set of routes. This gets "mounted" onto a path like
    // `/api/stores` or `/api/departments` wherever this function is used.
    const router = Router()

    // GET / -> list items of this lookup type, optionally paginated.
    // Anyone who is authenticated (logged in) can view the list - no special role needed.
    router.get("/", authenticate, asyncHandler(async (req, res) => {
        const { page, limit } = listQuerySchema.parse(req.query)

        if (page && limit) {
            const [items, totalRows] = await cached(cacheKey(CACHE_PREFIX, "page", page, limit), CACHE_TTL_SECONDS, () => Promise.all([
                db.select().from(table).orderBy(asc(table.name)).offset((page - 1) * limit).limit(limit),
                db.select({ count: sql<number>`count(*)` }).from(table),
            ]))
            const total = Number(totalRows[0]?.count ?? 0)
            res.json({
                success: true,
                data: items,
                meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
            })
            return
        }

        // Fetch every row for this table, sorted alphabetically by `name`.
        const items = await cached(cacheKey(CACHE_PREFIX, "all"), CACHE_TTL_SECONDS, () =>
            db.select().from(table).orderBy(asc(table.name)));
        // Send a consistent JSON shape: { success, data } so the frontend always knows
        // what to expect regardless of which lookup type this is.
        res.json({ success: true, data: items })
    }))

    // From this point on, every route below requires the user to be authenticated AND
    // have the "ADMIN" role. `router.use(...)` applies this middleware to all routes
    // defined after it in this router (POST, PATCH, DELETE below), so only admins can
    // create, edit, or delete lookup entries - regular users can only view them (see GET above).
    router.use(authenticate, requireRole("ADMIN", "PC"))

    // POST / -> create a new lookup item (admin only).
    router.post("/", asyncHandler(async (req, res) => {
        const input = bodySchema.parse(req.body)
        // Before creating, check whether an item with this same name already exists,
        // to avoid duplicate entries (e.g. two "Electronics" categories).
        const [existing] = await db.select().from(table).where(eq(table.name, input.name)).limit(1);
        // If it already exists, stop here and throw a 409 Conflict error. Because this
        // route is wrapped in asyncHandler, throwing here is safe - asyncHandler makes
        // sure this gets forwarded to the error-handling middleware instead of crashing.
        if (existing) throw AppError.conflict("Name already exists")
        // Otherwise, create the new row using whatever fields the schema whitelisted.
        // The id is DB/schema-generated (cuid `$defaultFn`), so we insert first, then
        // re-select by name (unique) to hand back the full row including generated columns.
        await db.insert(table).values(input)
        const [item] = await db.select().from(table).where(eq(table.name, input.name)).limit(1);
        // 201 = "Created" - the conventional success status code for a successful POST
        // that creates a new resource.
        await dropCache()
        res.status(201).json({ success: true, data: item })
    }))

    // PATCH /:id -> update an existing lookup item by its id (admin only).
    router.patch("/:id", asyncHandler(async (req, res) => {
        const input = updateSchema.parse(req.body)
        // Same duplicate-name guard as POST above — without it, renaming an item to match another
        // existing row either silently succeeds (if the table happens to have no unique index on
        // `name`) or surfaces as a generic "Duplicate value" 500-adjacent error from the DB's own
        // unique constraint instead of this clean, field-specific 409.
        if (input.name !== undefined) {
            const [existing] = await db.select().from(table).where(eq(table.name, input.name)).limit(1);
            if (existing && existing.id !== req.params.id) throw AppError.conflict("Name already exists")
        }
        // Drizzle's update doesn't return the updated row on MySQL, so update then re-select.
        await db.update(table).set({ ...input, updatedAt: new Date() }).where(eq(table.id, req.params.id));
        const [item] = await db.select().from(table).where(eq(table.id, req.params.id)).limit(1);
        // If no row was found with that id, `item` will be undefined - throw a 404 instead
        // of silently sending back nothing.
        if (!item) throw AppError.notFound("Not Found")
        await dropCache()
        res.json({ success: true, data: item })
    }))

    // DELETE /:id -> remove a lookup item by its id (admin only).
    router.delete("/:id", asyncHandler(async (req, res) => {
        const [existing] = await db.select().from(table).where(eq(table.id, req.params.id)).limit(1);
        // If nothing was found, treat it as "not found" rather than pretending the delete succeeded.
        if (!existing) throw AppError.notFound("Not Found")
        await db.delete(table).where(eq(table.id, req.params.id));
        await dropCache()
        // Note: response shape here is `{ delete: true }` (not `deleted`) - kept as-is,
        // just flagging it in case it looks like a typo when reading the frontend code
        // that consumes this response.
        res.json({ success: true, data: { delete: true } })
    }))

    // Hand back the fully-configured router so the caller can mount it, e.g.
    // `app.use("/api/stores", createLookupRouter(stores, z.object({ name: z.string().min(1), ... })))`.
    return router;

}
