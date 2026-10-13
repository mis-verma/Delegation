// The score data check: proves the different cuts of the same numbers add up. The comparison itself
// (evaluateConsistency) is pure and tested on small fixtures; assertScoreConsistency loads the real numbers.
//
// Must-equal ("fail"): every ticket, delegation and checklist run is counted once per cut.
//   tickets      org = sum of departments (incl. No department) = sum of stores (incl. no store) = sum of people (incl. Unassigned and left)
//   delegations  org = sum of departments = sum of stores   (people are not compared: a shared delegation is on each assignee)
//   checklists   org = sum of stores                         (each run sits on exactly one store)
//   explorer total = /scores org total = report total
//   a sample of people: the person card = the explorer row
// Explained gaps ("flag", never a failure): checklist org against the sum of departments and against the sum of
// people. A run shared across departments or people is counted in each of them, and a run with nobody on it is on no
// department and no person, so these can legitimately differ; the flag states the gap and the number of shared runs.

export type CountMetrics = { due: number; done: number; onTime: number }
/** Anything with the three module blocks: an explorer row, a score card or a report row. */
export type CountBlocks = { checklist: CountMetrics; ticket: CountMetrics; delegation: CountMetrics }

export type ConsistencyStatus = "pass" | "fail" | "flag"
export type ConsistencyCheck = {
    id: string
    label: string
    expected: number
    actual: number
    diff: number
    status: ConsistencyStatus
    explanation: string
}
export type ConsistencyResult = { ok: boolean; from: string; to: string; failed: number; flagged: number; checks: ConsistencyCheck[] }

export type ConsistencySample = { id: string; name: string; card: CountBlocks; row: CountBlocks }

export type ConsistencyInput = {
    from: string
    to: string
    explorerTotal: CountBlocks
    scoresOrg: CountBlocks
    reportTotal: CountBlocks
    departments: readonly CountBlocks[]
    stores: readonly CountBlocks[]
    /** Every person row of the explorer, including the Unassigned row and people who have left. */
    people: readonly CountBlocks[]
    samples: readonly ConsistencySample[]
    sharing: { runsAcrossDepartments: number; runsWithSeveralAssignees: number; runsWithoutAssignee: number }
}

type ModuleName = keyof CountBlocks
type MetricName = keyof CountMetrics
const MODULES: readonly ModuleName[] = ["checklist", "ticket", "delegation"]
const METRICS: readonly MetricName[] = ["due", "done", "onTime"]
const MODULE_LABEL: Record<ModuleName, string> = { checklist: "Checklist runs", ticket: "Tickets", delegation: "Delegations" }
const METRIC_LABEL: Record<MetricName, string> = { due: "due", done: "done", onTime: "on time" }

const total = (rows: readonly CountBlocks[], m: ModuleName, k: MetricName) => rows.reduce((n, r) => n + r[m][k], 0)

const makeCheck = (id: string, label: string, expected: number, actual: number, onGap: ConsistencyStatus, explainGap: (diff: number) => string): ConsistencyCheck => {
    const diff = actual - expected
    return { id, label, expected, actual, diff, status: diff === 0 ? "pass" : onGap, explanation: diff === 0 ? "Equal." : explainGap(diff) }
}

const gapWord = (diff: number) => (diff > 0 ? `${diff} too many` : `${-diff} missing`)

export const evaluateConsistency = (input: ConsistencyInput): ConsistencyResult => {
    const checks: ConsistencyCheck[] = []
    const org = input.explorerTotal

    // Must-equal: partitions of the organisation.
    const partitions: { module: ModuleName; against: "departments" | "stores" | "people"; rows: readonly CountBlocks[]; cause: string }[] = [
        { module: "ticket", against: "departments", rows: input.departments, cause: "a ticket is missing from, or double counted in, the department rows (check the No department row)" },
        { module: "ticket", against: "stores", rows: input.stores, cause: "a ticket is missing from, or double counted in, the store rows (check the Other / no store row)" },
        { module: "ticket", against: "people", rows: input.people, cause: "a ticket is missing from, or double counted in, the people rows (check Unassigned and people who have left)" },
        { module: "delegation", against: "departments", rows: input.departments, cause: "a delegation is missing from, or double counted in, the department rows (check the No department row)" },
        { module: "delegation", against: "stores", rows: input.stores, cause: "a delegation is missing from, or double counted in, the store rows (check the Other / no store row)" },
        { module: "checklist", against: "stores", rows: input.stores, cause: "a checklist run is missing from, or double counted in, the store rows (each run belongs to one store)" },
    ]
    for (const p of partitions) {
        for (const k of METRICS) {
            checks.push(makeCheck(
                `${p.module}.${p.against}.${k}`,
                `${MODULE_LABEL[p.module]} ${METRIC_LABEL[k]}: organisation = sum of ${p.against}`,
                org[p.module][k],
                total(p.rows, p.module, k),
                "fail",
                (diff) => `The ${p.against} add up to ${gapWord(diff)} against the organisation: ${p.cause}.`,
            ))
        }
    }

    // Must-equal: the same total read three ways.
    for (const m of MODULES) {
        for (const k of METRICS) {
            checks.push(makeCheck(
                `total.scores.${m}.${k}`,
                `${MODULE_LABEL[m]} ${METRIC_LABEL[k]}: explorer total = /scores org total`,
                org[m][k],
                input.scoresOrg[m][k],
                "fail",
                (diff) => `The score card for the whole organisation differs by ${diff} from the explorer total: the two read the window or the rules differently.`,
            ))
        }
    }
    for (const m of MODULES) {
        for (const k of METRICS) {
            checks.push(makeCheck(
                `total.report.${m}.${k}`,
                `${MODULE_LABEL[m]} ${METRIC_LABEL[k]}: explorer total = report total`,
                org[m][k],
                input.reportTotal[m][k],
                "fail",
                (diff) => `The report total differs by ${diff} from the explorer total: the two read the window or the rules differently.`,
            ))
        }
    }

    // Must-equal: person card = explorer row.
    for (const s of input.samples) {
        for (const k of ["due", "done"] as const) {
            const card = MODULES.reduce((n, m) => n + s.card[m][k], 0)
            const row = MODULES.reduce((n, m) => n + s.row[m][k], 0)
            checks.push(makeCheck(
                `person.${s.id}.${k}`,
                `${s.name}: ${METRIC_LABEL[k]} on the person card = explorer row`,
                card,
                row,
                "fail",
                (diff) => `The explorer row is ${gapWord(diff)} against the person card: the two count this person's work by different rules.`,
            ))
        }
    }

    // Flag only: checklist runs shared across departments or people, or with nobody on them.
    const shared = input.sharing
    for (const against of ["departments", "people"] as const) {
        const rows = against === "departments" ? input.departments : input.people
        for (const k of METRICS) {
            checks.push(makeCheck(
                `checklist.${against}.${k}.flag`,
                `Checklist runs ${METRIC_LABEL[k]}: organisation vs sum of ${against}`,
                org.checklist[k],
                total(rows, "checklist", k),
                "flag",
                (diff) => against === "departments"
                    ? `A run is counted once for the organisation but once in every department that has someone on it: ${shared.runsAcrossDepartments} runs are shared across departments, ${shared.runsWithoutAssignee} have nobody assigned (no department row carries them). Gap ${diff > 0 ? "+" : ""}${diff}.`
                    : `A run is counted once for the organisation but once per person on it: ${shared.runsWithSeveralAssignees} runs have several assignees, ${shared.runsWithoutAssignee} have nobody assigned (they sit on Unassigned). Gap ${diff > 0 ? "+" : ""}${diff}.`,
            ))
        }
    }

    const failed = checks.filter((c) => c.status === "fail").length
    const flagged = checks.filter((c) => c.status === "flag").length
    return { ok: failed === 0, from: input.from, to: input.to, failed, flagged, checks }
}

/** Last month and month-to-date (capped at today), for the nightly job. `today` is an org-local YYYY-MM-DD. */
export const nightlyWindows = (today: string): { label: string; from: string; to: string }[] => {
    const [y, m] = today.split("-").map(Number)
    const pad = (n: number) => String(n).padStart(2, "0")
    const firstThis = `${y}-${pad(m)}-01`
    const lastPrevMs = Date.parse(`${firstThis}T00:00:00.000Z`) - 86_400_000
    const lastPrev = new Date(lastPrevMs).toISOString().slice(0, 10)
    return [
        { label: "last month", from: `${lastPrev.slice(0, 8)}01`, to: lastPrev },
        { label: "month to date", from: firstThis, to: today },
    ]
}

/** How many people the check compares against their card. */
export const CONSISTENCY_SAMPLE_SIZE = 5

/**
 * Loads the real numbers for the window and runs evaluateConsistency over them. ADMIN-level: callers (the endpoint,
 * the nightly job) gate access. Imports are dynamic so the pure part above can be tested without a database.
 */
export const assertScoreConsistency = async (from: string, to: string): Promise<ConsistencyResult> => {
    const [{ scoreService }, { scoreExplorerService, orgToday }, { capWindow }] = await Promise.all([
        import("./score.service.js"),
        import("./scoreExplorer.service.js"),
        import("./scoreExplorer.js"),
    ])
    const viewer = { sub: "system:score-data-check", role: "ADMIN" as const }
    const win = capWindow(from, to, orgToday())
    const q = { from: win.from, to: win.to, module: undefined, recurrence: undefined, parentId: undefined, storeId: undefined, departmentId: undefined }

    const [departmentView, storeView, personView, report, org] = await Promise.all([
        scoreExplorerService.explorer(viewer, { ...q, view: "department" }),
        scoreExplorerService.explorer(viewer, { ...q, view: "store" }),
        scoreExplorerService.explorer(viewer, { ...q, view: "person" }),
        scoreService.report(viewer, win.from, win.to, { people: true, stores: true }),
        scoreService.forScope(viewer, "org", "org", win.from, win.to),
    ])

    const people = [...personView.rows, ...(personView.unassigned ? [personView.unassigned] : [])]
    const sampleRows = [...personView.rows].filter((r) => r.kind === "person").sort((a, b) => b.totalDue - a.totalDue).slice(0, CONSISTENCY_SAMPLE_SIZE)
    const cards = await Promise.all(sampleRows.map((r) => scoreService.forScope(viewer, "person", r.id, win.from, win.to)))

    return evaluateConsistency({
        from: win.from,
        to: win.to,
        explorerTotal: departmentView.total,
        scoresOrg: org,
        reportTotal: report.total ?? org,
        departments: departmentView.rows,
        stores: storeView.rows,
        people,
        samples: sampleRows.map((r, i) => ({ id: r.id, name: r.name, card: cards[i], row: r })),
        sharing: departmentView.sharing,
    })
}

