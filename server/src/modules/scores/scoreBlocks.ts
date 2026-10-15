// The per-module score blocks (checklist, ticket, delegation) and the pure functions that fold raw rows
// into them. No database access here: score.service.ts fetches the rows, this file counts them, so the
// folding rules can be tested on small in-memory fixtures.
import type { ReportMetrics } from "../checklistReports/checklistReport.service.js"
import { isRankable, lateOf, metDeadlinePct, moduleScoreOf, notDone, onTimeOfFinishedPct, overallOf, pct, rawPct, round1 } from "./scoreFormulas.js"

// Same weights as TASK_SCORE on the client: started is a quarter, handed in for approval three
// quarters, only done is the full mark.
const TASK_WEIGHT: Record<string, number> = { draft: 0, todo: 0, in_progress: 0.25, pending_approval: 0.75, done: 1, on_hold: 0 }
const OVERDUE_EXEMPT_STATUSES = new Set(["done", "draft", "pending_approval"])

// All percentages are 0-100 with one decimal at most (null = nothing to measure). Counts are exact. Every
// module block carries the same count words: due, done, onTime, late, notDone, open.
export type ChecklistScore = {
    /**
     * THE Checklist score (the Report scoreboard's headline number): completion and compliance counted
     * equally and averaged before any rounding; completion alone when no answer was checked yet; null when
     * nothing is due. Same rule as the Overall score, applied to this one module.
     */
    score: number | null
    /** Run based: completed / due. Runs still open before their deadline are in neither side. */
    completionPct: number | null
    /** Pooled weighted compliance: weightedGood / weightedScored. */
    compliancePct: number | null
    /** Same figure as onTimeOfFinishedPct, kept for older callers. */
    onTimePct: number | null
    /** Of the runs that were finished, the share finished on time: onTime / completed. */
    onTimeOfFinishedPct: number | null
    /** onTime / due: late and missed runs both count against it. */
    metDeadlinePct: number | null
    onTime: number
    /** Runs that have come due: completed, or past their deadline. Runs still ahead are left out. */
    due: number
    completed: number
    /** Same as completed, named like the other modules. */
    done: number
    missed: number
    /** Same as missed (due - done), named like the other modules. */
    notDone: number
    /** Finished, but after the cutoff: completed - onTime. */
    late: number
    /** Not completed and still before the deadline: in no percentage. */
    open: number
    submitted: number
    approved: number
    /** Raw weights behind compliancePct, to pool rows without averaging percentages. */
    answersChecked: number
    weightedGood: number
    weightedScored: number
}

/**
 * `late` = closed after the due time. Open tickets are not late here; they are due - closed ("not done").
 * `waitingOnTime` = handed in on or before the due time and still waiting for approval: not done yet, but
 * on time, so it counts toward compliance (the worker's clock stopped at hand-in).
 * `done` = `closed`; `notDone` = due - done, so a ticket waiting for approval is still not done until approved.
 * `open` = due date inside the window but still ahead of now, not closed: in no percentage.
 */
export type TicketScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    /** onTime / closed. */
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    /** (onTime + waitingOnTime) / due; the same figure as compliancePct. */
    metDeadlinePct: number | null
    due: number
    closed: number
    done: number
    notDone: number
    onTime: number
    late: number
    waitingOnTime: number
    /** Sent back or reopened by a reviewer after it was handed in or closed: counted, and never on time. */
    reopened: number
    open: number
}
export type DelegationScore = {
    score: number | null
    completionPct: number | null
    compliancePct: number | null
    /** onTime / done. */
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    /** (onTime + waitingOnTime) / due; the same figure as compliancePct. */
    metDeadlinePct: number | null
    due: number
    done: number
    /** due - done: waiting-for-approval items stay here until approved. */
    notDone: number
    onTime: number
    /** Done, but after the due date: done - onTime. */
    late: number
    /** Past due and not done, not counting drafts or items waiting for approval. */
    overdue: number
    waitingOnTime: number
    /** Due date inside the window but still ahead of now, not done, not a draft: in no percentage. */
    open: number
}

export type ModuleBlocks = { checklist: ChecklistScore; ticket: TicketScore; delegation: DelegationScore }

export const sum = <T,>(rows: readonly T[], pick: (r: T) => number) => rows.reduce((total, r) => total + pick(r), 0)

export const EMPTY_METRICS: ReportMetrics = {
    assigned: 0, completed: 0, completionPct: null, onTime: 0, onTimePct: null, onTimeOfFinishedPct: null, metDeadlinePct: null, due: 0, open: 0, missed: 0,
    submitted: 0, approved: 0, sentBack: 0, questionsDone: 0, notApplicable: 0, answersChecked: 0, compliancePct: null, weightedGood: 0, weightedScored: 0,
}

// Checklist block for one person, department, store or the whole organisation. `m` is already pooled and
// de-duplicated by the checklist report (a shared run counts once for a group), so this only renames.
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
/** The score window as instants: `start` included, `end` excluded (the first instant after the last day). */
export type ScoreWindow = { start: Date; end: Date }

const inWindow = (d: Date | null, win: ScoreWindow): d is Date => d !== null && d >= win.start && d < win.end

// Delegations. "Due" means the due DATE is inside the window and has come (or the item is already done): an
// item finished early whose due date is after the window end does not belong to this window at all, and an
// item with no due date is never counted. Drafts are private and never count.
export const foldTasks = (rows: readonly TaskLike[], now: Date, win: ScoreWindow): DelegationScore => {
    const inside = rows.filter((t) => t.status !== "draft" && inWindow(t.dueDate, win))
    // Handed in counts as done: the assignee has finished their part, so completion reflects it at once. The
    // reviewer's decision is what moves it from waiting to approved, not whether it counts.
    const due = inside.filter((t) => t.status === "done" || t.status === "pending_approval" || (t.dueDate !== null && t.dueDate < now))
    const weighted = sum(due, (t) => TASK_WEIGHT[t.status] ?? 0)
    const approved = due.filter((t) => t.status === "done")
    const done = due.filter((t) => t.status === "done" || t.status === "pending_approval")
    // Done with no finish time on record cannot be late.
    const onTime = approved.filter((t) => !t.dueDate || !t.finishedAt || t.finishedAt <= t.dueDate).length
    // Handed in by the due date and waiting for a reviewer: on time for compliance, and never overdue.
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
        // One overdue rule for delegations everywhere (list, dashboard summary, ownerStats): past due and
        // not done, draft or waiting for approval. Handed-in work has stopped the assignee's clock;
        // on hold still counts.
        overdue: due.filter((t) => !OVERDUE_EXEMPT_STATUSES.has(t.status) && t.dueDate !== null && t.dueDate < now).length,
        open: inside.length - due.length,
    }
}

// Tickets: completion is the share of due tickets closed, compliance the share handed in on or before
// their due time (closed, or waiting for approval). Same window rule as delegations: a ticket counts only
// when its due time is inside the window, so a ticket closed early with a later due date is not in this one.
export const foldTickets = (rows: readonly TicketLike[], now: Date, win: ScoreWindow): TicketScore => {
    const inside = rows.filter((t) => inWindow(t.tatDueAt, win))
    // Handed in counts as done (see foldTasks): completion reflects the assignee's hand-in at once, and the
    // approver's decision does not change whether it counts.
    // A ticket sent back or reopened counts at once, whatever state it is in now: it was handed in or closed and a
    // reviewer had to send it back, which fails the compliance check, like a checklist question sent back.
    const reopened = (t: TicketLike) => (t.reopenCount ?? 0) > 0
    const due = inside.filter((t) => t.status === "CLOSED" || t.status === "PENDING_APPROVAL" || reopened(t) || (t.tatDueAt !== null && t.tatDueAt < now))
    const closed = due.filter((t) => t.status === "CLOSED")
    const done = due.filter((t) => t.status === "CLOSED" || t.status === "PENDING_APPROVAL")
    // Judged from when the work was handed in, so a slow approval doesn't make the worker late. Tickets
    // closed before the hand-in time was recorded fall back to their closing time.
    const onTime = closed.filter((t) => {
        if (reopened(t)) return false
        const finished = t.submittedAt ?? t.closedAt
        return finished && t.tatDueAt && finished <= t.tatDueAt
    }).length
    // Handed in on time and waiting for approval: on time for compliance, not closed for completion.
    const waitingOnTime = due.filter((t) => t.status === "PENDING_APPROVAL" && !reopened(t) && t.submittedAt !== null && t.tatDueAt !== null && t.submittedAt <= t.tatDueAt).length
    const compliancePct = pct(onTime + waitingOnTime, due.length)
    // Late = closed, but after the due time. Tickets still open are "not done" (due - closed), never
    // late as well, so the two never count the same ticket twice.
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

/**
 * Overall score for one set of module blocks, from the RAW ratios behind the percentages (so nothing is
 * rounded before it is averaged): completion and compliance of every module with something due.
 */
export const overallOfBlocks = (b: ModuleBlocks): number | null =>
    overallOf([
        { due: b.checklist.due, completion: rawPct(b.checklist.completed, b.checklist.due), compliance: rawPct(b.checklist.weightedGood, b.checklist.weightedScored) },
        { due: b.ticket.due, completion: rawPct(b.ticket.done, b.ticket.due), compliance: rawPct(b.ticket.onTime + b.ticket.waitingOnTime, b.ticket.due) },
        { due: b.delegation.due, completion: rawPct(b.delegation.done, b.delegation.due), compliance: rawPct(b.delegation.onTime + b.delegation.waitingOnTime, b.delegation.due) },
    ])
export const totalDueOf = (b: ModuleBlocks) => b.checklist.due + b.ticket.due + b.delegation.due
export const rankFields = (b: ModuleBlocks) => ({ overall: overallOfBlocks(b), totalDue: totalDueOf(b), rankable: isRankable(totalDueOf(b)) })

/** A block set with nothing in it, for rows that carry only one module. */
export const emptyBlocks = (): ModuleBlocks => ({
    checklist: foldChecklist(null),
    ticket: foldTickets([], new Date(0), { start: new Date(0), end: new Date(0) }),
    delegation: foldTasks([], new Date(0), { start: new Date(0), end: new Date(0) }),
})
