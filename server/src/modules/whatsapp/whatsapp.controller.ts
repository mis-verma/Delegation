import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { findActiveUserByPhone } from "../users/phone.js";
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

        if (!message.id) {
            console.error("WhatsApp webhook: message missing id, dropping (can't dedupe)");
            return;
        }
        if (!(await claimInboundMessage("whatsapp", message.id as string))) return;

        const from = message.from as string;

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

            const sender = await findActiveUserByPhone(from);
            if (!sender) {
                await sendWhatsAppMessage(from, "This number isn't registered in Task Matrix. Ask an admin to add it to your profile first.");
                return;
            }

            const rankFallback = priorityForCreatorRank(sender.rank ?? 5);
            const conversation = await findActiveConversation(from);

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
