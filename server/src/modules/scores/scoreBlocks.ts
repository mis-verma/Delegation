import type { ReportMetrics } from "../checklistReports/checklistReport.service.js"
import { isRankable, lateOf, metDeadlinePct, moduleScoreOf, notDone, onTimeOfFinishedPct, overallOf, pct, rawPct, round1 } from "./scoreFormulas.js"

const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1, on_hold: 0 }
const OVERDUE_EXEMPT_STATUSES = new Set(["done", "draft", "pending_approval"])

export type ChecklistScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    metDeadlinePct: number | null
    onTime: number
    due: number
    completed: number
    done: number
    missed: number
    notDone: number
    late: number
    open: number
    submitted: number
    approved: number
    answersChecked: number
    weightedGood: number
    weightedScored: number
}

export type TicketScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    metDeadlinePct: number | null
    due: number
    closed: number
    done: number
    notDone: number
    onTime: number
    late: number
    waitingOnTime: number
    reopened: number
    open: number
}
export type DelegationScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    metDeadlinePct: number | null
    due: number
    done: number
    notDone: number
    onTime: number
    late: number
    overdue: number
    waitingOnTime: number
    open: number
}

export type ModuleBlocks = { checklist: ChecklistScore; ticket: TicketScore; delegation: DelegationScore }

export const sum = <T,>(rows: readonly T[], pick: (r: T) => number) => rows.reduce((total, r) => total + pick(r), 0)

export const EMPTY_METRICS: ReportMetrics = {
    assigned: 0, completed: 0, completionPct: null, onTime: 0, onTimePct: null, onTimeOfFinishedPct: null, metDeadlinePct: null, due: 0, open: 0, missed: 0,
    submitted: 0, approved: 0, sentBack: 0, questionsDone: 0, notApplicable: 0, answersChecked: 0, compliancePct: null, weightedGood: 0, weightedScored: 0,
}

export const foldChecklist = (m: ReportMetrics | null | undefined): ChecklistScore => {
    const r = m ?? EMPTY_METRICS
    return {
        score: moduleScoreOf(r.due, rawPct(r.completed, r.due), rawPct(r.weightedGood, r.weightedScored)),
        completionPct: r.completionPct,
        compliancePct: r.compliancePct,
        onTimePct: r.onTimeOfFinishedPct,
        onTimeOfFinishedPct: r.onTimeOfFinishedPct,
        metDeadlinePct: r.metDeadlinePct,
        onTime: r.onTime,
        due: r.due,
        completed: r.completed,
        done: r.completed,
        missed: r.missed,
        notDone: notDone(r.due, r.completed),
        late: lateOf(r.completed, r.onTime),
        open: r.open,
        submitted: r.submitted,
        approved: r.approved,
        answersChecked: r.answersChecked,
        weightedGood: r.weightedGood,
        weightedScored: r.weightedScored,
    }
}

export type TaskLike = { status: string; dueDate: Date | null; finishedAt: Date | null }
export type TicketLike = { status: string; tatDueAt: Date | null; closedAt: Date | null; submittedAt: Date | null; reopenCount?: number }
export type ScoreWindow = { start: Date; end: Date }

const inWindow = (d: Date | null, win: ScoreWindow): d is Date => d !== null && d >= win.start && d < win.end

export const foldTasks = (rows: readonly TaskLike[], now: Date, win: ScoreWindow): DelegationScore => {
    const inside = rows.filter((t) => t.status !== "draft" && inWindow(t.dueDate, win))
    const due = inside.filter((t) => t.status === "done" || t.status === "pending_approval" || (t.dueDate !== null && t.dueDate < now))
    const weighted = sum(due, (t) => TASK_WEIGHT[t.status] ?? 0)
    const approved = due.filter((t) => t.status === "done")
    const done = due.filter((t) => t.status === "done" || t.status === "pending_approval")
    const onTime = approved.filter((t) => !t.dueDate || !t.finishedAt || t.finishedAt <= t.dueDate).length
    const waitingOnTime = due.filter((t) => t.status === "pending_approval" && t.dueDate !== null && t.finishedAt !== null && t.finishedAt <= t.dueDate).length
    return {
        score: due.length ? round1((weighted / due.length) * 100) : null,
        completionPct: pct(done.length, due.length),
        compliancePct: pct(onTime + waitingOnTime, due.length),
        onTimePct: onTimeOfFinishedPct(onTime + waitingOnTime, done.length),
        onTimeOfFinishedPct: onTimeOfFinishedPct(onTime + waitingOnTime, done.length),
        metDeadlinePct: metDeadlinePct(onTime + waitingOnTime, due.length),
        due: due.length,
        done: done.length,
        notDone: notDone(due.length, done.length),
        onTime,
        late: lateOf(done.length, onTime + waitingOnTime),
        waitingOnTime,
        overdue: due.filter((t) => !OVERDUE_EXEMPT_STATUSES.has(t.status) && t.dueDate !== null && t.dueDate < now).length,
        open: inside.length - due.length,
    }
}

export const foldTickets = (rows: readonly TicketLike[], now: Date, win: ScoreWindow): TicketScore => {
    const inside = rows.filter((t) => inWindow(t.tatDueAt, win))
    const reopened = (t: TicketLike) => (t.reopenCount ?? 0) > 0
    const due = inside.filter((t) => t.status === "CLOSED" || t.status === "PENDING_APPROVAL" || reopened(t) || (t.tatDueAt !== null && t.tatDueAt < now))
    const closed = due.filter((t) => t.status === "CLOSED")
    const done = due.filter((t) => t.status === "CLOSED" || t.status === "PENDING_APPROVAL")
    const onTime = closed.filter((t) => {
        if (reopened(t)) return false
        const finished = t.submittedAt ?? t.closedAt
        return finished && t.tatDueAt && finished <= t.tatDueAt
    }).length
    const waitingOnTime = due.filter((t) => t.status === "PENDING_APPROVAL" && !reopened(t) && t.submittedAt !== null && t.tatDueAt !== null && t.submittedAt <= t.tatDueAt).length
    const compliancePct = pct(onTime + waitingOnTime, due.length)
    return {
        score: compliancePct,
        completionPct: pct(done.length, due.length),
        compliancePct,
        onTimePct: onTimeOfFinishedPct(onTime + waitingOnTime, done.length),
        onTimeOfFinishedPct: onTimeOfFinishedPct(onTime + waitingOnTime, done.length),
        metDeadlinePct: metDeadlinePct(onTime + waitingOnTime, due.length),
        due: due.length,
        closed: closed.length,
        done: done.length,
        notDone: notDone(due.length, done.length),
        onTime,
        late: lateOf(done.length, onTime + waitingOnTime),
        waitingOnTime,
        reopened: due.filter(reopened).length,
        open: inside.length - due.length,
    }
}

export const overallOfBlocks = (b: ModuleBlocks): number | null =>
    overallOf([
        { due: b.checklist.due, completion: rawPct(b.checklist.completed, b.checklist.due), compliance: rawPct(b.checklist.weightedGood, b.checklist.weightedScored) },
        { due: b.ticket.due, completion: rawPct(b.ticket.done, b.ticket.due), compliance: rawPct(b.ticket.onTime + b.ticket.waitingOnTime, b.ticket.due) },
        { due: b.delegation.due, completion: rawPct(b.delegation.done, b.delegation.due), compliance: rawPct(b.delegation.onTime + b.delegation.waitingOnTime, b.delegation.due) },
    ])
export const totalDueOf = (b: ModuleBlocks) => b.checklist.due + b.ticket.due + b.delegation.due
export const rankFields = (b: ModuleBlocks) => ({ overall: overallOfBlocks(b), totalDue: totalDueOf(b), rankable: isRankable(totalDueOf(b)) })

export const emptyBlocks = (): ModuleBlocks => ({
    checklist: foldChecklist(null),
    ticket: foldTickets([], new Date(0), { start: new Date(0), end: new Date(0) }),
    delegation: foldTasks([], new Date(0), { start: new Date(0), end: new Date(0) }),
})
