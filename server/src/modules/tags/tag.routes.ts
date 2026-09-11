import { z } from "zod"
import { createLookupRouter } from "../../utils/lookupModule.js";
import { tags } from "../../db/schema/index.js"

// `color` exists on the table but is never actually set by any caller — LabelsField.tsx derives
// its chip color client-side by hashing the name instead — so only `name` is accepted here.
// max(191) mirrors the Tag table's actual column width (db/schema/task.ts) — see store.routes.ts's
// own version of this comment for why that matters (masked 500 vs. clean 400 on an overlong value).
const tagBodySchema = z.object({ name: z.string().min(1).max(191) })

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
export const tagRouter = createLookupRouter(tags, tagBodySchema)
