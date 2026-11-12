import { TODO_PRIORITIES } from "../../db/schema/task.js"
import { parseImportDate } from "../../utils/importDate.js"
import { readTable } from "../../utils/readTable.js"
import { AppError } from "../../utils/AppError.js"

type TodoPriority = (typeof TODO_PRIORITIES)[number]

export const TODO_TEXT_MAX = 500
export const TODO_IMPORT_MAX_ROWS = 500
const DUE_TIME = "18:00"

export type TodoImportRow = {
    rowIndex: number
    text: string
    textTooLong: boolean
    dueDate: string | null
    dueText: string | null
    dueInvalid: boolean
    priority: TodoPriority
    priorityText: string | null
    priorityMatched: boolean
    completed: boolean
}

export type TodoImportPreview = {
    rows: TodoImportRow[]
    skippedEmpty: number
    truncated: boolean
}

type Field = "text" | "due" | "priority" | "done"

const HEADER_ALIASES: Record<string, Field> = {
    "task": "text",
    "tasks": "text",
    "to-do": "text",
    "to do": "text",
    "todo": "text",
    "title": "text",
    "text": "text",
    "item": "text",
    "description": "text",
    "due date": "due",
    "due": "due",
    "due on": "due",
    "due by": "due",
    "deadline": "due",
    "date": "due",
    "priority": "priority",
    "done": "done",
    "completed": "done",
    "complete": "done",
    "status": "done",
}

const PRIORITY_WORDS: Record<string, TodoPriority> = {
    low: "low",
    l: "low",
    p3: "low",
    medium: "medium",
    med: "medium",
    normal: "medium",
    m: "medium",
    p2: "medium",
    high: "high",
    h: "high",
    urgent: "high",
    critical: "high",
    p1: "high",
}

const DONE_WORDS = new Set(["yes", "y", "true", "1", "done", "completed", "complete", "closed", "x"])

const pickFields = (record: Record<string, string>): Partial<Record<Field, string>> => {
    const out: Partial<Record<Field, string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const field = HEADER_ALIASES[key.trim().toLowerCase()]
        const v = String(value ?? "").trim()
        if (field && v && out[field] === undefined) out[field] = v
    }
    return out
}

const resolvePriority = (raw: string | undefined): { priority: TodoPriority; matched: boolean } => {
    if (!raw) return { priority: "medium", matched: true }
    const hit = PRIORITY_WORDS[raw.trim().toLowerCase()]
    return hit ? { priority: hit, matched: true } : { priority: "medium", matched: false }
}

export const todoRowsFromRecords = (records: Record<string, string>[]): TodoImportPreview => {
    const rows: TodoImportRow[] = []
    let skippedEmpty = 0
    records.forEach((record, i) => {
        const f = pickFields(record)
        if (!f.text) {
            skippedEmpty++
            return
        }
        const due = f.due ? parseImportDate(f.due, DUE_TIME) : null
        const { priority, matched } = resolvePriority(f.priority)
        rows.push({
            rowIndex: i + 2,
            text: f.text.slice(0, TODO_TEXT_MAX),
            textTooLong: f.text.length > TODO_TEXT_MAX,
            dueDate: due ? due.toISOString() : null,
            dueText: f.due ?? null,
            dueInvalid: !!f.due && !due,
            priority,
            priorityText: f.priority ?? null,
            priorityMatched: matched,
            completed: !!f.done && DONE_WORDS.has(f.done.toLowerCase()),
        })
    })
    return {
        rows: rows.slice(0, TODO_IMPORT_MAX_ROWS),
        skippedEmpty,
        truncated: rows.length > TODO_IMPORT_MAX_ROWS,
    }
}

export const readTodoFile = async (buffer: Buffer, mimetype: string): Promise<TodoImportPreview> => {
    const records = await readTable(buffer, mimetype)
    const preview = todoRowsFromRecords(records)
    if (!preview.rows.length) {
        throw AppError.unprocessable("No to-dos found. Put each to-do on its own row under a column called Task.")
    }
    return preview
}
