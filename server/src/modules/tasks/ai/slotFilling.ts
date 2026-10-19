import type { CONVERSATION_SLOTS } from "../../../db/schema/task.js"

type ConversationSlot = (typeof CONVERSATION_SLOTS)[number]
import { WEEKDAYS, daysUntilWeekday, matchInDays } from "./dateParsing.js"

export const SLOT_ORDER: readonly ConversationSlot[] = ["assignee", "department", "dueDate", "priority"]

export const SLOT_QUESTIONS: Record<ConversationSlot, string> = {
    assignee: "Who should I assign this delegation to?",
    department: "Which department does this belong to?",
    dueDate: "When is this delegation due?",
    priority: "Should this be low, medium, or high priority?",
}

export const DATE_HINT_PATTERN = /\b(today|tomorrow|in\s+\d+\s+days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|aaj|kal|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i

export const PRIORITY_HINT_PATTERN = /\b(urgent|asap|immediately|critical|very important|high priority|top priority|low priority|not urgent|no rush|medium priority)\b/i
export const HIGH_PRIORITY_HINT_PATTERN = /\b(urgent|asap|immediately|critical|very important|high priority|top priority)\b/i

export const CANCEL_PATTERN = /\b(cancel|never\s*mind|start over|reset|forget it|stop)\b/i

export function derivePriorityHint(text: string): "low" | "medium" | "high" | null {
    if (!PRIORITY_HINT_PATTERN.test(text)) return null
    const lower = text.toLowerCase()
    if (HIGH_PRIORITY_HINT_PATTERN.test(lower)) return "high"
    if (/\b(low priority|not urgent|no rush)\b/.test(lower)) return "low"
    return "medium"
}

export function levenshteinDistance(a: string, b: string): number {
    const rows: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
    for (let i = 0; i <= a.length; i++) rows[i][0] = i
    for (let j = 0; j <= b.length; j++) rows[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            rows[i][j] = a[i - 1] === b[j - 1]
                ? rows[i - 1][j - 1]
                : 1 + Math.min(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j - 1])
        }
    }
    return rows[a.length][b.length]
}

export function containsFuzzyWord(text: string, keyword: string, maxDistance = 2): boolean {
    return text.split(/\s+/).some((word) => levenshteinDistance(word, keyword) <= maxDistance)
}

export function resolveDueDateLocally(answer: string, reference: Date = new Date()): Date | null {
    const lower = answer.toLowerCase().trim()
    const base = new Date(reference)

    const days = matchInDays(lower)
    if (days != null) {
        base.setDate(base.getDate() + days)
        return base
    }

    if (/\btomorrow\b/.test(lower) || lower.includes("kal")) {
        base.setDate(base.getDate() + 1)
        return base
    }
    if (/\btoday\b/.test(lower) || lower.includes("aaj")) {
        return base
    }
    const exactWeekdayIndex = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(lower))
    if (exactWeekdayIndex !== -1) {
        base.setDate(base.getDate() + daysUntilWeekday(base.getDay(), exactWeekdayIndex))
        return base
    }

    if (containsFuzzyWord(lower, "tomorrow")) {
        base.setDate(base.getDate() + 1)
        return base
    }
    if (containsFuzzyWord(lower, "today")) {
        return base
    }
    const fuzzyWeekdayIndex = WEEKDAYS.findIndex((w) => containsFuzzyWord(lower, w))
    if (fuzzyWeekdayIndex !== -1) {
        base.setDate(base.getDate() + daysUntilWeekday(base.getDay(), fuzzyWeekdayIndex))
        return base
    }

    const parsedTimestamp = Date.parse(answer)
    return Number.isNaN(parsedTimestamp) ? null : new Date(parsedTimestamp)
}

export function resolvePriorityAnswer(
    answer: string,
    fallback: "low" | "medium" | "high" = "medium"
): "low" | "medium" | "high" {
    const lower = answer.toLowerCase()
    if (/\b(high|urgent|asap|critical)\b/.test(lower)) return "high"
    if (/\b(low|whenever|no rush)\b/.test(lower)) return "low"
    return fallback
}

interface MissingSlotDraft {
    assigneeId?: string | null
    assigneeName?: string
    departmentId?: string | null
    departmentName?: string
    dueDate: Date | null
}

const SLOT_IS_MISSING: Record<ConversationSlot, (draft: MissingSlotDraft, rawInput: string) => boolean> = {
    assignee: (draft) => !draft.assigneeId && !draft.assigneeName,
    department: (draft) => !draft.departmentId && !draft.departmentName,
    dueDate: (draft) => !draft.dueDate,
    priority: (_draft, rawInput) => derivePriorityHint(rawInput) === null,
}

export function computeMissingSlots(draft: MissingSlotDraft, rawInput: string): ConversationSlot[] {
    return SLOT_ORDER.filter((slot) => SLOT_IS_MISSING[slot](draft, rawInput))
}
