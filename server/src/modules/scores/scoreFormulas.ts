
export const MIN_RANK_VOLUME = 5

export const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10)

export const rawPct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null)

export const pct = (part: number, whole: number): number | null => round1(rawPct(part, whole))

export type RunOutcome = { id: string; complete: boolean; onTime: boolean; missed: boolean; submitted?: boolean; approved?: boolean; sentBack?: boolean }

export type RunTally = {
    assigned: number
    completed: number
    onTime: number
    missed: number
    open: number
    due: number
    submitted: number
    approved: number
    sentBack: number
}

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

export const runCompletionPct = (t: Pick<RunTally, "completed" | "due">): number | null => pct(t.completed, t.due)
export const onTimeOfFinishedPct = (onTime: number, finished: number): number | null => pct(onTime, finished)
export const metDeadlinePct = (onTime: number, due: number): number | null => pct(onTime, due)

export const notDone = (due: number, done: number): number => Math.max(0, due - done)
export const lateOf = (done: number, onTime: number): number => Math.max(0, done - onTime)

export type WeightedAnswers = { weightedGood: number; weightedScored: number }

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

export type OverallInput = { due: number; completion: number | null; compliance: number | null }

export const overallOf = (modules: readonly OverallInput[]): number | null => {
    const values: number[] = []
    for (const m of modules) {
        if (m.due <= 0) continue
        if (m.completion !== null) values.push(m.completion)
        if (m.compliance !== null) values.push(m.compliance)
    }
    return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null
}

export const moduleScoreOf = (due: number, completion: number | null, compliance: number | null): number | null => overallOf([{ due, completion, compliance }])

export const isRankable = (due: number): boolean => due >= MIN_RANK_VOLUME
