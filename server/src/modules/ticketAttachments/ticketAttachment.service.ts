import path from "node:path";
import fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../../config/db.js";
import { tickets, ticketAttachments } from "../../db/schema/index.js";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertCanMutate } from "../tickets/ticket.service.js";
import { auditService } from "../audit/audit.service.js";

export const ticketAttachmentService = {
    async upload(ticketId: string, files: Express.Multer.File[], user: AccessTokenPayload) {
        // Multer's already written these to disk by the time this runs — every throw below must
        // clean them up first, or a caller with no access to the ticket can repeatedly fill disk by
        // uploading to tickets they'll always get rejected on (same pattern as checklistImage.service).
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

        const rows = files.map((file) => ({
            id: createId(),
            url: `/uploads/ticket-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            ticketId: ticket.id,
            uploadedBy: user.sub,
        }));
        await db.insert(ticketAttachments).values(rows);
        return db.select().from(ticketAttachments).where(inArray(ticketAttachments.id, rows.map((r) => r.id)));
    },

    async remove(attachmentId: string, user: AccessTokenPayload) {
        const [attachment] = await db.select().from(ticketAttachments).where(eq(ticketAttachments.id, attachmentId)).limit(1);
        if (!attachment) throw AppError.notFound("Attachment not found");

        const [ticket] = await db.select().from(tickets).where(eq(tickets.id, attachment.ticketId)).limit(1);
        if (ticket) assertCanMutate(user, ticket);
        if (!ticket && user.role !== "ADMIN" && user.role !== "PC" && attachment.uploadedBy !== user.sub) {
            throw AppError.forbidden("You don't have access to this ticket's attachments");
        }

        // A proof photo sent with a status change is part of that step's record (the reviewer judged
        // the hand-in on it), and photos on a closed ticket are part of what was approved. Only an
        // Admin can still take either off.
        if (user.role !== "ADMIN") {
            if (attachment.statusUpdateId) {
                throw AppError.forbidden("This photo was sent with a status change, so it stays on the ticket's history.");
            }
            if (ticket?.status === "CLOSED") {
                throw AppError.forbidden("This ticket is closed, so its photos can't be removed. Ask an admin if one has to go.");
            }
        }

        await db.delete(ticketAttachments).where(eq(ticketAttachments.id, attachmentId));

        // The file goes from disk only once the row is gone, so a failed delete never leaves a row
        // pointing at a missing file.
        const absolutePath = path.resolve(process.cwd(), "uploads", "ticket-attachments", path.basename(attachment.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete attachment file from disk:", err);
        });

        // Its own entity type (the snapshot carries ticketId), so it lands in the audit log's Tickets
        // group without being read as a change to the ticket's own fields in that ticket's feed.
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
