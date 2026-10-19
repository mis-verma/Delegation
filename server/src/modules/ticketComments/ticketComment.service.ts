import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { ticketComments, users } from "../../db/schema/index.js"
import { eq } from "drizzle-orm"
import { ticketService } from "../tickets/ticket.service.js"
import { emitTicketEvent } from "../../sockets/ticketEvent.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateCommentInput } from "./ticketComment.validation.js"

export const ticketCommentService = {

    async create(ticketId: string, input: CreateCommentInput, user: AccessTokenPayload) {
        const ticket = await ticketService.getById(ticketId, user)

        const id = createId()
        await db.insert(ticketComments).values({
            id,
            body: input.body,
            ticketId,
            authorId: user.sub,
        })

        const [row] = await db
            .select({
                comment: ticketComments,
                author: { id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role },
            })
            .from(ticketComments)
            .leftJoin(users, eq(ticketComments.authorId, users.id))
            .where(eq(ticketComments.id, id))
            .limit(1)
        const populated = row ? { ...row.comment, author: row.author } : undefined

        emitTicketEvent("ticket:updated", {
            userId: ticket.userId,
            assigneeId: ticket.assigneeId ?? null,
            departmentId: ticket.departmentId ?? null,
            storeId: ticket.storeId ?? null,
        }, ticket)

        return populated
    },
}
