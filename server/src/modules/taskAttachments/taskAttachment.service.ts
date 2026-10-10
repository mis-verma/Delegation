import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { tasks, taskAdditionalAssignees, taskAttachments } from "../../db/schema/index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";

// Who can attach/remove files directly on a task — the creator, the assignee, or an Admin.
// Looser than checklist-item evidence (assignee-only there) since this is general reference
// material/evidence on the task itself, not one person's specific work item.
const assertCanAttach = async (user: AccessTokenPayload, task: { id: string; userId: string; assigneeId: string | null }) => {
    if (user.role === "ADMIN" || user.role === "PC") return;
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
        // Multer's already written these to disk by the time this runs — every throw below must
        // clean them up first, or a caller with no access to the task can repeatedly fill disk by
        // uploading to tasks they'll always get rejected on (same pattern as checklistImage.service).
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

        const rows = files.map((file) => ({
            id: createId(),
            url: `/uploads/task-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            taskId: task.id,
            uploadedBy: user.sub,
        }));

        await db.insert(taskAttachments).values(rows);

        return db.select().from(taskAttachments).where(inArray(taskAttachments.id, rows.map((r) => r.id)));
    },

    async remove(attachmentId: string, user: AccessTokenPayload) {
        const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, attachmentId)).limit(1);
        if (!attachment) throw AppError.notFound("Attachment not found");

        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, attachment.taskId), isNull(tasks.deletedAt))).limit(1);
        if (task) await assertCanAttach(user, task);
        // An approved delegation is closed, and its files are part of what was approved: only an
        // Admin may take one off (same rule as every other change on a done delegation, see
        // task.service.ts's update()).
        if (task && task.status === "done" && user.role !== "ADMIN") {
            throw AppError.forbidden("This delegation is approved and closed. Only an admin can remove its files.");
        }
        if (!task && user.role !== "ADMIN" && user.role !== "PC" && attachment.uploadedBy !== user.sub) {
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
