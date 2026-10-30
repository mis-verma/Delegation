import path from "node:path";
import fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../../config/db.js";
import { checklistItems, checklistImages } from "../../db/schema/index.js";
import { eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertCanWorkChecklistItem, assertTicketChecklistOpen, ticketChecklistWorkerIds } from "../../utils/checklistItemWorkers.js";

const assertCanUpload = (user: AccessTokenPayload, item: { assigneeId: string | null; checklistId: string | null }) =>
    assertCanWorkChecklistItem(
        user,
        item,
        () => (item.checklistId ? ticketChecklistWorkerIds(item.checklistId) : Promise.resolve([])),
        "Only the assigned person can upload evidence for this item",
    );

export const checklistImageService = {
    async upload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        try {
            await assertCanUpload(user, item);
            await assertTicketChecklistOpen(user, item.checklistId);
        } catch (err) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw err;
        }

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

        if (item.requiresLivePhoto && captureMethod !== "LIVE") {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.badRequest("This item requires a live camera photo, not a gallery upload");
        }

        if (item.maxImageCount != null) {
            const [{ count: existingCount } = { count: 0 }] = await db
                .select({ count: sql<number>`count(*)` })
                .from(checklistImages)
                .where(eq(checklistImages.checklistItemId, item.id));
            if (Number(existingCount) + files.length > item.maxImageCount) {
                files.forEach((f) => fs.unlink(f.path, () => {}));
                const remaining = Math.max(item.maxImageCount - Number(existingCount), 0);
                throw AppError.badRequest(
                    remaining > 0
                        ? `This item allows at most ${item.maxImageCount} photo(s) — only ${remaining} more can be uploaded`
                        : `This item already has the maximum of ${item.maxImageCount} photo(s)`,
                );
            }
        }

        const rows = files.map((file) => ({
            id: createId(),
            url: `/uploads/tickets/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod,
            checklistItemId: item.id,
            uploadedBy: user.sub,
        }));
        await db.insert(checklistImages).values(rows);
        return db.select().from(checklistImages).where(inArray(checklistImages.id, rows.map((r) => r.id)));
    },

    async remove(imageId: string, user: AccessTokenPayload) {
        const [image] = await db.select().from(checklistImages).where(eq(checklistImages.id, imageId)).limit(1);
        if (!image) throw AppError.notFound("Image not found");

        const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, image.checklistItemId)).limit(1);
        await assertCanUpload(user, item ?? { assigneeId: image.uploadedBy, checklistId: null });
        await assertTicketChecklistOpen(user, item?.checklistId ?? null);

        const absolutePath = path.resolve(process.cwd(), "uploads", "tickets", path.basename(image.url));
        fs.unlink(absolutePath, (err) => {
            if (err) console.error("Failed to delete image file from disk:", err);
        });

        await db.delete(checklistImages).where(eq(checklistImages.id, imageId));
        return image;
    },
};
