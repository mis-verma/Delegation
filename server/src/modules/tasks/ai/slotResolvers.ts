import type { CONVERSATION_SLOTS } from "../../../db/schema/task.js"
import { resolveAssignee } from "./providers/task.ai.service.js"
import { departmentService } from "../../departments/department.service.js"
import { resolveDueDateLocally, resolvePriorityAnswer } from "./slotFilling.js"

type ConversationSlot = (typeof CONVERSATION_SLOTS)[number]

export interface ConversationDraftLike {
    title: string
    context: string
    category: "issue" | "delegated_task"
    priority: "low" | "medium" | "high"
    dueDate: Date | null
    assigneeId: string | null
    assigneeName: string
    departmentId: string | null
    departmentName: string
    rawInput: string
    inputMode: "voice" | "text"
    confidence: number | null
    wonBy: string | null
}

type SlotResolver = (
    answer: string,
    draft: ConversationDraftLike,
    ctx: { rankFallbackPriority: "low" | "medium" | "high" }
) => Promise<{ draft: ConversationDraftLike; ack: string }>

const SLOT_RESOLVERS: Record<ConversationSlot, SlotResolver> = {
    assignee: async (answer, draft) => {
        const match = await resolveAssignee(answer, draft.departmentName || undefined)
        return {
            draft: {
                ...draft,
                assigneeId: match?.id ?? null,
                assigneeName: match ? `${match.firstName} ${match.lastName ?? ""}`.trim() : answer.trim(),
            },
            ack: match
                ? `Assigned to ${match.firstName}.`
                : `Couldn't match "${answer}" to an active user. I'll leave it unassigned — you can reassign it in Task Matrix.`,
        }
    },

    department: async (answer, draft) => {
        const match = await departmentService.resolveByName(answer)
        return {
            draft: {
                ...draft,
                departmentId: match?.id ?? null,
                departmentName: match?.name ?? answer.trim(),
            },
            ack: match
                ? `Department set to ${match.name}.`
                : `Couldn't match "${answer}" to a department. I'll leave that blank — you can set it in Task Matrix.`,
        }
    },

    dueDate: async (answer, draft) => {
        const resolved = resolveDueDateLocally(answer)
        return {
            draft: { ...draft, dueDate: resolved ?? draft.dueDate },
            ack: resolved
                ? `Due date set for ${resolved.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
                : `Couldn't understand "${answer}" as a date. I'll default it to today unless you correct it.`,
        }
    },

    priority: async (answer, draft, ctx) => {
        const resolved = resolvePriorityAnswer(answer, ctx.rankFallbackPriority)
        return {
            draft: { ...draft, priority: resolved },
            ack: `Priority set to ${resolved}.`,
        }
    },
}

export async function resolveSlotAnswer(
    slot: ConversationSlot,
    answer: string,
    draft: ConversationDraftLike,
    ctx: { rankFallbackPriority: "low" | "medium" | "high" }
): Promise<{ draft: ConversationDraftLike; ack: string }> {
    return SLOT_RESOLVERS[slot](answer, draft, ctx)
}
