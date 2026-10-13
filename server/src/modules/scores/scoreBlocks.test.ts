import { describe, expect, it } from "vitest"
import { EMPTY_METRICS, foldChecklist, foldTasks, foldTickets, overallOfBlocks, type ScoreWindow, type TaskLike, type TicketLike } from "./scoreBlocks.js"

const d = (iso: string) => new Date(`${iso}Z`)
// The window is 1 Oct to 10 Oct (end excluded = 11 Oct 00:00), and "now" is the evening of 10 Oct.
const win: ScoreWindow = { start: d("2026-10-01T00:00:00"), end: d("2026-10-11T00:00:00") }
const now = d("2026-10-10T18:00:00")

const ticket = (o: Partial<TicketLike>): TicketLike => ({ status: "OPEN", tatDueAt: null, closedAt: null, submittedAt: null, ...o })
const task = (o: Partial<TaskLike>): TaskLike => ({ status: "todo", dueDate: null, finishedAt: null, ...o })

describe("foldTickets window", () => {
    it("does not count a ticket closed early whose due date is after the window end", () => {
        const early = ticket({ status: "CLOSED", tatDueAt: d("2026-10-20T10:00:00"), closedAt: d("2026-10-05T10:00:00") })
        const t = foldTickets([early], now, win)
        expect(t.due).toBe(0)
        expect(t.done).toBe(0)
        expect(t.open).toBe(0)
    })

    it("counts an early-closed ticket whose due date is inside the window", () => {
        // Due this evening (still ahead of now) but closed this morning: its due date is in the window, so it counts as done on time.
        const t = foldTickets([ticket({ status: "CLOSED", tatDueAt: d("2026-10-10T20:00:00"), closedAt: d("2026-10-10T09:00:00") })], now, win)
        expect(t.due).toBe(1)
        expect(t.done).toBe(1)
        expect(t.onTime).toBe(1)
        expect(t.completionPct).toBe(100)
    })

    it("never counts a ticket with no due time, even when closed, or one due before the window", () => {
        const t = foldTickets([ticket({ status: "CLOSED", closedAt: d("2026-10-02T10:00:00") }), ticket({ status: "CLOSED", tatDueAt: d("2026-09-30T10:00:00"), closedAt: d("2026-09-29T10:00:00") })], now, win)
        expect(t.due).toBe(0)
    })

    it("keeps an open ticket that is not due yet out of due and in open", () => {
        const t = foldTickets([ticket({ tatDueAt: d("2026-10-10T20:00:00") }), ticket({ tatDueAt: d("2026-10-03T10:00:00") })], now, win)
        expect(t.due).toBe(1)
        expect(t.open).toBe(1)
        expect(t.notDone).toBe(1)
    })

    it("counts a ticket waiting for approval on time as compliant but not done", () => {
        const t = foldTickets([ticket({ status: "PENDING_APPROVAL", tatDueAt: d("2026-10-04T10:00:00"), submittedAt: d("2026-10-04T09:00:00") })], now, win)
        expect(t.due).toBe(1)
        expect(t.done).toBe(0)
        expect(t.waitingOnTime).toBe(1)
        expect(t.compliancePct).toBe(100)
    })
})

describe("foldTasks window", () => {
    it("does not count a delegation finished early whose due date is after the window end", () => {
        const t = foldTasks([task({ status: "done", dueDate: d("2026-10-25T10:00:00"), finishedAt: d("2026-10-08T10:00:00") })], now, win)
        expect(t.due).toBe(0)
        expect(t.done).toBe(0)
    })

    it("counts done and overdue delegations due inside the window, ignores drafts and undated ones", () => {
        const rows = [
            task({ status: "done", dueDate: d("2026-10-05T10:00:00"), finishedAt: d("2026-10-05T09:00:00") }),
            task({ status: "done", dueDate: d("2026-10-06T10:00:00"), finishedAt: d("2026-10-07T09:00:00") }),
            task({ status: "in_progress", dueDate: d("2026-10-07T10:00:00") }),
            task({ status: "draft", dueDate: d("2026-10-07T10:00:00") }),
            task({ status: "todo" }),
            task({ status: "todo", dueDate: d("2026-10-10T20:00:00") }),
        ]
        const t = foldTasks(rows, now, win)
        expect(t.due).toBe(3)
        expect(t.done).toBe(2)
        expect(t.onTime).toBe(1)
        expect(t.late).toBe(1)
        expect(t.overdue).toBe(1)
        expect(t.open).toBe(1)
    })
})

describe("checklist score", () => {
    it("averages completion and compliance unrounded, completion alone with no checked answers, null with nothing due", () => {
        const both = foldChecklist({ ...EMPTY_METRICS, due: 3, completed: 2, weightedGood: 1, weightedScored: 2, completionPct: 66.7, compliancePct: 50 })
        // (66.666.. + 50) / 2 = 58.33.. -> 58.3, never the average of the rounded 66.7 and 50 (58.35 -> 58.4)
        expect(both.score).toBe(58.3)
        expect(foldChecklist({ ...EMPTY_METRICS, due: 4, completed: 3, completionPct: 75 }).score).toBe(75)
        expect(foldChecklist(null).score).toBeNull()
    })

    it("feeds the same unrounded ratios into the overall score", () => {
        const blocks = {
            checklist: foldChecklist({ ...EMPTY_METRICS, due: 3, completed: 2, weightedGood: 1, weightedScored: 2 }),
            ticket: foldTickets([], now, win),
            delegation: foldTasks([], now, win),
        }
        expect(overallOfBlocks(blocks)).toBe(blocks.checklist.score)
    })
})
