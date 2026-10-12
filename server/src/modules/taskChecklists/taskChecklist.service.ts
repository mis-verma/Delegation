import { db } from "../../config/db.js"
import { tasks, taskChecklists, taskChecklistItems, taskImages, checklistTemplates, checklistTemplateItems } from "../../db/schema/index.js"
import { eq, and, asc, inArray, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateTaskChecklistInput, UpdateTaskChecklistItemInput } from "./taskChecklist.validation.js"
import { assertCanWorkChecklistItem, taskChecklistWorkerIds } from "../../utils/checklistItemWorkers.js"

// Replaces a Mongoose pre('save') hook that used to live on the TaskChecklistItem model: kept
// `completedAt` in sync every time `isDone` changed. Now that there's no hook, every service
// method that flips `isDone` must call this explicitly before writing the row.
export const deriveChecklistItemCompletion = (isDone: boolean): { completedAt: Date | null } => ({
    completedAt: isDone ? new Date() : null,
});

// Who's allowed to change a checklist's STRUCTURE — create/edit/delete checklists and items,
// change photo requirements, reassign items: the task's owner, or an admin. This is deliberately
// a different permission than "who can complete an item" below — managing the work is not the
// same thing as doing the work.
const assertCanManage = (user: AccessTokenPayload, task: { userId: string }) => {
    if (user.role === "ADMIN" || user.role === "PC") return;
    if (task.userId === user.sub) return;
    throw AppError.forbidden("Only the delegation owner can manage its checklists");
};

// Who's allowed to mark a specific item complete or write its remark: the item's assignee, or the
// delegation's own assignees when the item has nobody on it, or an admin (see checklistItemWorkers).
// Not the task owner automatically (unless they're also doing it): completion is about who did the work.
const assertCanComplete = (user: AccessTokenPayload, item: { assigneeId: string | null; taskChecklistId: string }) =>
    assertCanWorkChecklistItem(user, item, () => taskChecklistWorkerIds(item.taskChecklistId), "Only the assigned person can complete this item");

// Populate helper: expands a checklist's items, and each item's uploaded images, so one API
// call gives the frontend everything it needs instead of several round trips.
//
// NOTE: this is assembled by hand with plain `db.select()` calls rather than Drizzle's
// relational query API (`db.query...with:{...}`) — that API always compiles "many" relations
// into a `LEFT JOIN LATERAL (...)` subquery, and the real MariaDB 10.11 this app runs against
// doesn't support LATERAL joins at all (confirmed against the local instance). See task.service.ts
// for the same note in more detail.
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
    // Create a new checklist under a task, optionally seeded with items right away — each item
    // can carry its own assigneeId/dueDate/photo requirements from the moment it's created.
    async createForTask(taskId: string, input: CreateTaskChecklistInput, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const checklistId = createId();
        // wrapped in a transaction (source had none)
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

    // Stamp out a real checklist under this task from a reusable, admin-authored template —
    // same result as createForTask, just sourced from ChecklistTemplate/ChecklistTemplateItem
    // instead of hand-typed input. dueAt is left unset (templates don't carry it); assigneeId is
    // seeded from the template item's defaultAssigneeId when set — an admin can still change it
    // afterwards through the normal updateItem action.
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
        // wrapped in a transaction (source had none)
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

    // Update an existing item's metadata (label, assignee, due date, photo requirements, or
    // reopen it with isDone: false). Marking it DONE is a separate action — see completeItem.
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
        // Reopening (isDone: false is the only value this schema allows) keeps completedAt in
        // sync the same way completeItem's isDone:true does (see deriveChecklistItemCompletion).
        if (isDone !== undefined) Object.assign(update, { isDone, ...deriveChecklistItemCompletion(isDone) });

        await db.update(taskChecklistItems).set(update).where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    // THE key method: the one place in the whole app that decides "yes, this checklist item is
    // genuinely done." It checks the actual uploaded TaskImage records against the item's own
    // requirements — it never trusts the client to have counted correctly, because the client
    // isn't a trusted source of truth (see the earlier note on why isDone:true isn't a plain
    // field update).
    async completeItem(itemId: string, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanComplete(user, item);

        const images = await db.select().from(taskImages).where(eq(taskImages.taskChecklistItemId, item.id));

        // If a live photo is required, only images actually captured live count toward the
        // requirement — a gallery photo uploaded when live was mandatory doesn't satisfy it,
        // even if the total image count would otherwise be enough.
        const qualifyingImages = item.requiresLivePhoto
            ? images.filter((img) => img.captureMethod === "LIVE")
            : images;

        if (qualifyingImages.length < item.requiredImageCount) {
            const missing = item.requiredImageCount - qualifyingImages.length;
            const kind = item.requiresLivePhoto ? "live photo(s)" : "photo(s)";
            throw AppError.badRequest(`Upload ${missing} more ${kind} before this item can be marked complete`);
        }

        // Was `item.isDone = true; await item.save()`, relying on the model's pre('save') hook to
        // stamp completedAt automatically — that hook is now this explicit helper call.
        await db.update(taskChecklistItems)
            .set({ isDone: true, ...deriveChecklistItemCompletion(true), updatedAt: new Date() })
            .where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    // Set the item's remarks — free text the assignee writes about their own work on this item.
    // Uses assertCanComplete (assignee-or-admin), NOT assertCanManage, because this is the person
    // doing the work describing what they did, not a structural change to the item's definition.
    async updateRemarks(itemId: string, remarks: string, user: AccessTokenPayload) {
        const [item] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        if (!item) throw AppError.notFound("Checklist item not found");
        await assertCanComplete(user, item);

        await db.update(taskChecklistItems).set({ remarks, updatedAt: new Date() }).where(eq(taskChecklistItems.id, itemId));

        const [updated] = await db.select().from(taskChecklistItems).where(eq(taskChecklistItems.id, itemId)).limit(1);
        return updated!;
    },

    // Delete a whole checklist and everything under it. MySQL doesn't cascade these deletes (no
    // ON DELETE CASCADE declared on these FKs), so this has to happen manually, in order: images
    // first, then items, then the checklist itself.
    async removeChecklist(checklistId: string, user: AccessTokenPayload) {
        const [checklist] = await db.select().from(taskChecklists).where(eq(taskChecklists.id, checklistId)).limit(1);
        if (!checklist) throw AppError.notFound("Checklist not found");
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, checklist.taskId), isNull(tasks.deletedAt))).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        assertCanManage(user, task);

        const items = await db.select({ id: taskChecklistItems.id }).from(taskChecklistItems)
            .where(eq(taskChecklistItems.taskChecklistId, checklist.id));
        const itemIds = items.map((i) => i.id);

        // wrapped in a transaction (source had none)
        await db.transaction(async (tx) => {
            // This deletes the image RECORDS in the database. The actual files sitting on disk get
            // cleaned up separately, by the upload module — keeping "delete the DB row" and "delete
            // the real file" as two distinct steps is intentional (different failure modes, different
            // owners), not something forgotten. We'll wire that part up soon.
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

        // wrapped in a transaction (source had none)
        await db.transaction(async (tx) => {
            await tx.delete(taskImages).where(eq(taskImages.taskChecklistItemId, item.id));
            await tx.delete(taskChecklistItems).where(eq(taskChecklistItems.id, item.id));
        });

        return item;
    },
};
