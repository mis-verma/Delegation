import { db } from "../../config/db.js"
import { smartTaskConversations, smartTaskConversationMessages, tasks } from "../../db/schema/index.js"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { CreateSmartTaskConversationInput, PatchSmartTaskConversationInput } from "./smartTaskConversation.validation.js"

// Short auto-generated label for the history list so entries are distinguishable at a glance
// without opening each one — just the first few words of what the user actually typed, no AI call.
const buildTitle = (text: string): string => {
    if (!text) return "New conversation";
    const words = text.trim().split(/\s+/);
    const short = words.slice(0, 8).join(" ");
    return words.length > 8 ? `${short}…` : short;
};

// Re-reads a conversation together with its messages, ordered oldest-first — the child-table
// equivalent of what used to just be the embedded `messages` array in insertion order.
//
// Composed as two plain selects rather than the relational query API's `with: { messages: {...} }`
// on purpose: that API compiles a one-to-many `with` into a `LEFT JOIN LATERAL (... JSON_ARRAYAGG
// ... ROW_NUMBER() OVER ...)` derived table, which is MySQL-8-only syntax our MySQL-compatible
// server (MariaDB) can't parse. Two ordinary queries plus an in-memory merge produce the identical
// shape and are portable across both.
async function findWithMessages(id: string, userId: string) {
    const [conversation] = await db.select().from(smartTaskConversations)
        .where(and(eq(smartTaskConversations.id, id), eq(smartTaskConversations.userId, userId)))
        .limit(1);
    if (!conversation) return undefined;

    const messages = await db.select().from(smartTaskConversationMessages)
        .where(eq(smartTaskConversationMessages.conversationId, id))
        .orderBy(asc(smartTaskConversationMessages.timestamp));

    return { ...conversation, messages };
}

export const smartTaskConversationService = {
    async create(userId: string, input: CreateSmartTaskConversationInput) {
        const id = createId();
        // No transaction here matches source behavior closely enough (a single logical write),
        // but since this now spans two tables we wrap it for atomicity — wrapped in a
        // transaction (source had none, it was a single document save).
        await db.transaction(async (tx) => {
            await tx.insert(smartTaskConversations).values({
                id,
                userId,
                status: "in_progress",
            });
            if (input.messages.length) {
                await tx.insert(smartTaskConversationMessages).values(
                    input.messages.map((m) => ({
                        conversationId: id,
                        from: m.from,
                        text: m.text,
                        timestamp: new Date(m.timestamp),
                    })),
                );
            }
        });

        return findWithMessages(id, userId);
    },

    // Covers append (messages), and both finalize cases (status + resultingTaskId) — one endpoint,
    // varying body. The {id, userId} filter doubles as the ownership check: a mismatched id
    // (wrong owner or nonexistent) 404s the same way either way, so it never leaks whether a
    // conversation belonging to someone else exists at all.
    //
    // `messages`, when provided, is always the client's full up-to-date transcript (same contract
    // as before, when it was `$set` on the whole embedded array) — since the message rows have no
    // client-visible identity, the new rows here are only the ones beyond what's already stored,
    // i.e. an append-only INSERT rather than a delete-and-reinsert of the whole table.
    async patch(id: string, userId: string, input: PatchSmartTaskConversationInput) {
        await db.transaction(async (tx) => {
            // FOR UPDATE: two concurrent PATCH calls for the same conversation (client retry on
            // timeout, a double form submit) used to both read the same plain SELECT count(*),
            // both compute the identical "new" message tail, and both insert it — there's no
            // unique constraint on smartTaskConversationMessages to catch that, so duplicates
            // landed silently. Locking this row for the transaction's duration serializes the two
            // patches: the second one only proceeds once the first has committed its inserts, so
            // its own count(*) below already reflects them.
            const [existing] = await tx.select({ id: smartTaskConversations.id })
                .from(smartTaskConversations)
                .where(and(eq(smartTaskConversations.id, id), eq(smartTaskConversations.userId, userId)))
                .for('update')
                .limit(1);
            if (!existing) throw AppError.notFound("Conversation not found");

            if (input.messages && input.messages.length) {
                const [{ count }] = await tx.select({ count: sql<number>`count(*)` })
                    .from(smartTaskConversationMessages)
                    .where(eq(smartTaskConversationMessages.conversationId, id));
                const newMessages = input.messages.slice(Number(count));
                if (newMessages.length) {
                    await tx.insert(smartTaskConversationMessages).values(
                        newMessages.map((m) => ({
                            conversationId: id,
                            from: m.from,
                            text: m.text,
                            timestamp: new Date(m.timestamp),
                        })),
                    );
                }
            }

            // Verify the task actually exists and belongs to this same user before stamping it
            // onto the conversation — without this, any string passes Zod and the conversation
            // ends up pointing at a phantom or another user's task.
            if (input.resultingTaskId) {
                const [task] = await tx.select({ id: tasks.id })
                    .from(tasks)
                    .where(and(eq(tasks.id, input.resultingTaskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
                    .limit(1);
                if (!task) throw AppError.badRequest("resultingTaskId does not refer to a task you created");
            }

            const updates: Partial<typeof smartTaskConversations.$inferInsert> = { updatedAt: new Date() };
            if (input.status !== undefined) updates.status = input.status;
            if (input.resultingTaskId !== undefined) updates.resultingTaskId = input.resultingTaskId;
            await tx.update(smartTaskConversations).set(updates).where(eq(smartTaskConversations.id, id));
        });

        const conversation = await findWithMessages(id, userId);
        if (!conversation) throw AppError.notFound("Conversation not found");
        return conversation;
    },

    // Lightweight summary for the history list — full message arrays aren't needed until a
    // specific conversation is actually opened, so this keeps the list payload small.
    async listForUser(userId: string) {
        const conversations = await db.select().from(smartTaskConversations)
            .where(eq(smartTaskConversations.userId, userId))
            .orderBy(desc(smartTaskConversations.createdAt))
            // The history list shows recent chats only. Without a cap this loaded every
            // conversation a person ever had, plus every message in all of them, on each open.
            .limit(50);
        if (!conversations.length) return [];

        // One extra query for every message across every listed conversation (rather than N+1
        // queries, one per conversation) — same "manual join, not the relational `with` API"
        // reasoning as findWithMessages above (MariaDB can't run the LATERAL-join SQL it'd emit).
        const messages = await db.select().from(smartTaskConversationMessages)
            .where(inArray(smartTaskConversationMessages.conversationId, conversations.map((c) => c.id)))
            .orderBy(asc(smartTaskConversationMessages.timestamp));

        const messagesByConversation = new Map<string, typeof messages>();
        for (const m of messages) {
            const bucket = messagesByConversation.get(m.conversationId);
            if (bucket) bucket.push(m);
            else messagesByConversation.set(m.conversationId, [m]);
        }

        return conversations.map((c) => {
            const conversationMessages = messagesByConversation.get(c.id) ?? [];
            const firstUserMessage = conversationMessages.find((m) => m.from === "user");
            return {
                id: c.id,
                status: c.status,
                resultingTaskId: c.resultingTaskId ?? null,
                messageCount: conversationMessages.length,
                title: buildTitle(firstUserMessage?.text ?? ""),
                preview: firstUserMessage?.text ?? "",
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            };
        });
    },

    async getOne(id: string, userId: string) {
        const conversation = await findWithMessages(id, userId);
        if (!conversation) throw AppError.notFound("Conversation not found");
        return conversation;
    },

    // Admin-only bulk clear (see route gating) — scoped to the calling admin's own history, same
    // as every other endpoint here; there's no cross-user history to clear.
    async deleteAllForUser(userId: string) {
        // Messages cascade-delete via the FK's ON DELETE CASCADE (see db/schema/task.ts).
        const result = await db.delete(smartTaskConversations).where(eq(smartTaskConversations.userId, userId));
        return { deletedCount: result[0]?.affectedRows ?? 0 };
    },
};
