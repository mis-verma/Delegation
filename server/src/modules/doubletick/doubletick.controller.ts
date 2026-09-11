import type { Request, Response } from "express";
import { extractTaskFromText, resolveAssignee, resolveDueDate, priorityForCreatorRank } from "../tasks/ai/providers/task.ai.service.js"
import { taskService } from "../tasks/task.service.js";
import { db } from "../../config/db.js";
import { users } from "../../db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { transcribeVoiceNote } from "../whatsapp/transcription.service.js";
import { sendDoubleTickMessage, verifyDoubleTickAuth, downloadDoubleTickAudio } from "./doubletick.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { departmentService } from "../departments/department.service.js";
import { claimInboundMessage } from "../../utils/inboundMessageDedupe.js";
import { SLOT_QUESTIONS, CANCEL_PATTERN, DATE_HINT_PATTERN, derivePriorityHint, computeMissingSlots } from "../tasks/ai/slotFilling.js";
import { resolveSlotAnswer, type ConversationDraftLike } from "../tasks/ai/slotResolvers.js";
import {
    findActiveConversation,
    startConversation,
    advanceConversation,
    cancelConversation,
    toDraftObject,
} from "../taskConversations/taskConversation.service.js";

// Shape confirmed against DoubleTick's public webhook docs — both TEXT and AUDIO messages arrive
// on the same MESSAGE_RECEIVED trigger, distinguished only by message.type.
interface DoubleTickIncomingPayload {
    to: string;
    from: string;
    messageId: string;
    integrationType: string;
    message?: { type: string; text?: string; url?: string };
}

function draftToConfirmInput(draft: ConversationDraftLike) {
    return {
        title: draft.title,
        context: draft.context || undefined,
        category: draft.category,
        priority: draft.priority,
        dueDate: (draft.dueDate ?? new Date()).toISOString(),
        assigneeId: draft.assigneeId ?? undefined,
        departmentId: draft.departmentId ?? undefined,
        assigneeRaw: draft.assigneeName || undefined,
        departmentRaw: draft.departmentName || undefined,
        confidence: draft.confidence ?? undefined,
        rawInput: draft.rawInput,
        inputMode: draft.inputMode,
        channel: "whatsapp" as const,
        wonBy: draft.wonBy ?? undefined,
    };
}

function formatTaskConfirmation(taskTitle: string, draft: ConversationDraftLike) {
    const assigneeLabel = draft.assigneeId ? draft.assigneeName : "unassigned";
    const dueDate = draft.dueDate ?? new Date();
    return `Delegation Created: ${taskTitle}\nAssigned to: ${assigneeLabel}\nDue: ${dueDate.toLocaleDateString()}\nPriority: ${draft.priority}`;
}

export const doubletickController = {
    // No GET-challenge verify step here (unlike Meta) — DoubleTick has no equivalent handshake,
    // the webhook URL + auth token are registered directly in their dashboard instead.
    receive: asyncHandler(async (req: Request, res: Response) => {
        if (!verifyDoubleTickAuth(req.params.secret)) {
            return res.sendStatus(401);
        }

        res.sendStatus(200);

        const body = req.body as DoubleTickIncomingPayload;
        if (body.integrationType !== "WHATSAPP" || !body.message) return;

        // DoubleTick retries a delivery on any hiccup on their end — claim the message id first
        // so a retried delivery of the same message is a no-op instead of a second task.
        if (body.messageId && !(await claimInboundMessage("doubletick", body.messageId))) return;

        const from = body.from;
        let text: string;
        let inputMode: "voice" | "text";

        if (body.message.type === "TEXT" && body.message.text) {
            text = body.message.text;
            inputMode = "text";
        } else if (body.message.type === "AUDIO" && body.message.url) {
            try {
                const { buffer, mimeType } = await downloadDoubleTickAudio(body.message.url);
                text = await transcribeVoiceNote(buffer, mimeType);
                inputMode = "voice";
            } catch (err) {
                console.error("DoubleTick voice transcription failed:", err);
                await sendDoubleTickMessage(from, "Sorry, I couldn't understand that voice note. Please try again or type it instead.");
                return;
            }
        } else {
            await sendDoubleTickMessage(from, "Sorry, I can only understand text messages or voice notes right now.");
            return;
        }

        const [sender] = await db.select().from(users)
            .where(and(eq(users.phone, from), eq(users.isActive, true)))
            .limit(1);
        if (!sender) {
            await sendDoubleTickMessage(from, "This number isn't registered in Task Matrix. Ask an admin to add it to your profile first.");
            return;
        }

        const rankFallback = priorityForCreatorRank(sender.rank ?? 5);
        const conversation = await findActiveConversation(from);

        if (conversation) {
            try {
                if (CANCEL_PATTERN.test(text)) {
                    await cancelConversation(from);
                    await sendDoubleTickMessage(from, "Okay, I've cancelled that delegation request. Send a new message anytime to start again.");
                    return;
                }

                const currentDraft = toDraftObject(conversation);
                const { draft: updatedDraft, ack } = await resolveSlotAnswer(
                    conversation.pendingSlot,
                    text,
                    currentDraft,
                    { rankFallbackPriority: rankFallback },
                );

                const advance = await advanceConversation(conversation, updatedDraft);
                if (advance.status === "raced") return;

                if (advance.status === "next") {
                    await sendDoubleTickMessage(from, `${ack} ${SLOT_QUESTIONS[advance.nextSlot]}`);
                    return;
                }

                // advanceConversation already deleted the row as part of returning "done" (see its
                // own comment) — nothing left to clean up here even if createFromSmartInput throws
                // below; the user just gets the error message and can resend to restart.
                const task = await taskService.createFromSmartInput(
                    draftToConfirmInput(updatedDraft),
                    { sub: sender.id, role: sender.role, departmentId: sender.departmentId ?? undefined },
                );

                await sendDoubleTickMessage(from, `${ack}\n\n${formatTaskConfirmation(task.title, updatedDraft)}`);
            } catch (err) {
                console.error("DoubleTick conversation turn failed:", err);
                await sendDoubleTickMessage(from, "Sorry, something went wrong with that. Please try again or add it manually.");
            }
            return;
        }

        try {
            const referenceDate = new Date();
            const extraction = await extractTaskFromText(text, referenceDate);
            const assignee = await resolveAssignee(extraction.assigneeName, extraction.department);
            const department = await departmentService.resolveByName(extraction.department);
            const priorityHint = derivePriorityHint(text);

            const draft: ConversationDraftLike = {
                title: extraction.title,
                context: extraction.context || "",
                category: extraction.category,
                priority: priorityHint ?? rankFallback,
                dueDate: DATE_HINT_PATTERN.test(text) ? resolveDueDate(extraction.dueDateISO, text, referenceDate) : null,
                assigneeId: assignee?.id ?? null,
                assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName ?? ""}`.trim() : (extraction.assigneeName || ""),
                departmentId: department?.id ?? null,
                departmentName: department?.name ?? (extraction.department || ""),
                rawInput: text,
                inputMode,
                confidence: extraction.confidence,
                wonBy: extraction.wonBy,
            };

            const missing = computeMissingSlots(draft, text);

            if (missing.length === 0) {
                const task = await taskService.createFromSmartInput(
                    draftToConfirmInput(draft),
                    { sub: sender.id, role: sender.role, departmentId: sender.departmentId ?? undefined },
                );
                await sendDoubleTickMessage(from, formatTaskConfirmation(task.title, draft));
                return;
            }

            await startConversation({
                phone: from,
                userId: sender.id,
                firstSlot: missing[0],
                remainingSlots: missing.slice(1),
                draft,
            });
            await sendDoubleTickMessage(from, SLOT_QUESTIONS[missing[0]]);
        } catch (err) {
            console.error("DoubleTick task creation failed:", err);
            await sendDoubleTickMessage(from, "Sorry, something went wrong creating that delegation. Please try again or add it manually.");
        }
    }),
}
