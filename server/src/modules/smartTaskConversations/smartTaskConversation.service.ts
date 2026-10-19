import { db } from "../../config/db.js"
import { smartTaskConversations, smartTaskConversationMessages, tasks } from "../../db/schema/index.js"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import type { CreateSmartTaskConversationInput, PatchSmartTaskConversationInput } from "./smartTaskConversation.validation.js"

const buildTitle = (text: string): string => {
    if (!text) return "New conversation";
    const words = text.trim().split(/\s+/);
    const short = words.slice(0, 8).join(" ");
    return words.length > 8 ? `${short}…` : short;
};

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

    async patch(id: string, userId: string, input: PatchSmartTaskConversationInput) {
        await db.transaction(async (tx) => {
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

    async listForUser(userId: string) {
        const conversations = await db.select().from(smartTaskConversations)
            .where(eq(smartTaskConversations.userId, userId))
            .orderBy(desc(smartTaskConversations.createdAt))
            .limit(50);
        if (!conversations.length) return [];

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

    async deleteAllForUser(userId: string) {
        const result = await db.delete(smartTaskConversations).where(eq(smartTaskConversations.userId, userId));
        return { deletedCount: result[0]?.affectedRows ?? 0 };
    },
};
