import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { checklistInstanceItems, checklistInstances, checklistInstanceImages, checklistInstanceAssignees } from "../../db/schema/index.js";
import { and, eq, gt, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertInstanceEditable } from "../checklistInstances/checklistInstance.service.js";
import { assertRunOpenForUser } from "../checklistInstances/checklistMissedRun.js";
import { auditService } from "../audit/audit.service.js";
import { isAdminOrPc } from "../../utils/roles.js"
import { perceptualHash } from "../../utils/imageHash.js"
import { assessImageQuality, serializeQualityFlags } from "../../utils/imageQuality.js"
import { findEarlierSimilar } from "./imageSimilarity.js"

const RETRY_WINDOW_MS = 10 * 60_000

const MAX_FUTURE_MS = 5 * 60_000

const parseTakenAt = (raw: string | undefined): Date | null => {
    if (!raw) return null
    const at = new Date(raw)
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + MAX_FUTURE_MS) return null
    return at
}

const assertCanUpload = async (user: AccessTokenPayload, item: { instanceId: string }) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1);
    if (!instance) throw AppError.notFound("Checklist instance not found");
    assertInstanceEditable(instance, user);
    await assertRunOpenForUser(instance.id, user);
    if (isAdminOrPc(user.role)) return;
    const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId })
        .from(checklistInstanceAssignees)
        .where(eq(checklistInstanceAssignees.instanceId, instance.id));
    if (assigneeLinks.some((l) => l.userId === user.sub)) return;
    throw AppError.forbidden("Only an assignee of this checklist can upload evidence for it");
};

export const checklistInstanceImageService = {
    async upload(itemId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", purpose: "GENERAL" | "CONDITIONAL_YES" | "CONDITIONAL_NO", user: AccessTokenPayload, takenAt: string[] = []) {
        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanUpload(user, item);

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)");
        }

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

        if (purpose !== "GENERAL") {
            const forAnswer = purpose === "CONDITIONAL_YES" ? item.yesActions : item.noActions;
            if (!(forAnswer ?? []).includes("REQUIRE_PHOTO")) {
                files.forEach((f) => fs.unlink(f.path, () => {}));
                throw AppError.badRequest("This answer does not ask for a photo");
            }
        }

        if (item.maxImageCount != null && purpose === "GENERAL") {
            const existing = await db.select({ id: checklistInstanceImages.id })
                .from(checklistInstanceImages)
                .where(and(eq(checklistInstanceImages.checklistInstanceItemId, item.id), eq(checklistInstanceImages.purpose, "GENERAL")));
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

        const [fileHashes, fileQualities] = await Promise.all([
            Promise.all(files.map((file) => (file.mimetype.startsWith("image/") ? perceptualHash(file.path) : Promise.resolve(null)))),
            Promise.all(files.map((file) => (file.mimetype.startsWith("image/") ? assessImageQuality(file.path) : Promise.resolve(null)))),
        ]);

        const knownHashes = fileHashes.filter((h): h is string => !!h);
        const alreadySaved = knownHashes.length
            ? await db.select().from(checklistInstanceImages).where(and(
                eq(checklistInstanceImages.checklistInstanceItemId, item.id),
                eq(checklistInstanceImages.uploadedBy, user.sub),
                eq(checklistInstanceImages.purpose, purpose),
                inArray(checklistInstanceImages.contentHash, knownHashes),
                gt(checklistInstanceImages.createdAt, new Date(Date.now() - RETRY_WINDOW_MS)),
            ))
            : [];
        const savedHashes = new Set(alreadySaved.map((img) => img.contentHash));
        const fresh = files.map((file, index) => ({ file, hash: fileHashes[index] ?? null, quality: fileQualities[index] ?? null, takenAt: takenAt[index] }))
            .filter((entry) => {
                const repeated = !!entry.hash && savedHashes.has(entry.hash);
                if (repeated) fs.unlink(entry.file.path, () => {});
                return !repeated;
            });
        if (fresh.length === 0) return alreadySaved;

        const similar = await Promise.all(fresh.map((entry) => (entry.hash ? findEarlierSimilar(entry.hash, item.id) : Promise.resolve(null))));
        const rows = fresh.map(({ file, hash, quality, takenAt: taken }, index) => ({
            id: createId(),
            url: `/uploads/checklist-instances/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod,
            purpose,
            contentHash: hash,
            similarToId: similar[index] ?? null,
            qualityFlags: serializeQualityFlags(quality),
            takenAt: parseTakenAt(taken),
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
        if (!item && !isAdminOrPc(user.role) && image.uploadedBy !== user.sub) {
            throw AppError.forbidden("Only an assignee of this checklist can upload evidence for it");
        }

        if (item?.isDone) {
            throw AppError.badRequest("This item is already done — reopen it first to change its evidence");
        }

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
