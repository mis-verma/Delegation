// The one place the score numbers are defined. Every score endpoint (the scores report and cards, the
// compliance board / Team Overview report, the daily Fill report) builds its figures from these functions, so
// the same run never produces two different numbers.
//
// Definitions (owner approved):
//  - A checklist run is DUE when its deadline has passed or it is completed. An open run still before its
//    deadline is in neither side: there is no partial credit.
//  - Completion = completed runs / due runs. Missed = due and not completed.
//  - On time (of finished) = completed before the cutoff / completed. Met deadline = completed before the
//    cutoff / due.
//  - Compliance is POOLED: sum of weighted good answers / sum of weighted checked answers (critical x2,
//    sent back = fail, N/A neutral). It is never an average of percentages.
//  - Tickets and delegations: completion = done / due, notDone = due - done. Done = handed in or approved
//    (an item waiting for approval counts at once).
//  - Overall = completion and compliance of every module with something due, averaged equally.
//  - Nothing is rounded before it is averaged. Percentages leave the server with one decimal at most.

/** Fewest due items a person, department or store needs to be ranked. Same value as the client's MIN_RANK_VOLUME. */
export const MIN_RANK_VOLUME = 5

/** One decimal, or null. Only for the final figure a client sees. */
export const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10)

/** part / whole as a percentage, unrounded; null when there is no whole. */
export const rawPct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null)

/** part / whole as a percentage with one decimal; null when there is no whole. */
export const pct = (part: number, whole: number): number | null => round1(rawPct(part, whole))

/** What one run came to, as the formulas need it. */
export type RunOutcome = { id: string; complete: boolean; onTime: boolean; missed: boolean; submitted?: boolean; approved?: boolean; sentBack?: boolean }

export type RunTally = {
    /** Runs counted at all (completed, missed or still open). */
    assigned: number
    completed: number
    onTime: number
    missed: number
    /** Not completed and still before the deadline: shown on its own, in neither completion nor on time. */
    open: number
    /** completed + missed. */
    due: number
    submitted: number
    approved: number
    sentBack: number
}

/**
 * Adds runs up. A run counts ONCE however many people it is assigned to: pass every run of the group and
 * repeated ids (a shared run listed once per assignee) are ignored.
 */
export const tallyRuns = (runs: Iterable<RunOutcome>): RunTally => {
    const seen = new Set<string>()
    const t: RunTally = { assigned: 0, completed: 0, onTime: 0, missed: 0, open: 0, due: 0, submitted: 0, approved: 0, sentBack: 0 }
    for (const r of runs) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        t.assigned += 1
        if (r.complete) t.completed += 1
        if (r.complete && r.onTime) t.onTime += 1
        if (r.missed && !r.complete) t.missed += 1
        if (r.submitted) t.submitted += 1
        if (r.approved) t.approved += 1
        if (r.sentBack) t.sentBack += 1
    }
    t.due = t.completed + t.missed
    t.open = t.assigned - t.due
    return t
}

/** Completion for runs: completed / due. Open runs are not in either side. */
export const runCompletionPct = (t: Pick<RunTally, "completed" | "due">): number | null => pct(t.completed, t.due)
/** On time of finished: completed on time / completed. */
export const onTimeOfFinishedPct = (onTime: number, finished: number): number | null => pct(onTime, finished)
/** Met deadline: finished on time / due. Late and not-done items both count against it. */
export const metDeadlinePct = (onTime: number, due: number): number | null => pct(onTime, due)

/** Due but not done. For tickets and delegations, done means handed in or approved: an item waiting for approval counts as done. */
export const notDone = (due: number, done: number): number => Math.max(0, due - done)
/** Finished, but after the deadline. */
export const lateOf = (done: number, onTime: number): number => Math.max(0, done - onTime)

/** The raw weights behind a compliance figure: weighted good answers and weighted checked answers. */
export type WeightedAnswers = { weightedGood: number; weightedScored: number }

/** Pooled compliance, unrounded: sum(weighted good) / sum(weighted checked). Never an average of percentages. */
export const pooledComplianceRaw = (parts: readonly WeightedAnswers[]): number | null => {
    let good = 0
    let scored = 0
    for (const p of parts) {
        good += p.weightedGood
        scored += p.weightedScored
    }
    return rawPct(good, scored)
}
export const pooledCompliancePct = (parts: readonly WeightedAnswers[]): number | null => round1(pooledComplianceRaw(parts))

/** A module's completion and compliance as they feed the Overall score (raw, unrounded). */
export type OverallInput = { due: number; completion: number | null; compliance: number | null }

/**
 * Overall score: completion and compliance of every module with something due, counted equally and
 * averaged UNROUNDED. Null when nothing was due.
 */
export const overallOf = (modules: readonly OverallInput[]): number | null => {
    const values: number[] = []
    for (const m of modules) {
        if (m.due <= 0) continue
        if (m.completion !== null) values.push(m.completion)
        if (m.compliance !== null) values.push(m.compliance)
    }
    return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null
}

/**
 * One module's own score (the Checklist score of the Report scoreboard): completion and compliance counted
 * equally, averaged UNROUNDED, then one decimal. Completion stands alone when nothing was checked yet; null
 * when nothing is due. Exactly `overallOf` over a single module.
 */
export const moduleScoreOf = (due: number, completion: number | null, compliance: number | null): number | null => overallOf([{ due, completion, compliance }])

/** A group is rankable (shown on a leaderboard or as a winner) only with enough due work. */
export const isRankable = (due: number): boolean => due >= MIN_RANK_VOLUME
