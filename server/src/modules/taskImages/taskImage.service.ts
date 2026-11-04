import path from "node:path"
import fs from "node:fs"
import { db } from "../../config/db.js"
import { taskChecklistItems, taskChecklists, taskImages, tasks } from "../../db/schema/index.js"
import { eq, inArray } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { assertCanWorkChecklistItem, assertChecklistOpenForWork, taskChecklistWorkerIds } from "../../utils/checklistItemWorkers.js"
import { assessImageQuality, serializeQualityFlags } from "../../utils/imageQuality.js"
import { FAILED_PHOTO_DELETE_MESSAGE, assertPhotoRoom, isFailedPhoto, type PhotoReviewReason } from "../checklistInstanceImages/photoFailure.js"
import { assertCanVerify } from "../tasks/taskAccess.js"
import { auditService } from "../audit/audit.service.js"
import { isAdminOrPc } from "../../utils/roles.js"

const assertCanUpload = (user: AccessTokenPayload, item: { assigneeId: string | null; taskChecklistId: string | null }) =>
    assertCanWorkChecklistItem(
        user,
        item,
        () => (item.taskChecklistId ? taskChecklistWorkerIds(item.taskChecklistId) : Promise.resolve([])),
        "Only the assigned person can upload evidence for this item",
    );

export const taskImageService = {
    async upload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        try {
            return await taskImageService.storeUpload(itemId, files, captureMethod, user);
        } catch (err) {
            files.forEach((f) => fs.unlink(f.path, () => { }));
            throw err;
        }
    },

    async storeUpload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanUpload(user, item);
        await assertChecklistOpenForWork(user, item.taskChecklistId);

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

        if (item.requiresLivePhoto && captureMethod !== "LIVE") {
            files.forEach((f) => fs.unlink(f.path, () => { }));
            throw AppError.badRequest("This item requires a live camera photo, not a gallery upload");
        }

        const existing = await db.select({ qualityFlags: taskImages.qualityFlags, reviewStatus: taskImages.reviewStatus })
            .from(taskImages)
            .where(eq(taskImages.taskChecklistItemId, item.id));
        assertPhotoRoom(existing, files.length, item.maxImageCount);

        const qualities = await Promise.all(files.map((file) => (file.mimetype.startsWith("image/") ? assessImageQuality(file.path) : Promise.resolve(null))));
        const rows = files.map((file, index) => ({
            id: createId(),
            url: `/uploads/tasks/${path.basename(file.path)}`,
            qualityFlags: serializeQualityFlags(qualities[index] ?? null),
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod,
            taskChecklistItemId: item.id,
            uploadedBy: user.sub,
        }));

        await db.insert(taskImages).values(rows);
        return db.select().from(taskImages).where(inArray(taskImages.id, rows.map((r) => r.id)));
    },

    async remove(imageId: string, user: AccessTokenPayload) {
        const [image] = await db.select().from(taskImages).where(eq(taskImages.id, imageId)).limit(1);
        if (!image) throw AppError.notFound("Image not found");

        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, image.taskChecklistItemId)).limit(1);
        await assertCanUpload(user, item ?? { assigneeId: image.uploadedBy, taskChecklistId: null });
        await assertChecklistOpenForWork(user, item?.taskChecklistId ?? null);
        if (isFailedPhoto(image) && !isAdminOrPc(user.role)) throw AppError.forbidden(FAILED_PHOTO_DELETE_MESSAGE);

        const absolutePath = path.resolve(process.cwd(), "uploads", "tasks", path.basename(image.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete image file from disk:", err);
        });

        await db.delete(taskImages).where(eq(taskImages.id, imageId));
        return image;
    },

    async review(imageId: string, input: { action: "REJECT" | "ACCEPT"; reason?: PhotoReviewReason }, user: AccessTokenPayload) {
        const [image] = await db.select().from(taskImages).where(eq(taskImages.id, imageId)).limit(1);
        if (!image) throw AppError.notFound("Image not found");
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, image.taskChecklistItemId)).limit(1);
        if (!item?.taskChecklistId) throw AppError.notFound("Checklist item not found");
        const [checklist] = await db.select({ taskId: taskChecklists.taskId }).from(taskChecklists).where(eq(taskChecklists.id, item.taskChecklistId)).limit(1);
        const [task] = checklist ? await db.select().from(tasks).where(eq(tasks.id, checklist.taskId)).limit(1) : [];
        if (!task) throw AppError.notFound("Delegation not found");
        if (task.status !== "pending_approval") throw AppError.badRequest("Photos can only be reviewed while the delegation is waiting for approval.");
        await assertCanVerify(task, user);
        if (input.action === "REJECT" && !input.reason) throw AppError.badRequest("Say why the photo is rejected.");

        const now = new Date();
        const patch = input.action === "REJECT"
            ? { reviewStatus: "REJECTED" as const, reviewReason: input.reason ?? "OTHER", reviewedBy: user.sub, reviewedAt: now, updatedAt: now }
            : { reviewStatus: "ACCEPTED" as const, reviewReason: null, reviewedBy: user.sub, reviewedAt: now, updatedAt: now };
        await db.update(taskImages).set(patch).where(eq(taskImages.id, imageId));
        await auditService.record({ entityType: "TaskImage", entityId: imageId, action: "UPDATE", actorId: user.sub, before: image, after: { ...image, ...patch } });
        const [updated] = await db.select().from(taskImages).where(eq(taskImages.id, imageId)).limit(1);
        return updated!;
    },

};
