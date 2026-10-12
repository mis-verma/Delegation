import { createId } from '@paralleldrive/cuid2';
import { db } from '../../config/db.js';
import {
  checklists,
  checklistItems,
  checklistImages,
  checklistTemplates,
  checklistTemplateItems,
  tickets,
} from '../../db/schema/index.js';
import { eq, and, asc, inArray, isNull } from 'drizzle-orm';
// A helper for throwing consistent, HTTP-status-aware errors (e.g. 404 "not found").
import { AppError } from '../../utils/AppError.js';
// Sends a real-time event (e.g. over websockets) so connected clients update live.
import { emitTicketEvent } from '../../sockets/ticketEvent.js';
// Types describing the shape of validated input for creating a checklist / updating an item.
import type { CreateChecklistInput, UpdateChecklistItemInput } from './checklist.validation.js';
import type { AccessTokenPayload } from '../../middleware/auth/auth.js';
import { assertCanWorkChecklistItem, ticketChecklistWorkerIds } from '../../utils/checklistItemWorkers.js';

type ChecklistItemRow = typeof checklistItems.$inferSelect;

// Kept in sync with isDone by this helper (was a Mongoose pre('save') hook on ChecklistItem —
// see src/models/ChecklistItem.ts). Call this explicitly whenever isDone is set/changed.
const deriveChecklistItemCompletion = (isDone: boolean): { isDone: boolean; completedAt: Date | null } => ({
  isDone,
  completedAt: isDone ? new Date() : null,
});

// Not using Drizzle's relational query API (`db.query...with:{...}`) here — that API compiles
// every relation into a `LEFT JOIN LATERAL (...)` subquery, and the actual database this app
// runs against (MariaDB 10.11) doesn't support LATERAL joins at all (confirmed against the real
// local instance). Plain selects assembled by hand in JS instead — same pattern as
// task.service.ts/ticket.service.ts.
const getChecklistWithItems = async (id: string) => {
  const [checklist] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
  if (!checklist) return undefined;
  const items = await db.select().from(checklistItems).where(eq(checklistItems.checklistId, id));
  const itemIds = items.map((i) => i.id);
  const images = itemIds.length ? await db.select().from(checklistImages).where(inArray(checklistImages.checklistItemId, itemIds)) : [];
  const imagesByItem = new Map<string, typeof images>();
  for (const img of images) {
    const list = imagesByItem.get(img.checklistItemId) ?? [];
    list.push(img);
    imagesByItem.set(img.checklistItemId, list);
  }
  return { ...checklist, items: items.map((i) => ({ ...i, images: imagesByItem.get(i.id) ?? [] })) };
};

// Who's allowed to change a checklist's STRUCTURE — create/edit/delete checklists and items,
// change photo requirements, reassign items: the ticket's raiser, or an admin. Same split as
// the Task side (taskChecklist.service.ts) — managing the work isn't the same as doing it.
const assertCanManage = (user: AccessTokenPayload, ticket: { userId: string }) => {
  if (user.role === 'ADMIN' || user.role === 'PC') return;
  if (ticket.userId === user.sub) return;
  throw AppError.forbidden('Only the ticket owner can manage its checklists');
};

// Who's allowed to mark a specific item complete or write its remark: the item's assignee, or the
// ticket's assignee when the item has nobody on it, or an admin (see checklistItemWorkers).
const assertCanComplete = (user: AccessTokenPayload, item: Pick<ChecklistItemRow, 'assigneeId' | 'checklistId'>) =>
  assertCanWorkChecklistItem(user, item, () => ticketChecklistWorkerIds(item.checklistId), 'Only the assigned person can complete this item');

// All the checklist-related database logic lives here, separate from the HTTP layer (controller).
export const checklistService = {
  // Creates a new Checklist under a given Ticket, and (optionally) its initial items in one step.
  async addToTicket(ticketId: string, input: CreateChecklistInput) {
    const id = createId();
    // Create the checklist itself first, linking it to its parent ticket via ticketId.
    await db.insert(checklists).values({ id, title: input.title, ticketId });
    // If the caller supplied any items along with the checklist, create them all now,
    // each one pointing back at the checklist we just made via checklistId.
    if (input.items?.length) {
      await db.insert(checklistItems).values(
        input.items.map((item) => ({
          id: createId(),
          label: item.label,
          assigneeId: item.assigneeId ?? null,
          dueAt: item.dueAt ? new Date(item.dueAt) : null,
          requiredImageCount: item.requiredImageCount ?? 0,
          maxImageCount: item.maxImageCount ?? null,
          requiresLivePhoto: item.requiresLivePhoto ?? false,
          remarks: item.remarks ?? null,
          checklistId: id,
        })),
      );
    }
    // Re-fetch the checklist and its items (and each item's images) so the response includes
    // everything the frontend needs, not just the checklist's own fields.
    return getChecklistWithItems(id);
  },

  // Stamp out a real checklist under this ticket from a reusable, admin-authored template —
  // same result as addToTicket, just sourced from ChecklistTemplate/ChecklistTemplateItem
  // instead of hand-typed input (see taskChecklistService.createFromTemplate for the Task-side
  // equivalent). assigneeId is seeded from the template item's defaultAssigneeId when set.
  async addFromTemplateToTicket(ticketId: string, templateId: string) {
    const [template] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, templateId), isNull(checklistTemplates.deletedAt))).limit(1);
    if (!template) throw AppError.notFound('Checklist template not found');
    if (template.appliesTo !== 'TICKET') throw AppError.badRequest('This template applies to tasks, not tickets');

    const templateItems = await db
      .select()
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, templateId))
      .orderBy(asc(checklistTemplateItems.order));

    const id = createId();
    await db.insert(checklists).values({ id, title: template.name, ticketId });
    if (templateItems.length) {
      await db.insert(checklistItems).values(
        templateItems.map((item) => ({
          id: createId(),
          label: item.label,
          requiredImageCount: item.requiredImageCount,
          maxImageCount: item.maxImageCount,
          requiresLivePhoto: item.requiresLivePhoto,
          assigneeId: item.defaultAssigneeId,
          checklistId: id,
        })),
      );
    }

    return getChecklistWithItems(id);
  },

  // Deletes an entire checklist, along with all of its items (the children go away with the parent).
  async removeChecklist(id: string) {
    const [checklist] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
    // If nothing was found, there was no checklist with that id - report a 404-style error.
    if (!checklist) throw AppError.notFound('Checklist not found');

    // Clean up every item (and their images) that belonged to this checklist so we don't leave
    // orphaned records behind — wrapped in a transaction (source had none).
    await db.transaction(async (tx) => {
      const items = await tx.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.checklistId, id));
      const itemIds = items.map((i) => i.id);
      if (itemIds.length) {
        await tx.delete(checklistImages).where(inArray(checklistImages.checklistItemId, itemIds));
      }
      await tx.delete(checklistItems).where(eq(checklistItems.checklistId, id));
      await tx.delete(checklists).where(eq(checklists.id, id));
    });
    return checklist;
  },

  // Updates one checklist item (e.g. label, isDone, assigneeId, dueAt - see validation schema).
  async updateItem(id: string, input: UpdateChecklistItemInput, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
    // Can't update something that doesn't exist.
    if (!item) throw AppError.notFound('Checklist item not found');

    const [checklist] = await db.select().from(checklists).where(eq(checklists.id, item.checklistId)).limit(1);
    const [ticket] = checklist ? await db.select().from(tickets).where(eq(tickets.id, checklist.ticketId)).limit(1) : [];
    if (!ticket) throw AppError.notFound('Ticket not found');
    assertCanManage(user, ticket);

    const patch: Partial<typeof checklistItems.$inferInsert> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (input.requiredImageCount !== undefined) patch.requiredImageCount = input.requiredImageCount;
    if (input.maxImageCount !== undefined) patch.maxImageCount = input.maxImageCount;
    if (input.requiresLivePhoto !== undefined) patch.requiresLivePhoto = input.requiresLivePhoto;
    if (input.isDone !== undefined) Object.assign(patch, deriveChecklistItemCompletion(input.isDone));

    await db.update(checklistItems).set(patch).where(eq(checklistItems.id, id));
    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);

    // Notify whoever is watching this ticket that one of its checklist items changed.
    emitTicketEvent('checklistItem:updated', {
      // These ids tell the real-time layer which connected users/rooms should receive the update
      // (the ticket's owner, assignee, department, and store).
      userId: ticket.userId,
      assigneeId: ticket.assigneeId ?? null,
      departmentId: ticket.departmentId ?? null,
      storeId: ticket.storeId ?? null,
    }, updated);

    return updated;
  },

  // THE key method: the one place that decides "yes, this checklist item is genuinely done."
  // Same reasoning as taskChecklist.service.ts's completeItem — checks actual uploaded
  // ChecklistImage records against the item's own requirements, never trusts the client.
  async completeItem(itemId: string, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await assertCanComplete(user, item);

    const images = await db.select().from(checklistImages).where(eq(checklistImages.checklistItemId, item.id));

    const qualifyingImages = item.requiresLivePhoto
      ? images.filter((img) => img.captureMethod === 'LIVE')
      : images;

    if (qualifyingImages.length < item.requiredImageCount) {
      const missing = item.requiredImageCount - qualifyingImages.length;
      const kind = item.requiresLivePhoto ? 'live photo(s)' : 'photo(s)';
      throw AppError.badRequest(`Upload ${missing} more ${kind} before this item can be marked complete`);
    }

    await db.update(checklistItems)
      .set({ ...deriveChecklistItemCompletion(true), updatedAt: new Date() })
      .where(eq(checklistItems.id, itemId));

    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    return updated;
  },

  // Set the item's remarks — free text the assignee writes about their own work on this item.
  // Uses assertCanComplete (assignee-or-admin), not assertCanManage, same reasoning as the
  // Task side: this is the person doing the work describing what they did.
  async updateRemarks(itemId: string, remarks: string, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await assertCanComplete(user, item);

    await db.update(checklistItems).set({ remarks, updatedAt: new Date() }).where(eq(checklistItems.id, itemId));
    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    return updated;
  },

  // Deletes a single checklist item without touching the checklist it belongs to.
  async removeItem(id: string) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await db.delete(checklistImages).where(eq(checklistImages.checklistItemId, item.id));
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
    return item;
  },
};
