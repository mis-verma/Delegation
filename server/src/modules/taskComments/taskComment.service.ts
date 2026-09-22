import path from "node:path"
import fs from "node:fs"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskComments, taskCommentAttachments, taskAttachments } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, asc, inArray, isNull, type SQL } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTaskCommentInput } from "./taskComment.validation.js"

// Who can view/post to a task's activity feed — same circle as task attachments (creator,
// assignee, or Admin): general collaboration context, not gated to one specific role.
const assertCanComment = async (user: AccessTokenPayload, task: { userId: string; assigneeId: string | null; id: string }) => {
    if (user.role === "ADMIN" || user.role === "PC") return;
    if (task.userId === user.sub) return;
    if (task.assigneeId && task.assigneeId === user.sub) return;

    const additionalAssignees = await db.select({ userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.taskId, task.id));
    if (additionalAssignees.some((a) => a.userId === user.sub)) return;

    throw AppError.forbidden("You don't have access to this delegation's activity");
};

// Populate helper: expands each comment's author (a regular join — no LATERAL needed for a "one"
// relation) and its attachments (a batched `inArray` query, assembled by hand).
//
// NOTE: not using Drizzle's relational query API (`db.query...with:{...}`) here — that API always
// compiles "many" relations (like `attachments`) into a `LEFT JOIN LATERAL (...)` subquery, and
// the real MariaDB 10.11 this app runs against doesn't support LATERAL joins at all (confirmed
// against the local instance). See task.service.ts for the same note in more detail.
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
        // Multer's already written these to disk by the time this runs — every throw below must
        // clean them up first, or a caller with no access to the task can repeatedly fill disk by
        // commenting on tasks they'll always get rejected on (same pattern as checklistImage.service).
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

        // wrapped in a transaction (source had none) — the comment, its attachment rows, and the
        // mirrored TaskAttachment rows all need to succeed or fail together.
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

                // Mirror any files into the task's top-level attachment pool too — TaskCard/TaskRow's
                // Kanban/list cover-photo thumbnail reads Task.attachments, not comment attachments, so
                // without this a file shared in a comment would never surface anywhere but the thread.
                await tx.insert(taskAttachments).values(
                    attachments.map((a) => ({ ...a, taskId: task.id, uploadedBy: user.sub })),
                );
            }
        });

        const [comment] = await findCommentsWithDetails(eq(taskComments.id, commentId));
        return comment!;
    },
};
