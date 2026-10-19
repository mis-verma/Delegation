import path from "node:path"
import fs from "node:fs"
import { db } from "../../config/db.js"
import { taskChecklistItems, taskImages } from "../../db/schema/index.js"
import { eq, count, inArray } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { assertCanWorkChecklistItem, taskChecklistWorkerIds } from "../../utils/checklistItemWorkers.js"

const assertCanUpload = (user: AccessTokenPayload, item: { assigneeId: string | null; taskChecklistId: string | null }) =>
    assertCanWorkChecklistItem(
        user,
        item,
        () => (item.taskChecklistId ? taskChecklistWorkerIds(item.taskChecklistId) : Promise.resolve([])),
        "Only the assigned person can upload evidence for this item",
    );

export const taskImageService = {
    async upload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanUpload(user, item);

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

        if (item.requiresLivePhoto && captureMethod !== "LIVE") {
            files.forEach((f) => fs.unlink(f.path, () => { }));
            throw AppError.badRequest("This item requires a live camera photo, not a gallery upload");
        }

        if (item.maxImageCount != null) {
            const [{ existingCount }] = await db.select({ existingCount: count() })
                .from(taskImages)
                .where(eq(taskImages.taskChecklistItemId, item.id));
            if (existingCount + files.length > item.maxImageCount) {
                files.forEach((f) => fs.unlink(f.path, () => { }));
                const remaining = Math.max(item.maxImageCount - existingCount, 0);
                throw AppError.badRequest(
                    remaining > 0
                        ? `This item allows at most ${item.maxImageCount} photo(s) — only ${remaining} more can be uploaded`
                        : `This item already has the maximum of ${item.maxImageCount} photo(s)`,
                );
            }
        }

        const rows = files.map((file) => ({
            id: createId(),
            url: `/uploads/tasks/${path.basename(file.path)}`,
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

        const absolutePath = path.resolve(process.cwd(), "uploads", "tasks", path.basename(image.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete image file from disk:", err);
        });

        await db.delete(taskImages).where(eq(taskImages.id, imageId));
        return image;
    },

};
