import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { tasks, taskAdditionalAssignees, taskAttachments } from "../../db/schema/index.js";
import { eq, and, inArray, isNull, gt } from "drizzle-orm";
import { repeatWindowStart, splitRepeatedUploads } from "../../utils/repeatedUploads.js";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { isAdminOrPc } from "../../utils/roles.js"

const assertCanAttach = async (user: AccessTokenPayload, task: { id: string; userId: string; assigneeId: string | null }) => {
    if (isAdminOrPc(user.role)) return;
    if (task.userId === user.sub) return;
    if (task.assigneeId && task.assigneeId === user.sub) return;

    const additionalAssignees = await db.select({ userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.taskId, task.id));
    if (additionalAssignees.some((a) => a.userId === user.sub)) return;

    throw AppError.forbidden("You don't have access to this delegation's attachments");
};

export const taskAttachmentService = {
    async upload(taskId: string, files: Express.Multer.File[], user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.notFound("Delegation not found");
        }
        try {
            await assertCanAttach(user, task);
        } catch (err) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw err;
        }

        if (!files.length) {
            throw AppError.badRequest("No valid files were received (check file type and size)");
        }

        const { fresh, already } = splitRepeatedUploads(files, await db.select().from(taskAttachments).where(and(
            eq(taskAttachments.taskId, task.id),
            eq(taskAttachments.uploadedBy, user.sub),
            gt(taskAttachments.createdAt, repeatWindowStart()),
        )));
        if (fresh.length === 0) return already;

        const rows = fresh.map((file) => ({
            id: createId(),
            url: `/uploads/task-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            taskId: task.id,
            uploadedBy: user.sub,
        }));

        await db.insert(taskAttachments).values(rows);

        const inserted = await db.select().from(taskAttachments).where(inArray(taskAttachments.id, rows.map((r) => r.id)));
        return [...already, ...inserted];
    },

    async remove(attachmentId: string, user: AccessTokenPayload) {
        const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, attachmentId)).limit(1);
        if (!attachment) throw AppError.notFound("Attachment not found");

        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, attachment.taskId), isNull(tasks.deletedAt))).limit(1);
        if (task) await assertCanAttach(user, task);
        if (task && (task.status === "done" || task.status === "pending_approval") && user.role !== "ADMIN") {
            throw AppError.forbidden("This delegation is approved and closed. Only an admin can remove its files.");
        }
        if (!task && !isAdminOrPc(user.role) && attachment.uploadedBy !== user.sub) {
            throw AppError.forbidden("You don't have access to this delegation's attachments");
        }

        const absolutePath = path.resolve(process.cwd(), "uploads", "task-attachments", path.basename(attachment.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete task attachment file from disk:", err);
        });

        await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
        return attachment;
    },
};
