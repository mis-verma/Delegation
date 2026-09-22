import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { db } from "../../config/db.js";
import { users } from "../../db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { extractTaskFromText, resolveAssignee, resolveDueDate, priorityForCreatorRank } from "../tasks/ai/providers/task.ai.service.js"
import { taskService } from "../tasks/task.service.js";
import { sendWhatsAppMessage, verifySignature } from "./whatsapp.service.js";
import { transcribeWhatsAppVoiceNote } from "./transcription.service.js";
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

declare global {
    namespace Express {
        interface Request {
            rawBody?: Buffer;
        }
    }
}

// Mirrors doubletick.controller.ts's own draftToConfirmInput/formatTaskConfirmation exactly —
// kept as separate local copies (like the rest of this controller vs. doubletick.controller.ts)
// rather than a shared import, since the two providers' payload shapes and error handling
// otherwise have nothing in common to abstract over.
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

export const whatsappController = {
    verify : (req : Request, res : Response) => {
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"]

        if(mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN){
            return res.status(200).send(challenge)
        }
        return res.sendStatus(403)
    },

    receive : asyncHandler(async(req : Request , res : Response) => {
        const signature = req.headers["x-hub-signature-256"] as string | undefined
        if(!verifySignature(req.rawBody!, signature)){
            return res.sendStatus(403);
        }

        res.sendStatus(200);

        const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
        if(!message) return;

        // Meta retries a webhook delivery on any hiccup on their end — claim the message id first
        // so a retried delivery of the same message is a no-op instead of a second task/reply.
        // No id at all means we have nothing to dedupe against — Meta's real payloads always
        // include one, so this only fires on a malformed delivery, and dropping it (fail-closed)
        // beats silently processing every retry as a brand new message (the old `message.id &&`
        // guard fell through to that instead of stopping here).
        if (!message.id) {
            console.error("WhatsApp webhook: message missing id, dropping (can't dedupe)");
            return;
        }
        if (!(await claimInboundMessage("whatsapp", message.id as string))) return;

        const from = message.from as string;

        // Everything below runs after the ack above — WhatsApp already has its 200, so nothing
        // here can reach the client through the normal response cycle anymore. Any error from
        // here on must be caught and reported back to the sender over WhatsApp itself, rather
        // than bubbling up to errorHandler with no response left to send.
        try {
            let text: string;
            let inputMode: "voice" | "text";

            if (message.type === "text") {
                text = message.text.body as string;
                inputMode = "text";
            } else if (message.type === "audio") {
                try {
                    text = await transcribeWhatsAppVoiceNote(message.audio.id as string);
                    inputMode = "voice";
                } catch (err) {
                    console.error("WhatsApp voice transcription failed:", err);
                    await sendWhatsAppMessage(from, "Sorry, I couldn't understand that voice note. Please try again or type it instead.");
                    return;
                }
            } else {
                await sendWhatsAppMessage(from, "Sorry, I can only understand text messages or voice notes right now.");
                return;
            }

            const [sender] = await db.select().from(users)
                .where(and(eq(users.phone, from), eq(users.isActive, true)))
                .limit(1);
            if (!sender) {
                await sendWhatsAppMessage(from, "This number isn't registered in Task Matrix. Ask an admin to add it to your profile first.");
                return;
            }

            const rankFallback = priorityForCreatorRank(sender.rank ?? 5);
            const conversation = await findActiveConversation(from);

            // Same slot-filling conversation flow doubletick.controller.ts already used —
            // previously this handler skipped straight to task creation regardless of how much
            // information the message actually contained, so a WhatsApp message missing an
            // assignee/department/due date got a task auto-created with those fields blank
            // instead of getting asked, unlike the identical input arriving via DoubleTick.
            if (conversation) {
                try {
                    if (CANCEL_PATTERN.test(text)) {
                        await cancelConversation(from);
                        await sendWhatsAppMessage(from, "Okay, I've cancelled that delegation request. Send a new message anytime to start again.");
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
                        await sendWhatsAppMessage(from, `${ack} ${SLOT_QUESTIONS[advance.nextSlot]}`);
                        return;
                    }

                    // advanceConversation already deleted the row as part of returning "done" (see
                    // its own comment) — nothing left to clean up here even if createFromSmartInput
                    // throws below; the user just gets the error message and can resend to restart.
                    const task = await taskService.createFromSmartInput(
                        draftToConfirmInput(updatedDraft),
                        { sub: sender.id, role: sender.role, departmentId: sender.departmentId ?? undefined },
                    );

                    await sendWhatsAppMessage(from, `${ack}\n\n${formatTaskConfirmation(task.title, updatedDraft)}`);
                } catch (err) {
                    console.error("WhatsApp conversation turn failed:", err);
                    await sendWhatsAppMessage(from, "Sorry, something went wrong with that. Please try again or add it manually.");
                }
                return;
            }

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
                await sendWhatsAppMessage(from, formatTaskConfirmation(task.title, draft));
                return;
            }

            await startConversation({
                phone: from,
                userId: sender.id,
                firstSlot: missing[0],
                remainingSlots: missing.slice(1),
                draft,
            });
            await sendWhatsAppMessage(from, SLOT_QUESTIONS[missing[0]]);
        }catch(err){
            console.error("WhatsApp task creation failed:" ,err);
            await sendWhatsAppMessage(from, "Sorry, something went wrong creating that delegation. Please try again or add it manually.")

        }
    })
}
