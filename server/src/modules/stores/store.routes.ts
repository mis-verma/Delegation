// This factory function builds a ready-made Express router that already knows
// how to list, create, update, and delete records for a given Drizzle table.
// We import it here instead of writing our own GET/POST/PATCH/DELETE handlers.
import { z } from "zod"
import { createLookupRouter } from "../../utils/lookupModule.js";
// The Store table represents a simple "lookup" table (a list of stores, like
// a dropdown reference list) that other parts of the app (e.g. tickets) point to.
import { stores } from "../../db/schema/index.js"

// Matches StoreForm.tsx's own schema (name required, code/address optional) plus isActive, the
// one field the list view's toggle patches that the form itself never touches.
// max() bounds mirror the actual column widths (db/schema/core.ts's Store table) — an overlong
// value used to reach MySQL's ER_DATA_TOO_LONG, which isn't one of errorHandler.ts's specific
// branches, so it fell through to a masked generic 500 instead of a clean 400 here.
const storeBodySchema = z.object({
    name: z.string().min(1).max(191),
    code: z.string().max(191).optional(),
    address: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
})

// Call the factory with the Store table. This single line gives us a fully
// working router with routes for:
//   GET    /        -> list all stores (sorted by name), open to any logged-in user
//   POST   /         -> create a new store (admin only)
//   PATCH  /:id       -> update an existing store by its id (admin only)
//   DELETE /:id       -> delete a store by its id (admin only)
// Using this shared factory avoids copy/pasting the same CRUD code for every
// simple reference table (Stores, Departments, Categories, etc.) - this is
// the "Don't Repeat Yourself" (DRY) principle in action.
export const StoreRouter = createLookupRouter(stores, storeBodySchema)
