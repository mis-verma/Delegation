import { describe, expect, it } from "vitest"
import { createTaskSchema, listTasksQuerySchema } from "./task.validation.js"
import { createTaskChecklistSchema } from "../taskChecklists/taskChecklist.validation.js"

describe("task validation", () => {
    it("reads archived=false as false, not true", () => {
        expect(listTasksQuerySchema.parse({ archived: "false" }).archived).toBe(false)
        expect(listTasksQuerySchema.parse({ archived: "1" }).archived).toBe(true)
        expect(listTasksQuerySchema.parse({}).archived).toBeUndefined()
    })

    it("rejects a title the database cannot store", () => {
        expect(createTaskSchema.safeParse({ title: "a".repeat(192) }).success).toBe(false)
        expect(createTaskSchema.safeParse({ title: "   " }).success).toBe(false)
        expect(createTaskSchema.safeParse({ title: "a".repeat(191) }).success).toBe(true)
    })

    it("drops repeated additional assignees", () => {
        const parsed = createTaskSchema.parse({ title: "x", additionalAssigneeIds: ["a".repeat(25), "a".repeat(25)] })
        expect(parsed.additionalAssigneeIds).toHaveLength(1)
    })

    it("rejects a checklist item that needs more photos than it allows", () => {
        const bad = createTaskChecklistSchema.safeParse({ title: "t", items: [{ label: "l", requiredImageCount: 3, maxImageCount: 1 }] })
        expect(bad.success).toBe(false)
        const ok = createTaskChecklistSchema.safeParse({ title: "t", items: [{ label: "l", requiredImageCount: 1, maxImageCount: 3 }] })
        expect(ok.success).toBe(true)
    })
})
