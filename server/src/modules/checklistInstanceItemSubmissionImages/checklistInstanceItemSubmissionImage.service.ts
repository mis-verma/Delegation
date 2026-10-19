import path from "node:path"
import fs from "node:fs"
import { db } from "../../config/db.js"
import { checklistInstanceItemSubmissions, checklistInstanceItemSubmissionImages, checklistInstanceItems } from "../../db/schema/index.js"
import { eq, inArray } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { assertCanAccess, assertSubmissionRunEditable } from "../checklistInstanceItemSubmissions/checklistInstanceItemSubmission.service.js"
import { auditService } from "../audit/audit.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

const UPLOAD_DIR = "checklist-instance-submissions"

const discardFiles = (files: Express.Multer.File[]) => files.forEach((f) => fs.unlink(f.path, () => {}))

export const checklistInstanceItemSubmissionImageService = {
    async upload(submissionId: string, files: Express.Multer.File[], captureMethod: "LIVE" | "GALLERY", user: AccessTokenPayload) {
        const [submission] = await db.select().from(checklistInstanceItemSubmissions).where(eq(checklistInstanceItemSubmissions.id, submissionId)).limit(1)
        if (!submission) throw AppError.notFound("Submission not found")

        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, submission.itemId)).limit(1)
        if (!item) throw AppError.notFound("Checklist item not found")
        await assertCanAccess(item.instanceId, user)
        await assertSubmissionRunEditable(item.instanceId, user)

        if (submission.isDone) {
            discardFiles(files)
            throw AppError.badRequest("Reopen this submission before changing its photos")
        }

        if (!files.length) {
            throw AppError.badRequest("No valid image files were received (check file type and size)")
        }

        if (item.requiresLivePhoto && captureMethod !== "LIVE") {
            discardFiles(files)
            throw AppError.badRequest("This item requires a live camera photo, not a gallery upload")
        }

        if (item.maxImageCount != null) {
            const existing = await db.select({ id: checklistInstanceItemSubmissionImages.id })
                .from(checklistInstanceItemSubmissionImages)
                .where(eq(checklistInstanceItemSubmissionImages.submissionId, submission.id))
            const existingCount = existing.length
            if (existingCount + files.length > item.maxImageCount) {
                discardFiles(files)
                const remaining = Math.max(item.maxImageCount - existingCount, 0)
                throw AppError.badRequest(
                    remaining > 0
                        ? `This item allows at most ${item.maxImageCount} photo(s) — only ${remaining} more can be uploaded`
                        : `This item already has the maximum of ${item.maxImageCount} photo(s)`,
                )
            }
        }

        const rows = files.map((file) => ({
            id: createId(),
            url: `/uploads/${UPLOAD_DIR}/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            captureMethod,
            submissionId: submission.id,
            uploadedBy: user.sub,
        }))
        await db.insert(checklistInstanceItemSubmissionImages).values(rows)
        return db.select().from(checklistInstanceItemSubmissionImages).where(inArray(checklistInstanceItemSubmissionImages.id, rows.map((r) => r.id)))
    },

    async remove(imageId: string, user: AccessTokenPayload) {
        const [image] = await db.select().from(checklistInstanceItemSubmissionImages).where(eq(checklistInstanceItemSubmissionImages.id, imageId)).limit(1)
        if (!image) throw AppError.notFound("Image not found")

        const [submission] = await db.select().from(checklistInstanceItemSubmissions).where(eq(checklistInstanceItemSubmissions.id, image.submissionId)).limit(1)
        if (submission) {
            const [item] = await db.select({ instanceId: checklistInstanceItems.instanceId }).from(checklistInstanceItems).where(eq(checklistInstanceItems.id, submission.itemId)).limit(1)
            if (!item) throw AppError.notFound("Checklist item not found")
            await assertCanAccess(item.instanceId, user)
            if (submission.isDone) throw AppError.badRequest("Reopen this submission before changing its photos")
            await assertSubmissionRunEditable(item.instanceId, user)
        }

        await db.delete(checklistInstanceItemSubmissionImages).where(eq(checklistInstanceItemSubmissionImages.id, imageId))
        await auditService.record({
            entityType: "ChecklistInstanceItemSubmissionImage",
            entityId: imageId,
            action: "DELETE",
            actorId: user.sub,
            before: image,
        })
        return image
    },
}
