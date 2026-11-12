import { describe, expect, it } from "vitest"
import { TODO_IMPORT_MAX_ROWS, TODO_TEXT_MAX, readTodoFile, todoRowsFromRecords } from "./todoImport.js"

describe("todoRowsFromRecords", () => {
    it("maps header aliases case-insensitively", () => {
        const { rows } = todoRowsFromRecords([{ " To-Do ": "Call supplier", "Deadline": "2026-11-20", "PRIORITY": "Urgent", "Status": "Done" }])
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ text: "Call supplier", priority: "high", priorityMatched: true, completed: true, dueInvalid: false })
        expect(rows[0]!.dueDate).toBe(new Date("2026-11-20T18:00:00+05:30").toISOString())
    })

    it("defaults priority to medium and flags unknown words", () => {
        const { rows } = todoRowsFromRecords([{ Task: "A" }, { Task: "B", Priority: "someday" }])
        expect(rows[0]).toMatchObject({ priority: "medium", priorityMatched: true })
        expect(rows[1]).toMatchObject({ priority: "medium", priorityMatched: false, priorityText: "someday" })
    })

    it("flags a date it cannot read instead of guessing", () => {
        const { rows } = todoRowsFromRecords([{ Task: "A", Due: "31/02/2026" }, { Task: "B", Due: "next week" }])
        expect(rows.map((r) => [r.dueDate, r.dueInvalid])).toEqual([[null, true], [null, true]])
    })

    it("reads day-first and month-name dates", () => {
        const { rows } = todoRowsFromRecords([{ Task: "A", Due: "06/11/2026" }, { Task: "B", Due: "6 Nov 2026" }])
        expect(rows[0]!.dueDate).toBe(rows[1]!.dueDate)
    })

    it("skips rows without a task and counts them", () => {
        const preview = todoRowsFromRecords([{ Task: "", Due: "2026-11-20" }, { Task: "Real" }])
        expect(preview.rows.map((r) => r.text)).toEqual(["Real"])
        expect(preview.skippedEmpty).toBe(1)
    })

    it("clips long text and caps the row count", () => {
        const long = "x".repeat(TODO_TEXT_MAX + 5)
        const many = Array.from({ length: TODO_IMPORT_MAX_ROWS + 3 }, (_, i) => ({ Task: i === 0 ? long : `T${i}` }))
        const preview = todoRowsFromRecords(many)
        expect(preview.rows[0]!.text).toHaveLength(TODO_TEXT_MAX)
        expect(preview.rows[0]!.textTooLong).toBe(true)
        expect(preview.rows).toHaveLength(TODO_IMPORT_MAX_ROWS)
        expect(preview.truncated).toBe(true)
    })
})

describe("readTodoFile", () => {
    it("reads a CSV with a byte order mark", async () => {
        const csv = Buffer.from("﻿Task,Due date,Priority,Done\nBuy stock,2026-11-20,Low,no\n", "utf8")
        const preview = await readTodoFile(csv, "text/csv")
        expect(preview.rows[0]).toMatchObject({ text: "Buy stock", priority: "low", completed: false })
    })

    it("refuses a file with no task column", async () => {
        await expect(readTodoFile(Buffer.from("Name,Age\nA,3\n"), "text/csv")).rejects.toThrow(/column called Task/)
    })
})
