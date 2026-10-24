import path from "node:path"
import fs from "node:fs"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskComments, taskCommentAttachments, taskAttachments, taskReviewers } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, asc, inArray, isNull, type SQL } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTaskCommentInput } from "./taskComment.validation.js"
import { isDepartmentHead } from "../tickets/ticketApproval.js"
import { isAdminOrPc } from "../../utils/roles.js"

const assertCanComment = async (user: AccessTokenPayload, task: typeof tasks.$inferSelect) => {
    if (isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER") return;
    if (task.userId === user.sub) return;
    if (task.assigneeId && task.assigneeId === user.sub) return;

    const additionalAssignees = await db.select({ userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.taskId, task.id));
    if (additionalAssignees.some((a) => a.userId === user.sub)) return;

    const headSeesAll = user.role === "MANAGER" || task.status === "pending_approval" || task.awaitingHeadApproval || task.declinedAt !== null;
    if (headSeesAll && isDepartmentHead(user, task)) return;

    const [reviewer] = await db.select({ id: taskReviewers.id }).from(taskReviewers)
        .where(and(eq(taskReviewers.taskId, task.id), eq(taskReviewers.userId, user.sub))).limit(1);
    if (reviewer) return;

    throw AppError.forbidden("You don't have access to this delegation's activity");
};

const findCommentsWithDetails = async (where: SQL) => {
    const rows = await db.select({
        comment: taskComments,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role },
    })
        .from(taskComments)
        .leftJoin(users, eq(taskComments.authorId, users.id))
        .where(where)
        .orderBy(asc(taskComments.createdAt));
    if (!rows.length) return [];

    const commentIds = rows.map((r) => r.comment.id);
    const attachmentRows = await db.select().from(taskCommentAttachments).where(inArray(taskCommentAttachments.commentId, commentIds));
    const attachmentsByComment = new Map<string, typeof attachmentRows>();
    for (const a of attachmentRows) {
        const list = attachmentsByComment.get(a.commentId) ?? [];
        list.push(a);
        attachmentsByComment.set(a.commentId, list);
    }

    return rows.map((r) => ({ ...r.comment, author: r.author, attachments: attachmentsByComment.get(r.comment.id) ?? [] }));
};

export const taskCommentService = {
    async list(taskId: string, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        await assertCanComment(user, task);

        return findCommentsWithDetails(eq(taskComments.taskId, taskId));
    },

    async create(taskId: string, input: CreateTaskCommentInput, files: Express.Multer.File[], user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw AppError.notFound("Delegation not found");
        }
        try {
            await assertCanComment(user, task);
        } catch (err) {
            files.forEach((f) => fs.unlink(f.path, () => {}));
            throw err;
        }

        const attachments = files.map((file) => ({
            url: `/uploads/task-comment-attachments/${path.basename(file.path)}`,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
        }));

        if (!input.body?.trim() && !attachments.length && !input.location) {
            throw AppError.badRequest("A comment needs text, an attachment, or a location.");
        }

        const commentId = createId();

        await db.transaction(async (tx) => {
            await tx.insert(taskComments).values({
                id: commentId,
                taskId: task.id,
                authorId: user.sub,
                body: input.body?.trim() ?? "",
                locationLat: input.location?.lat ?? null,
                locationLng: input.location?.lng ?? null,
                locationLabel: input.location?.label ?? null,
            });

            if (attachments.length) {
                await tx.insert(taskCommentAttachments).values(
                    attachments.map((a) => ({ ...a, commentId })),
                );

                await tx.insert(taskAttachments).values(
                    attachments.map((a) => ({ ...a, taskId: task.id, uploadedBy: user.sub })),
                );
            }
        });

        const helpers = (await db.select({ userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, task.id))).map((r) => r.userId);
        await notifySafely(() => notificationService.notifyCommentAdded({ _id: task.id, title: task.title, participantIds: [task.assigneeId, task.userId, ...helpers] }, "TASK", user.sub));

        const [comment] = await findCommentsWithDetails(eq(taskComments.id, commentId));
        return comment!;
    },
};
