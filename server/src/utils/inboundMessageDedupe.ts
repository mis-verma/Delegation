import { db } from "../config/db.js"
import { processedInboundMessages } from "../db/schema/index.js"
import { createId } from "@paralleldrive/cuid2"

export const claimInboundMessage = async (channel: "whatsapp" | "doubletick", messageId: string): Promise<boolean> => {
    try {
        await db.insert(processedInboundMessages).values({ id: createId(), channel, messageId })
        return true
    } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY") return false
        throw err
    }
}
