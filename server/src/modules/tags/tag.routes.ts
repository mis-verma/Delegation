import { z } from "zod"
import { count, eq } from "drizzle-orm"
import { createLookupRouter } from "../../utils/lookupModule.js";
import { db } from "../../config/db.js"
import { tags, ticketTags } from "../../db/schema/index.js"

// `color` is one of the palette keys the label picker offers (client/src/lib/labelColors.ts). It is
// optional: a label without one is drawn in a colour derived from its name, which is also how every
// label made before colours could be chosen still looks. The list is checked here so the column
// only ever holds a key the client can draw.
// max(191) mirrors the Tag table's actual column width (db/schema/task.ts) — see store.routes.ts's
// own version of this comment for why that matters (masked 500 vs. clean 400 on an overlong value).
const LABEL_COLOR_KEYS = ["indigo", "violet", "fuchsia", "rose", "orange", "amber", "lime", "emerald", "teal", "sky", "blue", "slate"] as const
const tagBodySchema = z.object({
  name: z.string().min(1).max(191),
  color: z.enum(LABEL_COLOR_KEYS).nullable().optional(),
})

// Delegation labels. The Tag table has been in the schema (with its TaskTag junction and its
// relations) since the Mongo port with no code on top of it at all — this is that wiring, not a
// new model.
//
// The lookup factory is the right fit and gives the whole contract for free:
//   GET    /      -> every label, alphabetical, open to any logged-in user (needed by the
//                    Delegation filter row and the task form's picker, i.e. everyone)
//   POST   /      -> create a label       (ADMIN / PC only)
//   PATCH  /:id   -> rename a label       (ADMIN / PC only)
//   DELETE /:id   -> delete a label       (ADMIN / PC only)
//
// Gating writes to ADMIN/PC is the factory's existing behaviour and the right call here rather
// than letting anyone coin a label on the fly: the whole value of a label is that filtering by it
// returns everything it should, and a free-for-all produces "Urgent", "urgent" and "URGENT" as
// three separate labels within a week. TaskTag rows — attaching an existing label to a delegation
// — are written through the task's own create/update, so labelling is open to anyone who can edit
// the delegation.
//
// Deleting a label cascades to its TaskTag rows (onDelete: 'cascade' on the junction), so a
// removed label detaches itself from every delegation rather than leaving orphans behind.
//
// Except a label that is on a ticket: labels on tickets are permanent (ticket.service.ts update refuses to take
// one off), so deleting the label itself, which would take it off every ticket, is refused too.
export const tagRouter = createLookupRouter(tags, tagBodySchema, {
  deleteBlockers: async (row) => {
    const [used] = await db.select({ n: count() }).from(ticketTags).where(eq(ticketTags.tagId, row.id))
    const n = Number(used?.n ?? 0)
    return n > 0 ? `${row.name} is on ${n} ${n === 1 ? "ticket" : "tickets"}, and labels on tickets are permanent, so it can't be deleted.` : null
  },
})
