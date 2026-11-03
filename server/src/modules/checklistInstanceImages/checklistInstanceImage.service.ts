import path from "node:path";
import fs from "node:fs"
import { removeUploadedFile } from "../../utils/uploadFiles.js";
import { db } from "../../config/db.js";
import { checklistInstanceItems, checklistInstances, checklistInstanceImages, checklistInstanceAssignees } from "../../db/schema/index.js";
import { and, eq, gt, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { assertInstanceEditable } from "../checklistInstances/checklistInstance.service.js";
import { assertCanVerify, assertNotOwnRun, dropChecklistSummaries, getDepartmentIdsForUserIds } from "../checklistInstances/checklistInstanceShared.js";
import { assertCoordinatorRunReviewer } from "../checklistInstances/checklistCoordinatorRun.js";
import { checklistInstanceReviewers } from "../../db/schema/index.js";
import { FAILED_PHOTO_DELETE_MESSAGE, MAX_FAILED_PHOTOS, MAX_PASSING_PHOTOS, isFailedPhoto, passingPhotos, type PhotoReviewReason } from "./photoFailure.js";
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

        if (!wantsVideo) {
            const existing = await db.select().from(checklistInstanceImages)
                .where(and(eq(checklistInstanceImages.checklistInstanceItemId, item.id), eq(checklistInstanceImages.purpose, purpose)));
            const failedCount = existing.filter(isFailedPhoto).length;
            if (failedCount >= MAX_FAILED_PHOTOS) {
                files.forEach((f) => fs.unlink(f.path, () => {}));
                throw AppError.badRequest("Too many photos on this question did not pass the check. Ask your department head for help.");
            }
            const passingCount = passingPhotos(existing).length;
            const limit = purpose === "GENERAL" && item.maxImageCount != null ? Math.min(item.maxImageCount, MAX_PASSING_PHOTOS) : MAX_PASSING_PHOTOS;
            if (passingCount + files.length > limit) {
                files.forEach((f) => fs.unlink(f.path, () => {}));
                const remaining = Math.max(limit - passingCount, 0);
                throw AppError.badRequest(
                    remaining > 0
                        ? `This item allows at most ${limit} clear photo(s). Only ${remaining} more can be uploaded.`
                        : `This item already has the maximum of ${limit} clear photo(s).`,
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

        if (isFailedPhoto(image) && !isAdminOrPc(user.role)) {
            throw AppError.forbidden(FAILED_PHOTO_DELETE_MESSAGE);
        }

        await db.delete(checklistInstanceImages).where(eq(checklistInstanceImages.id, imageId));
        removeUploadedFile(image.url);
        await auditService.record({
            entityType: "ChecklistInstanceImage",
            entityId: imageId,
            action: "DELETE",
            actorId: user.sub,
            before: image,
        });
        return image;
    },

    async review(imageId: string, input: { action: "REJECT" | "ACCEPT"; reason?: PhotoReviewReason }, user: AccessTokenPayload) {
        const [image] = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.id, imageId)).limit(1);
        if (!image) throw AppError.notFound("Image not found");
        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, image.checklistInstanceItemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1);
        if (!instance) throw AppError.notFound("Checklist instance not found");
        if (instance.verificationStatus !== "PENDING_APPROVAL") {
            throw AppError.badRequest("Photos can only be reviewed while the checklist is waiting for approval.");
        }

        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, instance.id));
        const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, instance.id));
        await assertCanVerify(await getDepartmentIdsForUserIds(assigneeLinks.map((l) => l.userId)), reviewerLinks.map((l) => l.userId), user);
        assertNotOwnRun(assigneeLinks, user);
        await assertCoordinatorRunReviewer(instance.id, user);

        if (input.action === "REJECT" && !input.reason) throw AppError.badRequest("Say why the photo is rejected.");

        const now = new Date();
        const patch = input.action === "REJECT"
            ? { reviewStatus: "REJECTED" as const, reviewReason: input.reason ?? "OTHER", reviewedBy: user.sub, reviewedAt: now, updatedAt: now }
            : { reviewStatus: "ACCEPTED" as const, reviewReason: null, reviewedBy: user.sub, reviewedAt: now, updatedAt: now };
        await db.update(checklistInstanceImages).set(patch).where(eq(checklistInstanceImages.id, imageId));

        await auditService.record({
            entityType: "ChecklistInstanceImage",
            entityId: imageId,
            action: "UPDATE",
            actorId: user.sub,
            before: image,
            after: { ...image, ...patch },
        });
        await dropChecklistSummaries(assigneeLinks.map((l) => l.userId));

        const [updated] = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.id, imageId)).limit(1);
        return updated!;
    },
};
