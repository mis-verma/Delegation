import { z } from "zod"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { requireRole } from "../../middleware/auth/auth.js"
import { deleteUnusedTags, mergeTags, tagCleanupReport } from "./tagAdmin.service.js"
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

const idListSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) })
const mergeSchema = z.object({ fromIds: z.array(z.string().min(1)).min(1).max(500), intoId: z.string().min(1) })

tagRouter.get("/cleanup", requireRole("ADMIN", "PC"), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await tagCleanupReport() })
}))

tagRouter.post("/bulk-delete", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { ids } = idListSchema.parse(req.body)
  res.json({ success: true, data: await deleteUnusedTags(ids) })
}))

tagRouter.post("/merge", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { fromIds, intoId } = mergeSchema.parse(req.body)
  res.json({ success: true, data: await mergeTags(fromIds, intoId) })
}))
