import { describe, expect, it, vi, beforeEach } from "vitest"

const summary = vi.hoisted(() => ({
    task: vi.fn(),
    ticket: vi.fn(),
    todo: vi.fn(),
    checklist: vi.fn(),
}))

vi.mock("../tasks/task.service.js", () => ({ taskService: { summary: summary.task } }))
vi.mock("../tickets/ticket.service.js", () => ({ ticketService: { summary: summary.ticket } }))
vi.mock("../todos/todo.service.js", () => ({ todoService: { summary: summary.todo } }))
vi.mock("../checklistInstances/checklistInstance.service.js", () => ({ checklistInstanceService: { summary: summary.checklist } }))

import { dashboardService } from "./dashboard.service.js"

const user = { sub: "u1" } as never
const query = { scope: "mine", today: "2026-10-29T00:00:00.000Z" } as never

describe("dashboardService.summaries", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        summary.task.mockResolvedValue({ t: 1 })
        summary.ticket.mockResolvedValue({ k: 1 })
        summary.todo.mockResolvedValue({ d: 1 })
        summary.checklist.mockResolvedValue({ c: 1 })
    })

    it("returns every part when all succeed", async () => {
        expect(await dashboardService.summaries(user, query)).toEqual({ tasksKpi: { t: 1 }, ticketsKpi: { k: 1 }, todos: { d: 1 }, checklistToday: { c: 1 } })
    })

    it("keeps the parts that worked when one fails", async () => {
        summary.checklist.mockRejectedValue(new Error("slow"))
        const result = await dashboardService.summaries(user, query)
        expect(result.checklistToday).toBeUndefined()
        expect(result.tasksKpi).toEqual({ t: 1 })
        expect(result.ticketsKpi).toEqual({ k: 1 })
    })

    it("fails when every part fails", async () => {
        for (const fn of Object.values(summary)) fn.mockRejectedValue(new Error("down"))
        await expect(dashboardService.summaries(user, query)).rejects.toThrow("down")
    })
})
