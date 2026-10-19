import { z } from "zod"
import { count, eq } from "drizzle-orm"
import { createLookupRouter } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
import { tags, ticketTags } from "../../db/schema/index.js"

const LABEL_COLOR_KEYS = ["indigo", "violet", "fuchsia", "rose", "orange", "amber", "lime", "emerald", "teal", "sky", "blue", "slate"] as const
const tagBodySchema = z.object({
  name: z.string().min(1).max(191),
  color: z.enum(LABEL_COLOR_KEYS).nullable().optional(),
})

export const tagRouter = createLookupRouter(tags, tagBodySchema, {
  deleteBlockers: async (row) => {
    const [used] = await db.select({ n: count() }).from(ticketTags).where(eq(ticketTags.tagId, row.id))
    const n = Number(used?.n ?? 0)
    return n > 0 ? `${row.name} is on ${n} ${n === 1 ? "ticket" : "tickets"}, and labels on tickets are permanent, so it can't be deleted.` : null
  },
})
