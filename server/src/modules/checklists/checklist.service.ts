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
import { AppError } from '../../utils/AppError.js';
import { emitTicketEvent } from '../../sockets/ticketEvent.js';
import type { CreateChecklistInput, UpdateChecklistItemInput } from './checklist.validation.js';
import type { AccessTokenPayload } from '../../middleware/auth/auth.js';
import { assertCanWorkChecklistItem, assertTicketChecklistOpen, ticketChecklistWorkerIds } from '../../utils/checklistItemWorkers.js';
import { isAdminOrPc } from "../../utils/roles.js"

type ChecklistItemRow = typeof checklistItems.$inferSelect;

const deriveChecklistItemCompletion = (isDone: boolean): { isDone: boolean; completedAt: Date | null } => ({
  isDone,
  completedAt: isDone ? new Date() : null,
});


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


const assertCanManage = (user: AccessTokenPayload, ticket: { userId: string }) => {
  if (isAdminOrPc(user.role)) return;
  if (ticket.userId === user.sub) return;
  throw AppError.forbidden('Only the ticket owner can manage its checklists');
};


const assertCanComplete = (user: AccessTokenPayload, item: Pick<ChecklistItemRow, 'assigneeId' | 'checklistId'>) =>
  assertCanWorkChecklistItem(user, item, () => ticketChecklistWorkerIds(item.checklistId), 'Only the assigned person can complete this item');

export const checklistService = {
  async addToTicket(ticketId: string, input: CreateChecklistInput) {
    const id = createId();
    await db.insert(checklists).values({ id, title: input.title, ticketId });
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
    return getChecklistWithItems(id);
  },

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

  async removeChecklist(id: string) {
    const [checklist] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
    if (!checklist) throw AppError.notFound('Checklist not found');

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

  async updateItem(id: string, input: UpdateChecklistItemInput, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');

    const [checklist] = await db.select().from(checklists).where(eq(checklists.id, item.checklistId)).limit(1);
    const [ticket] = checklist ? await db.select().from(tickets).where(eq(tickets.id, checklist.ticketId)).limit(1) : [];
    if (!ticket) throw AppError.notFound('Ticket not found');
    assertCanManage(user, ticket);
    await assertTicketChecklistOpen(user, item.checklistId);

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

    emitTicketEvent('checklistItem:updated', {
      userId: ticket.userId,
      assigneeId: ticket.assigneeId ?? null,
      departmentId: ticket.departmentId ?? null,
      storeId: ticket.storeId ?? null,
    }, updated);

    return updated;
  },


  async completeItem(itemId: string, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await assertCanComplete(user, item);
    await assertTicketChecklistOpen(user, item.checklistId);

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

  
  async updateRemarks(itemId: string, remarks: string, user: AccessTokenPayload) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await assertCanComplete(user, item);
    await assertTicketChecklistOpen(user, item.checklistId);

    await db.update(checklistItems).set({ remarks, updatedAt: new Date() }).where(eq(checklistItems.id, itemId));
    const [updated] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
    return updated;
  },

  async removeItem(id: string) {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
    if (!item) throw AppError.notFound('Checklist item not found');
    await db.delete(checklistImages).where(eq(checklistImages.checklistItemId, item.id));
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
    return item;
  },
};
