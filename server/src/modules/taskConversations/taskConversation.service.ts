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

// Converts a row's flattened `draft*` columns back into the nested shape the AI slot-filling
// code (slotResolvers.ts / slotFilling.ts) expects — the mirror image of fromDraftObject below.
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

// Converts the nested draft object the AI code works with into the flattened `draft*`-prefixed
// columns for an insert/update against `pendingTaskConversations`.
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

// Mongo's TTL sweep runs on a ~60s cycle, so a logically-expired doc could still be read back in
// that window. MySQL has no equivalent native TTL index (see the `expiresAt` comment in
// db/schema/task.ts) — a scheduled cleanup job should periodically run
// `DELETE FROM PendingTaskConversation WHERE expiresAt < NOW()` (to be added in a later task).
// Behavior here is unchanged either way: every lookup treats expiresAt<=now as "not found" and
// eagerly deletes, so callers must never trust a row returned here without this check having
// already run.
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
        // Two fresh messages from the same phone racing to start a conversation at once. Drizzle
        // wraps the real mysql2 error inside a DrizzleQueryError, whose own `code` is undefined —
        // the actual code sits on `.cause` (see errorHandler.ts's asMySqlError for the same gotcha)
        // — so this previously never matched and the race fell through to the generic throw below.
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

// Optimistic-concurrency guard keyed on the pendingSlot the caller read: if two answers to the same
// pending slot arrive concurrently, only the first write matches the filter — the second gets back
// "raced" and should stay silent rather than double-processing or double-creating a task.
export async function advanceConversation(
    conversation: { id: string; pendingSlot: ConversationSlot; slotQueue: ConversationSlot[] },
    updatedDraft: ConversationDraftLike
): Promise<AdvanceResult> {
    const [nextSlot, ...remainingQueue] = conversation.slotQueue;

    if (!nextSlot) {
        // The "done" case used to UPDATE the draft columns here and rely on the caller deleting
        // the row afterward (finishConversation, once task creation succeeds) — but pendingSlot
        // never changes on this branch, so a second, genuinely distinct message arriving before
        // that later delete (not caught by the per-message webhook dedupe, since it's a different
        // message.id) matched the exact same guarded WHERE and also got "done" back, double-firing
        // task creation. Deleting the row right here, as part of the same guarded statement, closes
        // that window: a second racer's identical WHERE now matches zero rows because the first
        // racer already removed it, and it also means a task-creation failure downstream no longer
        // leaves an orphaned row that retries forever on every later message from that phone.
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
