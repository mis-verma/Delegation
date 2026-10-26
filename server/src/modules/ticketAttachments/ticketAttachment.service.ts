import path from "node:path";
import fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../../config/db.js";
import { tickets, ticketAttachments } from "../../db/schema/index.js";
import { eq, and, isNull, inArray, gt } from "drizzle-orm";
import { repeatWindowStart, splitRepeatedUploads } from "../../utils/repeatedUploads.js";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertCanMutate } from "../tickets/ticket.service.js";
import { auditService } from "../audit/audit.service.js";
import { isAdminOrPc } from "../../utils/roles.js"

export const ticketAttachmentService = {
    async upload(ticketId: string, files: Express.Multer.File[], user: AccessTokenPayload) {
        const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt))).limit(1);
        if (!ticket) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.notFound("Ticket not found");
        }
        try {
            assertCanMutate(user, ticket);
        } catch (err) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw err;
        }

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

        const { fresh, already } = splitRepeatedUploads(files, await db.select().from(ticketAttachments).where(and(
            eq(ticketAttachments.ticketId, ticket.id),
            eq(ticketAttachments.uploadedBy, user.sub),
            gt(ticketAttachments.createdAt, repeatWindowStart()),
        )));
        if (fresh.length === 0) return already;

        const rows = fresh.map((file) => ({
            id: createId(),
            url: `/uploads/ticket-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            ticketId: ticket.id,
            uploadedBy: user.sub,
        }));
        await db.insert(ticketAttachments).values(rows);
        const inserted = await db.select().from(ticketAttachments).where(inArray(ticketAttachments.id, rows.map((r) => r.id)));
        return [...already, ...inserted];
    },

    async remove(attachmentId: string, user: AccessTokenPayload) {
        const [attachment] = await db.select().from(ticketAttachments).where(eq(ticketAttachments.id, attachmentId)).limit(1);
        if (!attachment) throw AppError.notFound("Attachment not found");

        const [ticket] = await db.select().from(tickets).where(eq(tickets.id, attachment.ticketId)).limit(1);
        if (ticket) assertCanMutate(user, ticket);
        if (!ticket && !isAdminOrPc(user.role) && attachment.uploadedBy !== user.sub) {
            throw AppError.forbidden("You don't have access to this ticket's attachments");
        }

        if (user.role !== "ADMIN") {
            if (attachment.statusUpdateId) {
                throw AppError.forbidden("This photo was sent with a status change, so it stays on the ticket's history.");
            }
            if (ticket?.status === "CLOSED") {
                throw AppError.forbidden("This ticket is closed, so its photos can't be removed. Ask an admin if one has to go.");
            }
        }

        await db.delete(ticketAttachments).where(eq(ticketAttachments.id, attachmentId));

        const absolutePath = path.resolve(process.cwd(), "uploads", "ticket-attachments", path.basename(attachment.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete attachment file from disk:", err);
        });

        await auditService.record({
            entityType: "TicketAttachment",
            entityId: attachment.id,
            action: "DELETE",
            actorId: user.sub,
            before: attachment,
        });
        return attachment;
    },
};
