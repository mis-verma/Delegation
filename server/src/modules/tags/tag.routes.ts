import { z } from "zod"
import { count, eq } from "drizzle-orm"
import { invalidate } from "../../config/queryCache.js"
import { createLookupRouter } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
import { categoryTags, tags, ticketTags } from "../../db/schema/index.js"

const LABEL_COLOR_KEYS = ["indigo", "violet", "fuchsia", "rose", "orange", "amber", "lime", "emerald", "teal", "sky", "blue", "slate"] as const
const tagBodySchema = z.object({
  name: z.string().min(1).max(191),
  color: z.enum(LABEL_COLOR_KEYS).nullable().optional(),
})

export const tagRouter = createLookupRouter(tags, tagBodySchema, {
  deleteBlockers: async (row) => {
    const [used] = await db.select({ n: count() }).from(ticketTags).where(eq(ticketTags.tagId, row.id))
    const n = Number(used?.n ?? 0)
    if (n > 0) return `${row.name} is on ${n} ${n === 1 ? "ticket" : "tickets"}, and labels on tickets are permanent, so it can't be deleted.`
    const [inCategories] = await db.select({ n: count() }).from(categoryTags).where(eq(categoryTags.tagId, row.id))
    const c = Number(inCategories?.n ?? 0)
    return c > 0 ? `${row.name} is the default label of ${c} ${c === 1 ? "category" : "categories"}. Remove it from them first.` : null
  },
  afterChange: async () => {
    await invalidate("lookup:Category")
  },
})
