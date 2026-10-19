import { db } from "../../config/db.js"
import { pendingTaskConversations, CONVERSATION_SLOTS } from "../../db/schema/index.js"
import { and, eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { ConversationDraftLike } from "../tasks/ai/slotResolvers.js"

export type ConversationSlot = (typeof CONVERSATION_SLOTS)[number]

const CONVERSATION_TTL_MS = 30 * 60 * 1000

type PendingTaskConversationRow = typeof pendingTaskConversations.$inferSelect;

function isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= Date.now()
}

export function toDraftObject(row: PendingTaskConversationRow): ConversationDraftLike {
    return {
        title: row.draftTitle,
        context: row.draftContext,
        category: row.draftCategory,
        priority: row.draftPriority,
        dueDate: row.draftDueDate ?? null,
        assigneeId: row.draftAssigneeId ?? null,
        assigneeName: row.draftAssigneeName,
        departmentId: row.draftDepartmentId ?? null,
        departmentName: row.draftDepartmentName,
        rawInput: row.draftRawInput,
        inputMode: row.draftInputMode,
        confidence: row.draftConfidence ?? null,
        wonBy: row.draftWonBy ?? null,
    }
}

export function fromDraftObject(draft: ConversationDraftLike) {
    return {
        draftTitle: draft.title,
        draftContext: draft.context,
        draftCategory: draft.category,
        draftPriority: draft.priority,
        draftDueDate: draft.dueDate,
        draftAssigneeId: draft.assigneeId,
        draftAssigneeName: draft.assigneeName,
        draftDepartmentId: draft.departmentId,
        draftDepartmentName: draft.departmentName,
        draftRawInput: draft.rawInput,
        draftInputMode: draft.inputMode,
        draftConfidence: draft.confidence,
        draftWonBy: draft.wonBy,
    }
}

export async function findActiveConversation(phone: string): Promise<PendingTaskConversationRow | null> {
    const [conversation] = await db.select().from(pendingTaskConversations)
        .where(eq(pendingTaskConversations.phone, phone))
        .limit(1);
    if (!conversation) return null;
    if (isExpired(conversation.expiresAt)) {
        await db.delete(pendingTaskConversations).where(eq(pendingTaskConversations.id, conversation.id));
        return null;
    }
    return conversation;
}

export async function startConversation(params: {
    phone: string
    userId: string
    firstSlot: ConversationSlot
    remainingSlots: ConversationSlot[]
    draft: ConversationDraftLike
}): Promise<PendingTaskConversationRow> {
    const id = createId();
    try {
        await db.insert(pendingTaskConversations).values({
            id,
            phone: params.phone,
            userId: params.userId,
            pendingSlot: params.firstSlot,
            slotQueue: params.remainingSlots,
            ...fromDraftObject(params.draft),
            expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
        });
    } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY") {
            const existing = await findActiveConversation(params.phone);
            if (existing) return existing;
        }
        throw err;
    }

    const [conversation] = await db.select().from(pendingTaskConversations).where(eq(pendingTaskConversations.id, id)).limit(1);
    return conversation!;
}

type AdvanceResult =
    | { status: "next"; nextSlot: ConversationSlot }
    | { status: "done" }
    | { status: "raced" }

export async function advanceConversation(
    conversation: { id: string; pendingSlot: ConversationSlot; slotQueue: ConversationSlot[] },
    updatedDraft: ConversationDraftLike
): Promise<AdvanceResult> {
    const [nextSlot, ...remainingQueue] = conversation.slotQueue;

    if (!nextSlot) {
        const [result] = await db.delete(pendingTaskConversations)
            .where(and(
                eq(pendingTaskConversations.id, conversation.id),
                eq(pendingTaskConversations.pendingSlot, conversation.pendingSlot),
            ));
        return result.affectedRows > 0 ? { status: "done" } : { status: "raced" };
    }

    const [result] = await db.update(pendingTaskConversations)
        .set({
            pendingSlot: nextSlot,
            slotQueue: remainingQueue,
            ...fromDraftObject(updatedDraft),
            expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
            updatedAt: new Date(),
        })
        .where(and(
            eq(pendingTaskConversations.id, conversation.id),
            eq(pendingTaskConversations.pendingSlot, conversation.pendingSlot),
        ));
    return result.affectedRows > 0 ? { status: "next", nextSlot } : { status: "raced" };
}

export async function cancelConversation(phone: string) {
    await db.delete(pendingTaskConversations).where(eq(pendingTaskConversations.phone, phone));
}
