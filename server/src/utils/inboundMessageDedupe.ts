import { db } from "../config/db.js"
import { processedInboundMessages } from "../db/schema/index.js"
import { createId } from "@paralleldrive/cuid2"

// Meta/DoubleTick both retry a webhook delivery on any hiccup and neither guarantees
// at-most-once delivery. Call this before doing any real work for an inbound message: it
// atomically claims (channel, messageId) via the table's unique index, so two concurrent
// deliveries of the same message race on the same INSERT rather than both proceeding.
//
// Returns true the first time a given message is seen (caller should process it), false on a
// replay (caller should return immediately — the original delivery already handled it, or is
// still handling it right now).
export const claimInboundMessage = async (channel: "whatsapp" | "doubletick", messageId: string): Promise<boolean> => {
    try {
        await db.insert(processedInboundMessages).values({ id: createId(), channel, messageId })
        return true
    } catch (err: any) {
        // See errorHandler.ts's asMySqlError comment: Drizzle wraps the real mysql2 error in
        // `.cause`, so both the bare and wrapped shapes need checking.
        if (err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY") return false
        throw err
    }
}
