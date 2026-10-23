import { db } from "../../config/db.js"
import { tasks, taskChecklists, taskChecklistItems, taskImages, checklistTemplates, checklistTemplateItems } from "../../db/schema/index.js"
import { eq, and, asc, inArray, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTaskChecklistInput, UpdateTaskChecklistItemInput } from "./taskChecklist.validation.js"
import { assertCanWorkChecklistItem, assertChecklistOpenForWork, assertTaskStateAllowsChecklistWork, taskChecklistWorkerIds } from "../../utils/checklistItemWorkers.js"

export const deriveChecklistItemCompletion = (isDone: boolean): { completedAt: Date | null } => ({
    completedAt: isDone ? new Date() : null,
});

const assertCanManage = (user: AccessTokenPayload, task: { userId: string; status: string; declinedAt: Date | null; awaitingHeadApproval: boolean }) => {
    assertTaskStateAllowsChecklistWork(task, user, { managing: true });
    if (user.role === "ADMIN" || user.role === "PC") return;
    if (task.userId === user.sub) return;
    throw AppError.forbidden("Only the delegation owner can manage its checklists");
};

const assertCanComplete = (user: AccessTokenPayload, item: { assigneeId: string | null; taskChecklistId: string }) =>
    assertCanWorkChecklistItem(user, item, () => taskChecklistWorkerIds(item.taskChecklistId), "Only the assigned person can complete this item");

const findChecklistWithItems = async (checklistId: string) => {
    const [checklist] = await db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId)).limit(1);
    if (!checklist) return undefined;

    const items = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.taskChecklistId, checklistId));
    const itemIds = items.map((i) => i.id);
    const images = itemIds.length
        ? await db.select().from(taskImages).where(inArray(taskImages.taskChecklistItemId, itemIds))
        : [];
    const imagesByItem = new Map<string, typeof images>();
    for (const img of images) {
        const list = imagesByItem.get(img.taskChecklistItemId) ?? [];
        list.push(img);
        imagesByItem.set(img.taskChecklistItemId, list);
    }

    return { ...checklist, items: items.map((item) => ({ ...item, images: imagesByItem.get(item.id) ?? [] })) };
};

export const taskChecklistService = {
    async createForTask(taskId: string, input: CreateTaskChecklistInput, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const checklistId = createId();
        await db.transaction(async (tx) => {
            await tx.insert(taskChecklists).values({ id: checklistId, title: input.title, taskId });

            if (input.items?.length) {
                await tx.insert(taskChecklistItems).values(input.items.map((item) => ({
                    label: item.label,
                    assigneeId: item.assigneeId ?? null,
                    dueAt: item.dueAt ? new Date(item.dueAt) : undefined,
                    requiredImageCount: item.requiredImageCount,
                    maxImageCount: item.maxImageCount,
                    requiresLivePhoto: item.requiresLivePhoto,
                    remarks: item.remarks,
                    taskChecklistId: checklistId,
                })));
            }
        });

        return findChecklistWithItems(checklistId);
    },

    async createFromTemplate(taskId: string, templateId: string, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const [template] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, templateId), isNull(checklistTemplates.deletedAt))).limit(1);
        if (!template) throw AppError.notFound("Checklist template not found");
        if (template.appliesTo !== "TASK") throw AppError.badRequest("This template applies to tickets, not delegations");

        const templateItems = await db.select().from(checklistTemplateItems)
            .where(eq(checklistTemplateItems.templateId, templateId))
            .orderBy(asc(checklistTemplateItems.order));

        const checklistId = createId();
        await db.transaction(async (tx) => {
            await tx.insert(taskChecklists).values({ id: checklistId, title: template.name, taskId });

            if (templateItems.length) {
                await tx.insert(taskChecklistItems).values(templateItems.map((item) => ({
                    label: item.label,
                    requiredImageCount: item.requiredImageCount,
                    maxImageCount: item.maxImageCount,
                    requiresLivePhoto: item.requiresLivePhoto,
                    assigneeId: item.defaultAssigneeId,
                    taskChecklistId: checklistId,
                })));
            }
        });

        return findChecklistWithItems(checklistId);
    },

    async updateItem(itemId: string, input: UpdateTaskChecklistItemInput, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");

        const [checklist] = await db.select().from(taskChecklists).where(eq(taskChecklists.id, item.taskChecklistId)).limit(1);
        const [task] = checklist ? await db.select().from(tasks).where(and(eq(tasks.id, checklist.taskId), isNull(tasks.deletedAt))).limit(1) : [];
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const { dueAt, isDone, ...rest } = input;
        const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (dueAt !== undefined) update.dueAt = dueAt ? new Date(dueAt) : null;
        if (isDone !== undefined) Object.assign(update, { isDone, ...deriveChecklistItemCompletion(isDone) });

        await db.update(taskChecklistItems).set(update).where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    async completeItem(itemId: string, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanComplete(user, item);
        await assertChecklistOpenForWork(user, item.taskChecklistId);

        const images = await db.select().from(taskImages).where(eq(taskImages.taskChecklistItemId, item.id));

        const qualifyingImages = item.requiresLivePhoto
            ? images.filter((img) => img.captureMethod === "LIVE")
            : images;

        if (qualifyingImages.length < item.requiredImageCount) {
            const missing = item.requiredImageCount - qualifyingImages.length;
            const kind = item.requiresLivePhoto ? "live photo(s)" : "photo(s)";
            throw AppError.badRequest(`Upload ${missing} more ${kind} before this item can be marked complete`);
        }

        await db.update(taskChecklistItems)
            .set({ isDone: true, ...deriveChecklistItemCompletion(true), updatedAt: new Date() })
            .where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    async updateRemarks(itemId: string, remarks: string, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanComplete(user, item);
        await assertChecklistOpenForWork(user, item.taskChecklistId);

        await db.update(taskChecklistItems).set({ remarks, updatedAt: new Date() }).where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    async removeChecklist(checklistId: string, user: AccessTokenPayload) {
        const [checklist] = await db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId)).limit(1);
        if (!checklist) throw AppError.notFound("Checklist not found");
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, checklist.taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const items = await db.select({ id: taskChecklistItems.id }).from(taskChecklistItems)
            .where(eq(taskChecklistItems.taskChecklistId, checklist.id));
        const itemIds = items.map((i) => i.id);

        await db.transaction(async (tx) => {
            for (const itemId of itemIds) {
                await tx.delete(taskImages).where(eq(taskImages.taskChecklistItemId, itemId));
            }
            await tx.delete(taskChecklistItems).where(eq(taskChecklistItems.taskChecklistId, checklist.id));
            await tx.delete(taskChecklists).where(eq(taskChecklists.id, checklist.id));
        });

        return checklist;
    },

    async removeItem(itemId: string, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        const [checklist] = await db.select().from(taskChecklists).where(eq(taskChecklists.id, item.taskChecklistId)).limit(1);
        const [task] = checklist ? await db.select().from(tasks).where(and(eq(tasks.id, checklist.taskId), isNull(tasks.deletedAt))).limit(1) : [];
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        await db.transaction(async (tx) => {
            await tx.delete(taskImages).where(eq(taskImages.taskChecklistItemId, item.id));
            await tx.delete(taskChecklistItems).where(eq(taskChecklistItems.id, item.id));
        });

        return item;
    },
};
