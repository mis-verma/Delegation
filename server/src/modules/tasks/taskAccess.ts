import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskReviewers } from "../../db/schema/index.js"
import { eq, and, or, inArray, isNull, isNotNull } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { UpdateTaskInput } from "./task.validation.js"
import { canApproveAtStage, type ApprovalStage } from "../tickets/ticketApproval.js"
import { isAdminOrPc, isOwnScopeRole } from "../../utils/roles.js"

export const selfAndDepartmentCondition = (user: AccessTokenPayload) =>
    or(eq(tasks.userId, user.sub), eq(tasks.assigneeId, user.sub));

export const NOT_DELETED = isNull(tasks.deletedAt);

export const additionalAssigneeTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskAdditionalAssignees.taskId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.userId, userId));
    return rows.map((r) => r.taskId);
};

export const reviewerTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskReviewers.taskId })
        .from(taskReviewers)
        .where(eq(taskReviewers.userId, userId));
    return rows.map((r) => r.taskId);
};

export const buildVisibilityCondition = async (user: AccessTokenPayload) => {
    if (isAdminOrPc(user.role) || user.role === "APPROVAL_MANAGER") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    const selfCondition = additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);

    const reviewedIds = await reviewerTaskIds(user.sub);
    const withReviewer = reviewedIds.length
        ? or(selfCondition, inArray(tasks.id, reviewedIds))
        : selfCondition;

    if (user.role === "MANAGER" && user.departmentId) {
        return or(eq(tasks.departmentId, user.departmentId), withReviewer);
    }

    if (user.role === "SENIOR" && user.departmentId) {
        return or(and(eq(tasks.departmentId, user.departmentId), or(eq(tasks.status, "pending_approval"), eq(tasks.awaitingHeadApproval, true), isNotNull(tasks.declinedAt))), withReviewer);
    }

    return withReviewer;
};

export const assertCanVerify = async (
    task: { id: string; departmentId: string | null; assigneeId: string | null; userId: string; approvalStage: ApprovalStage | null },
    user: AccessTokenPayload,
) => {
    if (user.role !== "ADMIN") {
        const additional = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, task.id))).map((r) => r.userId);
        if (task.assigneeId === user.sub || additional.includes(user.sub)) {
            throw AppError.forbidden("You can't approve a delegation assigned to you. Someone else has to review it.");
        }
    }
    const stage: ApprovalStage = task.approvalStage ?? "PC";
    const [reviewer] = stage === "PC"
        ? await db.select({ id: taskReviewers.id })
            .from(taskReviewers)
            .where(and(eq(taskReviewers.taskId, task.id), eq(taskReviewers.userId, user.sub)))
            .limit(1)
        : [];
    if (canApproveAtStage(stage, task, user, !!reviewer)) return;
    throw AppError.forbidden(stage === "HOD" ? "This delegation is waiting for the department head to approve first." : "This delegation is waiting for the PC to give the final approval.");
};

export const buildMutationCondition = async (user: AccessTokenPayload) => {
    if (isAdminOrPc(user.role)) return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    return additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);
};

export const assertCanSetReviewers = (reviewerIds: string[] | undefined, user: AccessTokenPayload) => {
    if (reviewerIds === undefined) return;
    if (!isAdminOrPc(user.role)) {
        throw AppError.forbidden("Only an admin or PC can choose who reviews a delegation.");
    }
};

export const FRONT_LINE_CONTENT_FIELDS = [
    "title", "description", "priority", "startDate", "dueDate", "reminderMinutesBefore", "reminderChannel",
    "projectId", "additionalAssigneeIds", "tagIds",
] as const;
export const assertFrontLineCanEdit = (
    existing: { userId: string; assigneeId: string | null; status: string },
    isAdditionalAssignee: boolean,
    input: UpdateTaskInput,
    user: AccessTokenPayload,
) => {
    if (!isOwnScopeRole(user.role)) return;
    const touchesContent = FRONT_LINE_CONTENT_FIELDS.some((field) => input[field] !== undefined);
    if (!touchesContent) return;
    const isCreator = existing.userId === user.sub;
    const isAssignee = existing.assigneeId === user.sub || isAdditionalAssignee;
    if (isCreator && (existing.status === "draft" || !isAssignee)) return;
    throw AppError.forbidden("You can update the status of this delegation, not its details. Ask the person who gave it to you.");
};

export const NOT_GATED = and(eq(tasks.awaitingHeadApproval, false), isNull(tasks.declinedAt));
