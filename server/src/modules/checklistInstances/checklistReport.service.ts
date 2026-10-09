import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { sql, type SQL } from "drizzle-orm"
import {
    checklistInstances,
    checklistInstanceAssignees,
    checklistInstanceItems,
    checklistInstanceImages,
    checklistInstanceItemSubmissions,
    checklistInstanceItemSubmissionImages,
    checklistDefinitions,
    users,
    stores,
    departments,
} from "../../db/schema/index.js"
import { GATED_BOOLEAN_ITEM_EXPR, FLAGGED_BOOLEAN_ANSWER_EXPR } from "../../utils/checklistBooleanFlags.js"
import { REPORT_DATE_FORMATS, RANGE_BUCKET, resolveReportWindow, zeroFill, type ReportGroupBy } from "./checklistReportRange.js"
import type { ChecklistReportScope } from "./checklistReportScope.js"
import { AppError } from "../../utils/AppError.js"
import { MAX_RANGE_DAYS } from "../checklistReports/checklistReport.validation.js"

// Analytics over checklist runs: the trend report (one row per time bucket) and the by-store report
// (one row per active store). Both read the SAME per-run aggregate (runAggregateSql), then group it
// once more, so the two can never disagree on a rule.
//
// Rules (product decisions D3, D8, D11):
//  - Completion is item based, but Not applicable items are left out of the done count AND the
//    total, and only DUE runs count. A run is due when its deadline has passed or it is already
//    fully done. A run that has not started and is not yet due is not a miss.
//  - Photo quality looks only at items that are done, not N/A, and require photos. An AUDIT item's
//    photos live on its submissions (ChecklistInstanceItemSubmissionImage), so those count too.
//  - Compliance (separate from completion): scored answers = items with an acceptable-answer rule
//    that were answered (done, not N/A), PLUS every non-N/A item a reviewer sent back at least once
//    (sendBackCount > 0), rule or no rule. Good = a scored item whose answer is inside its rule
//    AND that was never sent back. A sent-back question stays a failed check even when it was
//    redone well later: first-attempt quality. Mirrors client checklistCompliance.ts answerVerdict.
//    A critical question (isCritical) counts double: its scored weight and good weight are both x2
//    in the rate (scoredAnswers stays the raw count).
//  - Approval rate = approved on first attempt / DECIDED runs (approved, or rejected at least once).
//    Runs still waiting for a decision are reported separately as pendingRuns.

const ROUND = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null)

// Org-local "now" and a run's org-local deadline, as wall-clock datetimes (same rule as
// checklistInstance.service.ts's deadlineExpr / localNowExpr, but on the `ci` alias used here).
const LOCAL_NOW = sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${env.CHECKLIST_TIMEZONE_OFFSET_MINUTES} MINUTE)`
const RUN_DEADLINE = sql`(CASE
    WHEN ci.cutoffTime IS NULL THEN TIMESTAMP(DATE(ci.periodEnd))
    WHEN ci.opensTime IS NOT NULL AND ci.cutoffTime < ci.opensTime
        THEN TIMESTAMP(DATE_ADD(DATE(ci.periodStart), INTERVAL 1 DAY), CONCAT(ci.cutoffTime, ':00'))
    ELSE TIMESTAMP(DATE(ci.periodStart), CONCAT(ci.cutoffTime, ':00'))
END)`

// Item is done and applicable.
const ANSWERED = sql`(cii.isDone = 1 AND cii.isNotApplicable = 0)`

// Answered item that has an acceptable-answer rule to be judged against.
const RULE_SCORED = sql`(${ANSWERED} AND cii.waivedAt IS NULL AND (
    (cii.itemType IN ('YES_NO', 'PASS_FAIL') AND COALESCE(JSON_LENGTH(cii.acceptableAnswers), 0) > 0 AND cii.booleanAnswer IS NOT NULL)
    OR (cii.itemType IN ('MULTIPLE_CHOICE', 'DROPDOWN') AND COALESCE(JSON_LENGTH(cii.acceptableAnswers), 0) > 0 AND cii.textValue IS NOT NULL AND cii.textValue <> '')
    OR (cii.itemType IN ('NUMBER_ENTRY', 'RATING') AND (cii.acceptableMin IS NOT NULL OR cii.acceptableMax IS NOT NULL) AND cii.numericValue IS NOT NULL)
))`

// Only meaningful when RULE_SCORED is true: the answer sits inside the rule.
const RULE_OK = sql`(CASE
    WHEN cii.itemType IN ('YES_NO', 'PASS_FAIL') THEN JSON_CONTAINS(cii.acceptableAnswers, JSON_QUOTE(cii.booleanAnswer))
    WHEN cii.itemType IN ('MULTIPLE_CHOICE', 'DROPDOWN') THEN JSON_CONTAINS(cii.acceptableAnswers, JSON_QUOTE(cii.textValue))
    ELSE (cii.acceptableMin IS NULL OR cii.numericValue >= cii.acceptableMin) AND (cii.acceptableMax IS NULL OR cii.numericValue <= cii.acceptableMax)
END)`

// D11: a reviewer send-back is a failed check, scored even without a rule.
const SENT_BACK = sql`(cii.isNotApplicable = 0 AND cii.sendBackCount > 0 AND cii.waivedAt IS NULL)`
const SCORED = sql`(${RULE_SCORED} OR ${SENT_BACK})`
const GOOD = sql`(${RULE_SCORED} AND cii.sendBackCount = 0 AND ${RULE_OK})`
// A critical question counts double in the compliance rate (scored weight and good weight both x2).
// scoredItems/goodItems stay raw counts (scoredAnswers); the rate uses the weighted sums below.
const WEIGHT = sql`(CASE WHEN cii.isCritical = 1 THEN 2 ELSE 1 END)`

// Photos on one item that count towards its requirement: its own photos plus, for an AUDIT item,
// the photos on its submissions. Correlated, so it is only evaluated for the (few) done items that
// require photos, never for the whole image table.
const ITEM_PHOTO_COUNT = sql`(
    (SELECT COUNT(*) FROM ${checklistInstanceImages} im
        WHERE im.checklistInstanceItemId = cii.id AND (cii.requiresLivePhoto = 0 OR im.captureMethod = 'LIVE'))
    + (CASE WHEN cii.itemType = 'AUDIT' THEN
        (SELECT COUNT(*) FROM ${checklistInstanceItemSubmissionImages} si
            JOIN ${checklistInstanceItemSubmissions} su ON su.id = si.submissionId
            WHERE su.itemId = cii.id AND (cii.requiresLivePhoto = 0 OR si.captureMethod = 'LIVE'))
       ELSE 0 END)
)`
const PHOTO_ITEM = sql`(${ANSWERED} AND cii.requiredImageCount > 0)`
const PHOTO_OK = sql`(CASE WHEN ${PHOTO_ITEM} AND ${ITEM_PHOTO_COUNT} >= cii.requiredImageCount THEN 1 ELSE 0 END)`

export type ChecklistReportQuery = {
    groupBy: ReportGroupBy
    from?: string
    to?: string
    /** ADMIN/PC only: also include runs of soft-deleted checklists. */
    includeDeleted?: boolean
    /** Only runs this person is an assignee of: the same rule the compliance board's Person filter uses. */
    assigneeId?: string
}

const filterConditions = (
    scope: ChecklistReportScope,
    window: { fromDate: string; toExclusive: string },
    includeDeleted: boolean,
    activeStoresOnly: boolean,
    assigneeId?: string,
): SQL[] => {
    // periodStart is the org-local day (as UTC midnight) and the window is org-local days, so a
    // plain date comparison is exact whatever time zone the caller's browser sits in.
    const conditions: SQL[] = [sql`ci.periodStart >= ${window.fromDate}`, sql`ci.periodStart < ${window.toExclusive}`]
    if (!includeDeleted) conditions.push(sql`d.deletedAt IS NULL`)
    if (activeStoresOnly) conditions.push(sql`st.isActive = 1`)
    if (scope.storeId) conditions.push(sql`ci.storeId = ${scope.storeId}`)
    if (assigneeId) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} pa
            WHERE pa.instanceId = ci.id AND pa.userId = ${assigneeId}
        )`)
    }
    if (scope.departmentId) {
        // Same rule as instanceIdsForDepartment: a run belongs to a department when one of its
        // assignees sits in it.
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            JOIN ${users} u ON u.id = a.userId
            WHERE a.instanceId = ci.id AND u.departmentId = ${scope.departmentId}
        )`)
    }
    return conditions
}

// One row per run with that run's counts. Item facts are summed per run; grouping by bucket or by
// store happens one level up.
const runAggregateSql = (conditions: SQL[]) => sql`
    SELECT
        ci.id AS id,
        ci.storeId AS storeId,
        ci.periodStart AS periodStart,
        ci.verificationStatus AS verificationStatus,
        ci.rejectionCount AS rejectionCount,
        CASE WHEN ${RUN_DEADLINE} < ${LOCAL_NOW} OR MIN(cii.isDone) = 1 THEN 1 ELSE 0 END AS isDue,
        SUM(cii.isNotApplicable = 0) AS applicableItems,
        SUM(${ANSWERED}) AS doneItems,
        SUM(CASE WHEN ${PHOTO_ITEM} THEN 1 ELSE 0 END) AS photoItems,
        SUM(${PHOTO_OK}) AS photoOkItems,
        SUM(CASE WHEN ${ANSWERED} AND ${GATED_BOOLEAN_ITEM_EXPR} THEN 1 ELSE 0 END) AS gatedItems,
        SUM(CASE WHEN ${ANSWERED} AND ${FLAGGED_BOOLEAN_ANSWER_EXPR} THEN 1 ELSE 0 END) AS flaggedItems,
        SUM(CASE WHEN ${SCORED} THEN 1 ELSE 0 END) AS scoredItems,
        SUM(CASE WHEN ${GOOD} THEN 1 ELSE 0 END) AS goodItems,
        SUM(CASE WHEN ${SCORED} THEN ${WEIGHT} ELSE 0 END) AS weightedScoredItems,
        SUM(CASE WHEN ${GOOD} THEN ${WEIGHT} ELSE 0 END) AS weightedGoodItems
    FROM ${checklistInstances} ci
    JOIN ${checklistInstanceItems} cii ON cii.instanceId = ci.id
    JOIN ${checklistDefinitions} d ON d.id = ci.definitionId
    JOIN ${stores} st ON st.id = ci.storeId
    WHERE ${sql.join(conditions, sql` AND `)}
    GROUP BY ci.id, ci.storeId, ci.periodStart, ci.verificationStatus, ci.rejectionCount, ci.periodEnd, ci.cutoffTime, ci.opensTime
`

// The numbers both reports derive their rates from, as aggregate expressions over the run rows `r`.
const GROUP_METRICS = sql`
    COALESCE(SUM(CASE WHEN r.isDue = 1 THEN r.applicableItems END), 0) AS totalItems,
    COALESCE(SUM(CASE WHEN r.isDue = 1 THEN r.doneItems END), 0) AS doneItems,
    COALESCE(SUM(r.isDue), 0) AS dueRuns,
    COALESCE(SUM(r.photoItems), 0) AS photoItems,
    COALESCE(SUM(r.photoOkItems), 0) AS photoOkItems,
    COALESCE(SUM(r.gatedItems), 0) AS gatedItems,
    COALESCE(SUM(r.flaggedItems), 0) AS flaggedItems,
    COALESCE(SUM(r.scoredItems), 0) AS scoredItems,
    COALESCE(SUM(r.goodItems), 0) AS goodItems,
    COALESCE(SUM(r.weightedScoredItems), 0) AS weightedScoredItems,
    COALESCE(SUM(r.weightedGoodItems), 0) AS weightedGoodItems,
    COUNT(CASE WHEN r.verificationStatus IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') OR r.rejectionCount > 0 THEN 1 END) AS submittedRuns,
    COUNT(CASE WHEN r.verificationStatus = 'APPROVED' OR r.rejectionCount > 0 THEN 1 END) AS decidedRuns,
    COUNT(CASE WHEN r.verificationStatus = 'APPROVED' AND r.rejectionCount = 0 THEN 1 END) AS firstAttemptApproved,
    COUNT(CASE WHEN r.verificationStatus = 'PENDING_APPROVAL' AND r.rejectionCount = 0 THEN 1 END) AS pendingRuns
`

type MetricRow = Record<string, unknown>

export type ScoreRun = {
    id: string
    title: string
    storeName: string
    day: string
    doneItems: number
    totalItems: number
    completionRate: number | null
    complianceRate: number | null
    verificationStatus: string
}
const n = (v: unknown) => Number(v ?? 0)

const metricsOf = (r: MetricRow) => ({
    totalItems: n(r.totalItems),
    doneItems: n(r.doneItems),
    completionRate: ROUND(n(r.doneItems), n(r.totalItems)),
    dueRuns: n(r.dueRuns),
    itemsRequiringPhotos: n(r.photoItems),
    qualityRate: ROUND(n(r.photoOkItems), n(r.photoItems)),
    // Share of answered gated Yes/No-style items whose answer landed on the flagged branch: higher
    // is worse. null when nothing in the group was gated with a conditional action.
    gatedBooleanItems: n(r.gatedItems),
    issueRate: ROUND(n(r.flaggedItems), n(r.gatedItems)),
    scoredAnswers: n(r.scoredItems),
    complianceRate: ROUND(n(r.weightedGoodItems), n(r.weightedScoredItems)),
    submittedInstances: n(r.submittedRuns),
    decidedRuns: n(r.decidedRuns),
    firstAttemptApproved: n(r.firstAttemptApproved),
    pendingRuns: n(r.pendingRuns),
    approvalRate: ROUND(n(r.firstAttemptApproved), n(r.decidedRuns)),
})

const emptyBucket = (bucket: string) => ({ bucket, ...metricsOf({}) })

// An explicit range is capped like the people/department export (MAX_RANGE_DAYS) so one request can't
// aggregate years of runs. Without an explicit `from` the window is the bounded default.
const assertRangeAllowed = (window: { fromDate: string; toDate: string }, explicit: boolean) => {
    if (!explicit) return
    const days = Math.round((Date.parse(`${window.toDate}T00:00:00.000Z`) - Date.parse(`${window.fromDate}T00:00:00.000Z`)) / 86_400_000) + 1
    if (days < 1) throw AppError.badRequest("The start date must be on or before the end date.")
    if (days > MAX_RANGE_DAYS) throw AppError.badRequest(`Pick a period of ${MAX_RANGE_DAYS} days or less.`)
}

export const checklistReportService = {
    /**
     * Trend report. `scope` null means the caller may see nothing (a head with no department): the
     * answer is an empty series, never an unfiltered query.
     */
    async complianceReport(scope: ChecklistReportScope | null, query: ChecklistReportQuery) {
        const window = resolveReportWindow(query.groupBy, query.from, query.to)
        assertRangeAllowed(window, !!query.from)
        if (!scope) return zeroFill([], query.groupBy, window, emptyBucket)

        // Inactive stores are kept: the board list/summary and the person/department export keep their
        // runs too, so the trend must add up to the same totals. Only the by-store report is "active stores".
        const conditions = filterConditions(scope, window, query.includeDeleted === true, false, query.assigneeId)
        const bucketExpr = query.groupBy === "none"
            ? sql.raw(`'${RANGE_BUCKET}'`)
            : sql`DATE_FORMAT(r.periodStart, ${REPORT_DATE_FORMATS[query.groupBy]})`

        // db.execute() on the mysql2 driver resolves to the raw tuple [rows, fields], not a row array.
        const [rows] = await db.execute(sql`
            SELECT ${bucketExpr} AS bucket, ${GROUP_METRICS}
            FROM (${runAggregateSql(conditions)}) r
            GROUP BY bucket
            ORDER BY bucket ASC
        `)

        const buckets = (rows as unknown as MetricRow[]).map((r) => ({ bucket: String(r.bucket), ...metricsOf(r) }))
        return zeroFill(buckets, query.groupBy, window, emptyBucket)
    },

    /** One row per ACTIVE store that had runs in the range, from a single grouped query. */
    async byStoreReport(scope: ChecklistReportScope | null, query: { from?: string; to?: string }) {
        if (!scope) return []
        const window = resolveReportWindow("none", query.from, query.to)
        assertRangeAllowed(window, !!query.from)
        const conditions = filterConditions(scope, window, false, true)

        const [rows] = await db.execute(sql`
            SELECT r.storeId AS storeId, st.name AS storeName, ${GROUP_METRICS}
            FROM (${runAggregateSql(conditions)}) r
            JOIN ${stores} st ON st.id = r.storeId
            GROUP BY r.storeId, st.name
            ORDER BY st.name ASC
        `)

        return (rows as unknown as MetricRow[]).map((r) => {
            const m = metricsOf(r)
            return {
                storeId: String(r.storeId),
                storeName: String(r.storeName),
                completionRate: m.completionRate,
                qualityRate: m.qualityRate,
                approvalRate: m.approvalRate,
                complianceRate: m.complianceRate,
                dueRuns: m.dueRuns,
                items: m.totalItems,
            }
        })
    },

    /**
     * One row per ACTIVE store and day that had due runs in the range: the same completion rule as the
     * trend and by-store reports (due runs only, Not applicable left out), cut by store and by day.
     * The caller lays it out as a store-by-day grid. Capped like every other range report.
     */
    async storeDailyReport(scope: ChecklistReportScope | null, query: { from?: string; to?: string }) {
        if (!scope) return []
        const window = resolveReportWindow("day", query.from, query.to)
        assertRangeAllowed(window, !!query.from)
        const conditions = filterConditions(scope, window, false, true)

        const [rows] = await db.execute(sql`
            SELECT r.storeId AS storeId, st.name AS storeName, DATE_FORMAT(r.periodStart, '%Y-%m-%d') AS day, ${GROUP_METRICS}
            FROM (${runAggregateSql(conditions)}) r
            JOIN ${stores} st ON st.id = r.storeId
            GROUP BY r.storeId, st.name, day
            ORDER BY st.name ASC, day ASC
        `)

        return (rows as unknown as MetricRow[]).map((r) => {
            const m = metricsOf(r)
            return {
                storeId: String(r.storeId),
                storeName: String(r.storeName),
                day: String(r.day),
                completionRate: m.completionRate,
                complianceRate: m.complianceRate,
                doneItems: m.doneItems,
                totalItems: m.totalItems,
                // Raw weights behind complianceRate, so cells can be totalled without averaging percentages.
                weightedGood: n(r.weightedGoodItems),
                weightedScored: n(r.weightedScoredItems),
                dueRuns: m.dueRuns,
            }
        })
    },

    /**
     * One row per department and month: completion and compliance over the same due-run rules as the
     * other reports. A run belongs to every department one of its assignees sits in (the rule the
     * department filters use), so a run shared across departments counts in each. Runs with nobody
     * assigned have no department and are left out. A department head only gets their own department.
     */
    async departmentMonthlyReport(scope: ChecklistReportScope | null, query: { from?: string; to?: string }) {
        if (!scope) return []
        const window = resolveReportWindow("month", query.from, query.to)
        assertRangeAllowed(window, !!query.from)
        // The department join below does the department scoping, so the per-run filter must not also
        // demand a department (it would be the same rule twice).
        const conditions = filterConditions({ ...scope, departmentId: undefined }, window, false, true)
        const ownDepartment = scope.departmentId ? sql` AND ra.departmentId = ${scope.departmentId}` : sql``

        const [rows] = await db.execute(sql`
            SELECT ra.departmentId AS departmentId, dep.name AS departmentName,
                DATE_FORMAT(r.periodStart, '%Y-%m') AS month, ${GROUP_METRICS}
            FROM (${runAggregateSql(conditions)}) r
            JOIN (
                SELECT DISTINCT a.instanceId AS instanceId, u.departmentId AS departmentId
                FROM ${checklistInstanceAssignees} a
                JOIN ${users} u ON u.id = a.userId
                WHERE u.departmentId IS NOT NULL
            ) ra ON ra.instanceId = r.id${ownDepartment}
            JOIN ${departments} dep ON dep.id = ra.departmentId
            GROUP BY ra.departmentId, dep.name, month
            ORDER BY dep.name ASC, month ASC
        `)

        return (rows as unknown as MetricRow[]).map((r) => {
            const m = metricsOf(r)
            return {
                departmentId: String(r.departmentId),
                departmentName: String(r.departmentName),
                month: String(r.month),
                completionRate: m.completionRate,
                complianceRate: m.complianceRate,
                doneItems: m.doneItems,
                totalItems: m.totalItems,
                // Raw weights, so a caller can total months without averaging percentages.
                weightedGood: n(r.weightedGoodItems),
                weightedScored: n(r.weightedScoredItems),
                dueRuns: m.dueRuns,
            }
        })
    },

    /**
     * The checklists behind one score: every DUE run for the store and/or department in the window,
     * weakest completion first, with the same completion and compliance rule the grids use. Capped so
     * a whole-period cell on a big organisation stays a short list; `total` says how many there are.
     */
    async scoreRunsReport(scope: ChecklistReportScope | null, query: { from: string; to: string }) {
        const LIMIT = 60
        if (!scope) return { runs: [] as ScoreRun[], total: 0 }
        const window = resolveReportWindow("none", query.from, query.to)
        assertRangeAllowed(window, true)
        const conditions = filterConditions(scope, window, false, true)

        const [rows] = await db.execute(sql`
            SELECT r.id AS id, ci2.title AS title, st.name AS storeName, DATE_FORMAT(r.periodStart, '%Y-%m-%d') AS day,
                r.applicableItems AS applicableItems, r.doneItems AS doneItems,
                r.weightedScoredItems AS weightedScored, r.weightedGoodItems AS weightedGood,
                r.verificationStatus AS verificationStatus
            FROM (${runAggregateSql(conditions)}) r
            JOIN ${checklistInstances} ci2 ON ci2.id = r.id
            JOIN ${stores} st ON st.id = r.storeId
            WHERE r.isDue = 1
            ORDER BY (r.doneItems / NULLIF(r.applicableItems, 0)) ASC, r.periodStart DESC, r.id ASC
            LIMIT ${LIMIT + 1}
        `)

        const all = (rows as unknown as MetricRow[]).map((r): ScoreRun => ({
            id: String(r.id),
            title: String(r.title),
            storeName: String(r.storeName),
            day: String(r.day),
            doneItems: n(r.doneItems),
            totalItems: n(r.applicableItems),
            completionRate: ROUND(n(r.doneItems), n(r.applicableItems)),
            complianceRate: ROUND(n(r.weightedGood), n(r.weightedScored)),
            verificationStatus: String(r.verificationStatus),
        }))
        return { runs: all.slice(0, LIMIT), total: all.length > LIMIT ? null : all.length }
    },
}
