import { db } from "./src/config/db.js"
import { checklistInstances, checklistInstanceItems, checklistInstanceImages } from "./src/db/schema/index.js"
import { asc, eq, inArray } from "drizzle-orm"

await db.delete(checklistInstances).where(eq(checklistInstances.id, "aact2gz4asu5v1aowq6tv836"))

const RUN = "g5bsyb3isncvuymy7qx6bhqi"
await db.update(checklistInstances).set({
    periodStart: new Date("2026-11-25T00:00:00.000Z"),
    periodEnd: new Date("2026-11-25T18:30:00.000Z"),
    periodKey: "2026-11-25",
    verificationStatus: "NOT_SUBMITTED",
    submittedAt: null,
    submittedBy: null,
}).where(eq(checklistInstances.id, RUN))

const items = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, RUN)).orderBy(asc(checklistInstanceItems.order))
const ids = items.map((i) => i.id)
await db.delete(checklistInstanceImages).where(inArray(checklistInstanceImages.checklistInstanceItemId, ids))
await db.update(checklistInstanceItems).set({
    isDone: false, booleanAnswer: null, completedAt: null, completedBy: null,
    isNotApplicable: false, waivedAt: null, requiredImageCount: 0, requiresLivePhoto: false,
}).where(inArray(checklistInstanceItems.id, ids))
await db.update(checklistInstanceItems).set({ requiredImageCount: 1, requiresLivePhoto: false })
    .where(inArray(checklistInstanceItems.id, [items[1]!.id, items[4]!.id]))

const after = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, RUN)).orderBy(asc(checklistInstanceItems.order))
console.log(after.map((i) => `${i.order} req=${i.requiredImageCount} done=${i.isDone} ${i.label.slice(0, 34)}`))
process.exit(0)
