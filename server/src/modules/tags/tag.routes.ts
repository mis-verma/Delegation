import { z } from "zod"
import { count, eq } from "drizzle-orm"
import { invalidate } from "../../config/queryCache.js"
import { createLookupRouter } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
import { tags, ticketTags, categoryTags, categorySubcategoryTags } from "../../db/schema/index.js"

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
    return null
  },
  beforeDelete: async (row) => {
    await db.delete(categoryTags).where(eq(categoryTags.tagId, row.id))
    await db.delete(categorySubcategoryTags).where(eq(categorySubcategoryTags.tagId, row.id))
  },
  afterChange: async () => {
    await invalidate("lookup:Category")
  },
})
