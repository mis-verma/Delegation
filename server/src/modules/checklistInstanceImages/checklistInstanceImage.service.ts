import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { checklistInstanceItems, checklistInstances, checklistInstanceImages, checklistInstanceAssignees } from "../../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertInstanceEditable } from "../checklistInstances/checklistInstance.service.js";
import { assertRunOpenForUser } from "../checklistInstances/checklistMissedRun.js";
import { auditService } from "../audit/audit.service.js";

const assertCanUpload = async (user: AccessTokenPayload, item: { instanceId: string }) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1);
    if (!instance) throw AppError.notFound("Checklist instance not found");
    // Same approval lock as setItemDone — evidence on an approved run can't be added or removed.
    assertInstanceEditable(instance, user);
    await assertRunOpenForUser(instance.id, user);
    if (user.role === "ADMIN" || user.role === "PC") return;
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId })
        .from(checklistInstanceAssignees)
        .where(eq(checklistInstanceAssignees.instanceId, instance.id));
    if (assigneeLinks.some((l) => l.userId === user.sub)) return;
    throw AppError.forbidden("Only an assignee of this checklist can upload evidence for it");
};

export const checklistInstanceImageService = {
    async upload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanUpload(user, item);

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

        // The upload filter accepts images and videos for every item, so a photo used to satisfy
        // a video question and a video a photo question. Each item now only takes its own kind.
        const wantsVideo = item.itemType === "VIDEO_UPLOAD";
        const wrongKind = files.filter((f) => wantsVideo ? !f.mimetype.startsWith("video/") : !f.mimetype.startsWith("image/"));
        if (wrongKind.length) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.badRequest(wantsVideo ? "This item needs a video, not a photo" : "This item needs a photo, not a video");
        }

        if (item.isDone) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.badRequest("This item is already done — reopen it first to change its evidence");
        }

        if (item.requiresLivePhoto && captureMethod !== "LIVE") {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.badRequest("This item requires a live camera photo, not a gallery upload");
        }

        if (item.maxImageCount != null) {
            const existing = await db.select({ id: checklistInstanceImages.id })
                .from(checklistInstanceImages)
                .where(eq(checklistInstanceImages.checklistInstanceItemId, item.id));
            const existingCount = existing.length;
            if (existingCount + files.length > item.maxImageCount) {
                files.forEach((f) => fs.unlink(f.path, () => {}));
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
            url: `/uploads/checklist-instances/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod,
            checklistInstanceItemId: item.id,
            uploadedBy: user.sub,
        }));
        await db.insert(checklistInstanceImages).values(rows);
        return db.select().from(checklistInstanceImages).where(inArray(checklistInstanceImages.id, rows.map((r) => r.id)));
    },

    async remove(imageId: string, user: AccessTokenPayload) {
        const [image] = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.id, imageId)).limit(1);
        if (!image) throw AppError.notFound("Image not found");

        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, image.checklistInstanceItemId)).limit(1);
        if (item) await assertCanUpload(user, item);
        if (!item && user.role !== "ADMIN" && user.role !== "PC" && image.uploadedBy !== user.sub) {
            throw AppError.forbidden("Only an assignee of this checklist can upload evidence for it");
        }

        // Evidence on a completed item stays put — removing it used to leave the item "done" with
        // its proof gone. Reopen the item first to swap a photo.
        if (item?.isDone) {
            throw AppError.badRequest("This item is already done — reopen it first to change its evidence");
        }

        // The file is deliberately left on disk (only the row goes), and the removal is logged
        // with the file's URL — a deleted photo used to be unrecoverable.
        await db.delete(checklistInstanceImages).where(eq(checklistInstanceImages.id, imageId));
        await auditService.record({
            entityType: "ChecklistInstanceImage",
            entityId: imageId,
            action: "DELETE",
            actorId: user.sub,
            before: image,
        });
        return image;
    },
};
