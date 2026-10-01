import { db } from "../../config/db.js"
import {
    checklistInstances,
    checklistInstanceAssignees,
    checklistInstanceReviewers,
    checklistInstanceItems,
    checklistInstanceImages,
    checklistInstanceItemSubmissions,
    checklistInstanceItemSubmissionAccessories,
    checklistInstanceItemSubmissionImages,
    checklistDefinitions,
    users,
    stores,
    CHECKLIST_RECURRENCES,
    CHECKLIST_VERIFICATION_STATUSES,
} from "../../db/schema/index.js"
import { eq, and, inArray, desc, asc, sql, gte, lte } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { notificationService } from "../notifications/notification.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { auditService } from "../audit/audit.service.js"
import { cached, cacheKey } from "../../config/queryCache.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { VerifyChecklistInstanceInput } from "./checklistInstance.validation.js"
import type { Role } from "../../db/schema/core.js"
import { DATE_FORMATS } from "../../utils/dateBucket.js"
import type { DateBucket } from "../../utils/index.js"
import { GATED_BOOLEAN_ITEM_EXPR, FLAGGED_BOOLEAN_ANSWER_EXPR } from "../../utils/checklistBooleanFlags.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { env } from "../../config/env.js"

// OVERDUE is a subset of OPEN (unfinished *and* past its period end), not a third
// independent state — the compliance board and MyChecklists both offer it as a filter, and
// it was being applied client-side over the full list, which is one of the two reasons those
// lists could not paginate.
// "OPEN" is every incomplete instance (overdue ones included) — the same broad "not done yet"
// bucket Delegation/Tickets call "Pending". "DUE" is the on-track subset of that: incomplete but
// not yet past its period end, mirroring how Delegation/Tickets split "Pending" into "Due" +
// "Delayed"/"Overdue" instead of leaving "Due" as a synonym for "Pending".
export type InstanceStatusFilter = "OPEN" | "DUE" | "COMPLETED" | "OVERDUE"

// Dashboard's "Needs your approval" card — shaped differently from ticket/task's own
// PendingApprovalRow (storeName instead of submittedBy) since there's no single submitter here,
// assignment being many-to-many via checklistInstanceAssignees. The client combines all three.
export type ChecklistPendingApprovalRow = {
    id: string
    title: string
    storeName: string | null
    waitingSince: string
}

// Not using Drizzle's relational query API (`db.query...with:{...}`) here — that API compiles
// every relation into a `LEFT JOIN LATERAL (...)` subquery, and the actual database this app
// runs against (MariaDB 10.11) doesn't support LATERAL joins at all (confirmed against the real
// local instance). Plain selects assembled by hand in JS instead — same pattern as
// task.service.ts/ticket.service.ts/checklist.service.ts. This is the closest equivalent of the
// old 3-level `populate({ path: "items", ..., populate: [{ path: "images" }, { path:
// "submissions", populate: [...] }] })`, plus flattening the assigneeLinks junction rows back
// into a flat assigneeIds array and a submission's `userId` ref into the populated {id,
// firstName, lastName, storeId} object the old Mongoose `.populate({ path: "userId", select:
// "firstName lastName storeId" })` produced in place.
// The QR code staff must scan is checked server-side (assertQrSatisfied) — sending it down with
// the item let anyone read it from the network response and type it in by hand instead of
// scanning. Nothing on the client reads it.
const stripSecretItemFields = <T extends { qrExpectedValue?: string | null }>(item: T): T => ({ ...item, qrExpectedValue: null })

const hydrateInstances = async (instanceRows: (typeof checklistInstances.$inferSelect)[]) => {
    if (!instanceRows.length) return []
    const instanceIds = instanceRows.map((i) => i.id)

    const assigneeLinks = await db.select().from(checklistInstanceAssignees).where(inArray(checklistInstanceAssignees.instanceId, instanceIds))
    const assigneeIdsByInstance = new Map<string, string[]>()
    for (const link of assigneeLinks) {
        const list = assigneeIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        assigneeIdsByInstance.set(link.instanceId, list)
    }

    const reviewerLinks = await db.select().from(checklistInstanceReviewers).where(inArray(checklistInstanceReviewers.instanceId, instanceIds))
    const reviewerIdsByInstance = new Map<string, string[]>()
    for (const link of reviewerLinks) {
        const list = reviewerIdsByInstance.get(link.instanceId) ?? []
        list.push(link.userId)
        reviewerIdsByInstance.set(link.instanceId, list)
    }

    const items = await db.select().from(checklistInstanceItems).where(inArray(checklistInstanceItems.instanceId, instanceIds)).orderBy(asc(checklistInstanceItems.order))
    const itemIds = items.map((i) => i.id)

    const images = itemIds.length ? await db.select().from(checklistInstanceImages).where(inArray(checklistInstanceImages.checklistInstanceItemId, itemIds)) : []
    const imagesByItem = new Map<string, typeof images>()
    for (const img of images) {
        const list = imagesByItem.get(img.checklistInstanceItemId) ?? []
        list.push(img)
        imagesByItem.set(img.checklistInstanceItemId, list)
    }

    const submissions = itemIds.length ? await db.select().from(checklistInstanceItemSubmissions).where(inArray(checklistInstanceItemSubmissions.itemId, itemIds)) : []
    const submissionIds = submissions.map((s) => s.id)

    const accessories = submissionIds.length ? await db.select().from(checklistInstanceItemSubmissionAccessories).where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds)) : []
    const accessoriesBySubmission = new Map<string, typeof accessories>()
    for (const a of accessories) {
        const list = accessoriesBySubmission.get(a.submissionId) ?? []
        list.push(a)
        accessoriesBySubmission.set(a.submissionId, list)
    }

    const submissionImages = submissionIds.length ? await db.select().from(checklistInstanceItemSubmissionImages).where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds)) : []
    const submissionImagesBySubmission = new Map<string, typeof submissionImages>()
    for (const img of submissionImages) {
        const list = submissionImagesBySubmission.get(img.submissionId) ?? []
        list.push(img)
        submissionImagesBySubmission.set(img.submissionId, list)
    }

    const submissionUserIds = [...new Set(submissions.map((s) => s.userId))]
    const submissionUsers = submissionUserIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, storeId: users.storeId }).from(users).where(inArray(users.id, submissionUserIds))
        : []
    const submissionUserById = new Map(submissionUsers.map((u) => [u.id, u]))

    const submissionsByItem = new Map<string, any[]>()
    for (const submission of submissions) {
        const mapped = {
            ...submission,
            // Mirrors the original `.populate({ path: "userId", select: "firstName lastName storeId" })`
            // — same field name, populated in place, only the fields the UI needs.
            userId: submissionUserById.get(submission.userId) ?? null,
            accessories: (accessoriesBySubmission.get(submission.id) ?? []).map((a) => ({ id: a.id, name: a.name, checked: a.checked })),
            images: submissionImagesBySubmission.get(submission.id) ?? [],
        }
        const list = submissionsByItem.get(submission.itemId) ?? []
        list.push(mapped)
        submissionsByItem.set(submission.itemId, list)
    }

    const itemsByInstance = new Map<string, any[]>()
    for (const item of items) {
        const mapped = {
            ...stripSecretItemFields(item),
            images: imagesByItem.get(item.id) ?? [],
            submissions: submissionsByItem.get(item.id) ?? [],
        }
        const list = itemsByInstance.get(item.instanceId) ?? []
        list.push(mapped)
        itemsByInstance.set(item.instanceId, list)
    }

    return instanceRows.map((instance) => ({
        ...instance,
        assigneeIds: assigneeIdsByInstance.get(instance.id) ?? [],
        reviewerIds: reviewerIdsByInstance.get(instance.id) ?? [],
        items: itemsByInstance.get(instance.id) ?? [],
    }))
}

const getPopulatedInstanceById = async (id: string) => {
    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
    if (!instance) return null
    const [hydrated] = await hydrateInstances([instance])
    return hydrated
}

// opensTime/cutoffTime (HH:mm, copied from the definition at generation time — see
// checklistInstanceGenerator.job.ts) anchor a same-day fill window to periodStart's calendar date,
// the day the period begins. For DAILY recurrence that's the obvious match; for longer recurrences
// (WEEKLY/MONTHLY) this is a deliberate simplification — the window applies on the period's first
// day, not a full per-day recurring window.
//
// Real data in this app includes overnight windows (e.g. "Store Opening checklist": opens 18:00,
// cutoff 07:00 the next morning) — a cutoff clock-time earlier than the opens clock-time means the
// deadline rolls over to the next calendar day, not the same one.
//
// assertInstanceOpen below enforces this same opensTime rule in JS (not SQL — it runs once per
// mutation, not as a list-query filter), shared by setItemDone and the AUDIT submissions service
// so both completion paths honor the same opens gate instead of drifting apart.
export const assertInstanceOpen = (instance: { opensTime: string | null; periodStart: Date }) => {
    if (!instance.opensTime) return
    const [hours, minutes] = instance.opensTime.split(":").map(Number)
    const opensAt = new Date(instance.periodStart)
    opensAt.setUTCHours(hours, minutes, 0, 0)
    // periodStart is the org-LOCAL calendar day written as UTC midnight (see utils/period.ts), and
    // opensTime is a local clock time — so the real instant is that wall-clock time minus the org's
    // UTC offset. Without this, "opens 09:00" in India only opened at 14:30.
    opensAt.setTime(opensAt.getTime() - env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
    if (Date.now() < opensAt.getTime()) {
        throw AppError.badRequest(`This checklist doesn't open until ${instance.opensTime} — come back then.`)
    }
}

// An APPROVED run is the record a reviewer signed off on — the lock used to exist only in the UI,
// so any assignee could still reopen items, change answers or delete photos through the API and
// the run stayed "Approved" over data nobody approved. Only an ADMIN may change it now; that
// change is audit-logged (setItemDone) and knocks the run back to NOT_SUBMITTED for re-approval
// (syncVerificationStatus). Shared with the image and AUDIT-submission services.
export const assertInstanceEditable = (instance: { verificationStatus: string }, user: AccessTokenPayload) => {
    if (instance.verificationStatus === "APPROVED" && user.role !== "ADMIN") {
        throw AppError.forbidden("This checklist is approved and locked. Ask an admin to reopen it if something needs to change.")
    }
}

// Signatures are base64 PNGs (tens of KB each) — the audit row only needs to know one was there.
const auditItemSnapshot = (item: Record<string, unknown>) => ({
    ...item,
    signatureValue: item.signatureValue ? "[signature]" : null,
    secondSignatureValue: item.secondSignatureValue ? "[signature]" : null,
    qrExpectedValue: undefined,
})

// Deleting a checklist template is a soft delete (see checklistDefinition.service.ts's `remove` —
// only `deletedAt` gets set, every generated instance is left alone on purpose, for audit
// history). But nothing reading the *instance* side knew that, so a "deleted" checklist's still-
// outstanding/overdue runs kept surfacing forever in My Checklists, the Compliance board, the
// Dashboard's activity feed, and the Verification queue — exactly the opposite of what deleting it
// promised the person who deleted it. This is the one condition that makes "deleted" actually mean
// "gone from view" everywhere an instance list is built, while the underlying rows (and this
// condition's own NOT EXISTS) stay reversible if the definition is ever restored.
const parentNotDeletedExpr = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

// Every branch is an org-LOCAL wall-clock time (a calendar date + an HH:mm the admin typed), so
// it's compared against the org's local "now" — UTC_TIMESTAMP() shifted by the org offset — not
// NOW(), which is the DB session's zone (UTC on the server). That mismatch flagged a 09:00 cutoff
// overdue only at 14:30 India time. periodEnd goes through DATE() for the same reason.
const localNowExpr = sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${env.CHECKLIST_TIMEZONE_OFFSET_MINUTES} MINUTE)`

const deadlineExpr = sql`CASE
    WHEN ${checklistInstances.cutoffTime} IS NULL THEN TIMESTAMP(DATE(${checklistInstances.periodEnd}))
    WHEN ${checklistInstances.opensTime} IS NOT NULL AND ${checklistInstances.cutoffTime} < ${checklistInstances.opensTime}
        THEN TIMESTAMP(DATE_ADD(DATE(${checklistInstances.periodStart}), INTERVAL 1 DAY), CONCAT(${checklistInstances.cutoffTime}, ':00'))
    ELSE TIMESTAMP(DATE(${checklistInstances.periodStart}), CONCAT(${checklistInstances.cutoffTime}, ':00'))
END`

/**
 * "Complete" means: has at least one item, and none of them is unfinished.
 *
 * This used to be a JS predicate (`isCompleted`) run over already-hydrated instances, with a
 * `filterByStatus` helper applying it after the fact. That forced every matching row to be
 * fetched and fully hydrated before the OPEN/COMPLETED filter could be applied — a page of 50
 * could not be selected without first loading all of them. Expressed in SQL it becomes part of
 * the WHERE clause, so only the page is ever hydrated.
 */
const completionCondition = (status: InstanceStatusFilter) => {
    const anyItem = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id})`
    const anyUnfinished = sql`EXISTS (SELECT 1 FROM ${checklistInstanceItems} i WHERE i.instanceId = ${checklistInstances.id} AND i.isDone = 0)`
    const complete = sql`${anyItem} AND NOT ${anyUnfinished}`
    const incomplete = sql`NOT ${anyItem} OR ${anyUnfinished}`

    if (status === "COMPLETED") return complete
    // Deadline is cutoffTime (same-day, or next-day for an overnight window) when set, else
    // periodEnd — same rule the summary's `overdue` count uses, and the client's isInstanceOverdue.
    if (status === "OVERDUE") return sql`(${incomplete}) AND ${deadlineExpr} < ${localNowExpr}`
    if (status === "DUE") return sql`(${incomplete}) AND ${deadlineExpr} >= ${localNowExpr}`
    return incomplete // "OPEN" — every incomplete instance, overdue or not ("Pending")
}

/**
 * Always paginated now.
 *
 * It briefly wasn't: every caller of these endpoints derived its counts with `.length` over the
 * whole array, so defaulting to a page would have made stat tiles silently report the page size
 * instead of the real total — worse than the slow query it fixed. `summary()` below took those
 * counts over, and `OVERDUE` became a real status filter, so nothing needs the full list any more.
 */
const paginate = (page?: number, limit?: number) => {
    const safePage = Math.max(1, Math.trunc(page ?? 1) || 1)
    // Capped so a caller can't ask for 100k rows and reintroduce the unbounded query by hand.
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

const DEFAULT_PAGE_SIZE = 50

const buildMeta = (p: { page: number; limit: number }, total: number) => ({
    page: p.page,
    limit: p.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.limit)),
    hasNext: p.page * p.limit < total,
})

const countInstances = async (where: any) => {
    const [row] = await db.select({ value: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
    return Number(row?.value ?? 0)
}

// assigneeIds is now the flattened junction-table result (see mapInstance/getPopulatedInstanceById
// above) rather than a real embedded array field — the `.some()` authorization check itself is
// otherwise unchanged. This is the AUTHORIZATION-sensitive piece flagged by the migration research
// report: callers MUST pass the flattened assigneeIds list (from the assigneeLinks relation), not
// try to re-derive access from anything else, or this can silently over/under-grant access.
const assertCanAccess = (instance: { assigneeIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    if (user.role !== "ADMIN" && user.role !== "PC" && !isAssignee) throw AppError.forbidden()
}

// Department heads: MANAGER and SENIOR both act as HOD, scoped to their own department (the one
// on their user record). A HOD with no department sees nothing rather than everything.
export const isHod = (user: { role: string }) => user.role === "MANAGER" || user.role === "SENIOR"

// Shared by assertCanView/CAN_VERIFY_BY_ROLE's HOD branch — a checklist instance has no
// departmentId of its own (only storeId), so "does this belong to my department" is derived
// from whichever department(s) its assignees actually sit in.
const getDepartmentIdsForUserIds = async (userIds: string[]): Promise<Set<string>> => {
    if (!userIds.length) return new Set()
    const rows = await db.select({ departmentId: users.departmentId }).from(users).where(inArray(users.id, userIds))
    return new Set(rows.map((r) => r.departmentId).filter((d): d is string => !!d))
}

// View-only widening of assertCanAccess: a MANAGER (HOD) may open any instance assigned to
// someone in their own department, to review it before approving/rejecting — deliberately NOT
// folded into assertCanAccess itself, which stays assignee/ADMIN/PC only and still gates
// setItemDone, so a HOD can view but never fill in an employee's checklist. An explicitly named
// reviewer (checklistInstanceReviewers, additive on top of the role-based rule — see
// CAN_VERIFY_BY_ROLE) can always view too, regardless of role or department, since they need to
// see it before they can approve/reject it. Being named on an AUDIT item's "who gets audited" list
// grants nothing: that person is the subject of a check, and opening the run would show them every
// other person's results, remarks and photos.
const assertCanView = async (instance: { assigneeIds: string[]; reviewerIds: string[] }, user: AccessTokenPayload) => {
    const isAssignee = instance.assigneeIds.some((id) => id === user.sub)
    // APPROVAL_MANAGER has the same org-wide reach as ADMIN/PC here — the final-approval stage
    // needs to be able to open any instance to review it before giving final sign-off.
    if (user.role === "ADMIN" || user.role === "PC" || user.role === "APPROVAL_MANAGER" || isAssignee || instance.reviewerIds.includes(user.sub)) return
    if (isHod(user) && user.departmentId) {
        const departmentIds = await getDepartmentIdsForUserIds(instance.assigneeIds)
        if (departmentIds.has(user.departmentId)) return
    }
    throw AppError.forbidden()
}

// Same rule as checklist.service.ts's completeItem — never trust the client's isDone, always
// recount qualifying images from the DB before allowing an item to be marked done.
const assertPhotosSatisfied = async (item: any) => {
    if (item.requiredImageCount <= 0) return
    const images = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.checklistInstanceItemId, item.id))
    const qualifying = item.requiresLivePhoto ? images.filter((img) => img.captureMethod === "LIVE") : images
    if (qualifying.length < item.requiredImageCount) {
        const missing = item.requiredImageCount - qualifying.length
        const kind = item.requiresLivePhoto ? "live photo(s)" : "photo(s)"
        throw AppError.badRequest(`Upload ${missing} more ${kind} before this item can be marked complete`)
    }
}

// NUMBER_ENTRY counterpart to assertPhotosSatisfied — a reading is required (and must sit within
// the definition-authored min/max, when set) before the item can be marked done. Never trusts a
// value the client didn't just send: the item's own numericValue isn't consulted here, so a stale
// value from a previous run can't silently satisfy a fresh completion.
const assertNumberEntrySatisfied = (item: any, numericValue: number | undefined) => {
    if (numericValue == null || Number.isNaN(numericValue)) {
        throw AppError.badRequest("Enter a value before this item can be marked complete")
    }
    if (item.numberEntryMin != null && numericValue < item.numberEntryMin) {
        throw AppError.badRequest(`Value must be at least ${item.numberEntryMin}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ""}`)
    }
    if (item.numberEntryMax != null && numericValue > item.numberEntryMax) {
        throw AppError.badRequest(`Value must be at most ${item.numberEntryMax}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ""}`)
    }
}

// RATING counterpart — same numericValue slot as NUMBER_ENTRY, bounded to a whole star between 1
// and the definition-authored ratingScale (defaulting to 5 stars if never configured).
const assertRatingSatisfied = (item: any, numericValue: number | undefined) => {
    const scale = item.ratingScale ?? 5
    if (numericValue == null || Number.isNaN(numericValue) || !Number.isInteger(numericValue)) {
        throw AppError.badRequest("Pick a rating before this item can be marked complete")
    }
    if (numericValue < 1 || numericValue > scale) {
        throw AppError.badRequest(`Rating must be between 1 and ${scale}`)
    }
}

// YES_NO/PASS_FAIL counterpart — an explicit answer is required; "No"/"Fail" is a valid,
// completed answer, it just isn't a photo/number/etc., so this only checks presence.
const assertBooleanAnswerSatisfied = (booleanAnswer: "YES" | "NO" | undefined) => {
    if (booleanAnswer !== "YES" && booleanAnswer !== "NO") {
        throw AppError.badRequest("Choose an answer before this item can be marked complete")
    }
}

// MULTIPLE_CHOICE/DROPDOWN counterpart — the answer must be one of the definition-authored
// options, not just any non-empty string (unlike TEXT_BOX below).
const assertOptionSatisfied = (item: any, textValue: string | undefined) => {
    if (!textValue || !(item.options ?? []).includes(textValue)) {
        throw AppError.badRequest("Choose one of the listed options before this item can be marked complete")
    }
}

// TEXT_BOX counterpart — any non-empty answer is accepted, no option list to match against.
const assertTextSatisfied = (textValue: string | undefined) => {
    if (!textValue?.trim()) {
        throw AppError.badRequest("Enter an answer before this item can be marked complete")
    }
}

// DATE_TIME counterpart — must be a value the client actually sent and a parseable date.
const assertDateSatisfied = (dateValue: string | undefined) => {
    if (!dateValue || Number.isNaN(new Date(dateValue).getTime())) {
        throw AppError.badRequest("Pick a date before this item can be marked complete")
    }
}

// Great-circle distance in meters between two lat/lng points — used only to check a GPS reading
// against an optional definition-authored target + radius.
const EARTH_RADIUS_METERS = 6371000
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

// GPS counterpart — a location reading is required; only checked against the definition-authored
// target when all three of gpsTargetLat/Lng/RadiusMeters are set (the schema refine in
// checklistDefinition.validation.ts guarantees lat/lng are set whenever radius is, so a plain
// null-check on all three is enough to know "is there a target to check against").
const assertGpsSatisfied = (item: any, lat: number | undefined, lng: number | undefined) => {
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        throw AppError.badRequest("Capture your location before this item can be marked complete")
    }
    if (item.gpsTargetLat != null && item.gpsTargetLng != null && item.gpsRadiusMeters != null) {
        const distance = haversineMeters(lat, lng, item.gpsTargetLat, item.gpsTargetLng)
        if (distance > item.gpsRadiusMeters) {
            throw AppError.badRequest(
                `You're ${Math.round(distance)}m from the required location — must be within ${item.gpsRadiusMeters}m`,
            )
        }
    }
}

// QR_SCAN counterpart — reuses the same textValue slot TEXT_BOX/MULTIPLE_CHOICE do, but a scanned
// code additionally has to match qrExpectedValue when the definition authored one.
const assertQrSatisfied = (item: any, textValue: string | undefined) => {
    if (!textValue?.trim()) {
        throw AppError.badRequest("Scan a code before this item can be marked complete")
    }
    if (item.qrExpectedValue && textValue.trim() !== item.qrExpectedValue) {
        throw AppError.badRequest("Scanned code doesn't match the expected code")
    }
}

// SIGNATURE counterpart — just needs a non-empty drawing.
const assertSignatureSatisfied = (signatureValue: string | undefined) => {
    if (!signatureValue) {
        throw AppError.badRequest("Add a signature before this item can be marked complete")
    }
}

// DUAL_SIGNATURE counterpart — both signers must have signed.
const assertDualSignatureSatisfied = (signatureValue: string | undefined, secondSignatureValue: string | undefined) => {
    if (!signatureValue || !secondSignatureValue) {
        throw AppError.badRequest("Both signatures are required before this item can be marked complete")
    }
}

export type ItemValueInput = {
    numericValue?: number
    booleanAnswer?: "YES" | "NO"
    textValue?: string
    dateValue?: string
    gpsLat?: number
    gpsLng?: number
    gpsAccuracy?: number
    signatureValue?: string
    secondSignatureValue?: string
    conditionalReasonValue?: string
    /** null clears the remark. */
    remarks?: string | null
    notApplicable?: boolean
}

// One validator per value-bearing item type, keyed by itemType — a lookup instead of an
// if/else-if chain, so adding the next type means adding one entry here, not another branch to
// thread through setItemDone. CASH_TALLY reuses assertNumberEntrySatisfied outright — it's a
// NUMBER_ENTRY variant with an extra display-only field, not a different validation rule.
const VALUE_VALIDATORS_BY_ITEM_TYPE: Record<string, (item: any, values: ItemValueInput) => void> = {
    NUMBER_ENTRY: (item, v) => assertNumberEntrySatisfied(item, v.numericValue),
    RATING: (item, v) => assertRatingSatisfied(item, v.numericValue),
    YES_NO: (_item, v) => assertBooleanAnswerSatisfied(v.booleanAnswer),
    PASS_FAIL: (_item, v) => assertBooleanAnswerSatisfied(v.booleanAnswer),
    MULTIPLE_CHOICE: (item, v) => assertOptionSatisfied(item, v.textValue),
    DROPDOWN: (item, v) => assertOptionSatisfied(item, v.textValue),
    TEXT_BOX: (_item, v) => assertTextSatisfied(v.textValue),
    DATE_TIME: (_item, v) => assertDateSatisfied(v.dateValue),
    GPS: (item, v) => assertGpsSatisfied(item, v.gpsLat, v.gpsLng),
    QR_SCAN: (item, v) => assertQrSatisfied(item, v.textValue),
    CASH_TALLY: (item, v) => {
        assertNumberEntrySatisfied(item, v.numericValue)
        // The expected amount used to be display-only: a short drawer completed exactly like a
        // matching one. A mismatch now needs a reason, stored in conditionalReasonValue (the
        // same "why" slot Yes/No's ASK_REASON uses) so reviewers see it next to the count.
        if (item.cashExpectedAmount != null && v.numericValue !== item.cashExpectedAmount && !v.conditionalReasonValue?.trim()) {
            const diff = (v.numericValue ?? 0) - item.cashExpectedAmount
            throw AppError.badRequest(`Count is ${diff < 0 ? "short" : "over"} by ${Math.abs(diff)} — add a reason before saving`)
        }
    },
    SIGNATURE: (_item, v) => assertSignatureSatisfied(v.signatureValue),
    DUAL_SIGNATURE: (_item, v) => assertDualSignatureSatisfied(v.signatureValue, v.secondSignatureValue),
}

// Builder-authored "If answer is X then:" rules (see ChecklistDefinitionItem.yesActions/
// noActions) — only ever meaningful for YES_NO/PASS_FAIL items. Each answer value has its own
// independent action set, so a Yes rule and a No rule can both be armed on the same item at once;
// this just looks up whichever branch matches the answer actually being submitted right now.
// REQUIRE_PHOTO/ASK_REASON are validated here (block completion until satisfied, same as the type
// validators above); CREATE_ISSUE/NOTIFY_AREA_MANAGER are side effects applied after validation passes.
const actionsForAnswer = (item: any, answer: "YES" | "NO" | undefined): string[] => {
    if (answer === "YES") return item.yesActions ?? []
    if (answer === "NO") return item.noActions ?? []
    return []
}

const isConditionTriggered = (item: any, values: ItemValueInput) =>
    actionsForAnswer(item, values.booleanAnswer).length > 0

const assertConditionalActionsSatisfied = async (item: any, values: ItemValueInput) => {
    if (!isConditionTriggered(item, values)) return
    const actions: string[] = actionsForAnswer(item, values.booleanAnswer)

    if (actions.includes("REQUIRE_PHOTO")) {
        const images = await db.select().from(checklistInstanceImages).where(eq(checklistInstanceImages.checklistInstanceItemId, item.id))
        const qualifying = item.requiresLivePhoto ? images.filter((img) => img.captureMethod === "LIVE").length : images.length
        if (qualifying < 1) {
            throw AppError.badRequest("Upload a photo before completing this item — your answer requires one")
        }
    }

    if (actions.includes("ASK_REASON")) {
        const reason = values.conditionalReasonValue ?? item.conditionalReasonValue
        if (!reason?.trim()) {
            throw AppError.badRequest("Enter a reason before completing this item — your answer requires one")
        }
    }
}

// Applies CREATE_ISSUE/NOTIFY_AREA_MANAGER after validation passes and the item has been saved —
// these are side effects, not completion gates. CREATE_ISSUE only fires once per item (guarded by
// issueId) so reopening/resubmitting the same "No" doesn't spawn duplicate tickets. Returns the
// (possibly issueId-updated) item so the caller's in-memory copy stays accurate without a re-fetch.
const applyConditionalSideEffects = async (
    item: any,
    instance: { id: string; title: string; storeId: string },
    user: AccessTokenPayload,
    values: ItemValueInput,
) => {
    if (!isConditionTriggered(item, values)) return item
    const actions: string[] = actionsForAnswer(item, values.booleanAnswer)
    let updatedItem = item

    if (actions.includes("CREATE_ISSUE") && !item.issueId) {
        try {
            const reason = values.conditionalReasonValue ?? item.conditionalReasonValue
            const ticket = await ticketService.create({
                title: `Checklist flag : ${item.label}`,
                description: `Raised automatically from "${instance.title}" -- "${item.label}" was answered "${values.booleanAnswer}".${reason ? `Reason: ${reason}` : ""}`,
                storeId: instance.storeId,
            }, user)
            // ticket.service.ts hasn't been migrated to Drizzle yet (separate task) — it still
            // hands back a Mongoose document, so `_id` (not `id`) is what actually exists on it.
            const issueId = String((ticket as any)._id ?? (ticket as any).id)
            await db.update(checklistInstanceItems).set({ issueId, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, item.id))
            updatedItem = { ...item, issueId }
        } catch (err) {
            console.error("Failed to auto-create issue from checklist flag:", err)
        }
    }

    if (actions.includes("NOTIFY_AREA_MANAGER")) {
        // NOTE: the original guarded this with `!item.areaManagerNotifiedAt` — a field that was
        // never actually declared on the ChecklistInstanceItem Mongoose schema, so Mongoose
        // silently discarded every assignment to it and the guard was always true. In practice
        // this meant the notification fired on every save where the condition matched, not just
        // once. Preserved as-is (fire every time) rather than inventing new dedupe state that
        // never actually existed before.
        await notificationService
            .notifyAreaManagersOfChecklistFlag({ _id: instance.id, title: instance.title }, updatedItem)
            .catch((err: unknown) => console.error("Failed to notify area manager of checklist flage:", err))
    }

    return updatedItem
}

// Keep completedAt in sync with isDone automatically, same convention the Mongoose pre('save')
// hook used — completedBy is decided by the caller (it has no access to the requesting user), and
// is cleared automatically on un-done.
const deriveInstanceItemCompletion = (isDone: boolean, completedByUserId: string | null): { completedAt: Date | null; completedBy: string | null } => {
    if (!isDone) return { completedAt: null, completedBy: null }
    return { completedAt: new Date(), completedBy: completedByUserId }
}

export const syncVerificationStatus = async (instanceId: string) => {
    const items = await db.select({ isDone: checklistInstanceItems.isDone }).from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, instanceId))
    const allDone = items.length > 0 && items.every((i) => i.isDone)

    const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, instanceId)).limit(1)
    if (!instance) return

    // Only NOT_SUBMITTED and REJECTED are "hasn't been through review yet" states — auto-promoting
    // to PENDING_APPROVAL from those is the intended behavior (first submission, or resubmission
    // after a reject). APPROVED must NOT be disturbed by this: an item toggle that re-fires this
    // sync while the instance is already approved must not silently knock it back down.
    if (allDone && (instance.verificationStatus === "NOT_SUBMITTED" || instance.verificationStatus === "REJECTED")) {
        await db.update(checklistInstances).set({ verificationStatus: "PENDING_APPROVAL", updatedAt: new Date() }).where(eq(checklistInstances.id, instanceId))
        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, instanceId))
        notificationService
            .notifyChecklistPendingVerification({ _id: instance.id, title: instance.title, storeId: instance.storeId, assigneeIds: assigneeLinks.map(l => l.userId) })
            .catch((err) => console.error("Failed to notify PC of pending checklist:", err))
    } else if (!allDone && (instance.verificationStatus === "PENDING_APPROVAL" || instance.verificationStatus === "APPROVED")) {
        // APPROVED only reaches here via an ADMIN reopening an item (assertInstanceEditable blocks
        // everyone else) — the approval no longer covers what's on the run, so it goes back for
        // a fresh review instead of staying "Approved" over changed answers.
        await db.update(checklistInstances).set({ verificationStatus: "NOT_SUBMITTED", updatedAt: new Date() }).where(eq(checklistInstances.id, instanceId))
    }
}

// PC has the same org-wide verification access as ADMIN — same parity as everywhere else in
// the app (tickets, tasks) — so a PC user isn't limited to their own store. MANAGER (HOD) is
// additive on top of that, not a replacement: they may only verify an instance whose assignees
// include someone from their own department.
const CAN_VERIFY_BY_ROLE: Partial<Record<Role, (assigneeDepartmentIds: Set<string>, user: AccessTokenPayload) => boolean>> = {
    ADMIN: () => true,
    PC: () => true,
    MANAGER: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
    SENIOR: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
}

// An explicitly named reviewer (checklistDefinitionReviewers, copied onto the instance at
// generation time) can always verify, on top of whatever CAN_VERIFY_BY_ROLE already grants —
// additive, never a replacement, so nothing that could already verify a checklist loses access by
// someone else being named a reviewer. This is also why /verify's route no longer role-gates: a
// reviewer can be any role at all, so the check has to happen here, against this specific
// instance, not generically at the router.
const assertCanVerify = (assigneeDepartmentIds: Set<string>, reviewerIds: string[], user: AccessTokenPayload) => {
    if (reviewerIds.includes(user.sub)) return
    const canVerify = CAN_VERIFY_BY_ROLE[user.role]?.(assigneeDepartmentIds, user) ?? false
    if (!canVerify) throw AppError.forbidden()
}

export type InstanceRecurrence = (typeof CHECKLIST_RECURRENCES)[number]
export type InstanceVerificationStatus = (typeof CHECKLIST_VERIFICATION_STATUSES)[number]

export type InstanceListFilter = {
    definitionId?: string
    storeId?: string
    status?: InstanceStatusFilter
    recurrence?: InstanceRecurrence
    verificationStatus?: InstanceVerificationStatus
    assigneeId?: string
    /**
     * ADMIN/PC only (set by each controller action from the caller's own role — never client-
     * supplied). A deleted checklist's instances are excluded everywhere by default (see
     * parentNotDeletedExpr's comment); this is the one escape hatch, so an admin auditing history
     * still sees a deleted checklist's runs instead of them vanishing for everyone.
     */
    includeDeleted?: boolean
    /**
     * "Also shared with any of these people" — independent of, and combinable with, `userId`
     * (the "mine" scope) and `assigneeId` (the single-id ADMIN list filter): each resolves to its
     * own `instance.id IN (...)` condition, AND'd together, so "my checklists that are ALSO
     * shared with X" narrows correctly instead of one filter silently replacing the other.
     */
    assigneeIds?: string[]
    /** Restrict to instances assigned to this user — how the "mine" scope is expressed. */
    userId?: string
    /** Instances with at least one assignee in this department — see instanceIdsForDepartment. */
    departmentId?: string
    /** Restricts to instances whose periodStart falls in [from, to] — ISO strings, same
     *  inclusive-bounds convention as complianceReport's own from/to. Lets the compliance board's
     *  "who's done what" list be scoped to a past period (e.g. last month) instead of always
     *  showing every instance ever generated. */
    from?: string
    to?: string
}

/**
 * Sentinel for "this filter cannot match anything", distinct from "no filter" (undefined).
 *
 * The assignee/user filters resolve through the junction table first, and an empty result there
 * means no rows can match. Returning `undefined` for that would mean "no WHERE clause" — i.e.
 * every row — which is the opposite answer.
 */
const NO_MATCHES = Symbol("no-matches")

// A checklist instance carries no departmentId of its own (only storeId — see
// checklistInstance.ts's schema comment) — "department" is derived from whichever department(s)
// its assignees actually sit in, same convention as assertCanView/CAN_VERIFY_BY_ROLE's MANAGER
// branch above. Shared by instanceConditions (org-wide list/summary) and getMine (my checklists).
const instanceIdsForDepartment = async (departmentId: string): Promise<string[]> => {
    const links = await db.select({ instanceId: checklistInstanceAssignees.instanceId })
        .from(checklistInstanceAssignees)
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .where(eq(users.departmentId, departmentId))
    return [...new Set(links.map((l) => l.instanceId))]
}

const instanceConditions = async (filter: InstanceListFilter) => {
    // Excluded by default regardless of what else the caller is filtering by — unless the caller
    // is ADMIN/PC auditing history (`includeDeleted`, set only by the controller from the
    // requester's own role, never client-supplied).
    const conditions = filter.includeDeleted ? [] : [parentNotDeletedExpr]
    if (filter.definitionId) conditions.push(eq(checklistInstances.definitionId, filter.definitionId))
    if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
    if (filter.status) conditions.push(completionCondition(filter.status))
    if (filter.recurrence) conditions.push(eq(checklistInstances.recurrence, filter.recurrence))
    if (filter.verificationStatus) conditions.push(eq(checklistInstances.verificationStatus, filter.verificationStatus))
    if (filter.from) conditions.push(gte(checklistInstances.periodStart, new Date(filter.from)))
    if (filter.to) conditions.push(lte(checklistInstances.periodStart, new Date(filter.to)))

    // assigneeIds lives in the checklistInstanceAssignees junction table, not on the instance, so
    // both people filters resolve to a set of instance ids first — same convention as
    // checklistDefinition.service.ts's list() storeId filter.
    const assigneeFilter = filter.assigneeId ?? filter.userId
    if (assigneeFilter) {
        const links = await db.select({ instanceId: checklistInstanceAssignees.instanceId })
            .from(checklistInstanceAssignees)
            .where(eq(checklistInstanceAssignees.userId, assigneeFilter))
        // Assignees only. Someone who's merely on an AUDIT item's "who gets audited" list is the
        // subject of a check, not a participant in it — the assignee works through them — so the run
        // must not turn up in their My Checklists (or their counts and badges), where it used to
        // hand every audited person the auditor's whole checklist.
        const ids = new Set(links.map((l) => l.instanceId))
        if (!ids.size) return NO_MATCHES
        conditions.push(inArray(checklistInstances.id, [...ids]))
    }

    // Separate condition from assigneeFilter above (not merged into it) so "mine, AND also
    // shared with any of these people" intersects both sets instead of one replacing the other.
    if (filter.assigneeIds?.length) {
        const links = await db.select({ instanceId: checklistInstanceAssignees.instanceId })
            .from(checklistInstanceAssignees)
            .where(inArray(checklistInstanceAssignees.userId, filter.assigneeIds))
        if (!links.length) return NO_MATCHES
        conditions.push(inArray(checklistInstances.id, [...new Set(links.map((l) => l.instanceId))]))
    }

    if (filter.departmentId) {
        const ids = await instanceIdsForDepartment(filter.departmentId)
        if (!ids.length) return NO_MATCHES
        conditions.push(inArray(checklistInstances.id, ids))
    }

    return conditions.length ? and(...conditions) : undefined
}

export const checklistInstanceService = {
    /**
     * Paginated. This used to select every instance the user had ever been assigned and hydrate
     * all of them — items, images, submissions, accessories — on every call, then filter by status
     * in JS. On a store a few months old that is the app's most expensive request by a wide
     * margin, and it grew forever. Status is now a SQL condition so only the page is hydrated.
     */
    async getMine(userId: string, options: {
        status?: InstanceStatusFilter
        page?: number
        limit?: number
        storeId?: string
        recurrence?: InstanceRecurrence
        verificationStatus?: InstanceVerificationStatus
        /** Among my checklists, only ones shared with a department (see instanceIdsForDepartment). */
        departmentId?: string
        /**
         * Among my checklists, only ones ALSO shared with any of these people ("Assigned with" in
         * MyChecklists' Options). A second, independent junction-table lookup — not merged into
         * the `userId` one below — so both narrow together (AND) instead of one replacing the
         * other.
         */
        assigneeIds?: string[]
        /** See InstanceListFilter.includeDeleted — set by the controller from the caller's own role. */
        includeDeleted?: boolean
        /** See InstanceListFilter.from/to — My Checklists' own "today only" scoping passes both. */
        from?: string
        to?: string
    } = {}) {
        const { status, page, limit, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to } = options
        const p = paginate(page, limit)
        // Delegates to the same condition-builder as listAll/summary instead of reimplementing the
        // userId/status/store/recurrence/verificationStatus/department/assigneeIds filters here —
        // this used to drift from instanceConditions as a separate ~25-line copy. "Mine" is just
        // instanceConditions with `userId` filled in, which resolves to the same
        // "assignee junction lookup, AND'd with the rest" logic that path already has.
        const built = await instanceConditions({ userId, status, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to })
        if (built === NO_MATCHES) return { data: [], meta: buildMeta(p, 0) }
        const where = built

        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart))
            .limit(p.limit).offset(p.offset)

        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    /** Paginated, for the same reason as getMine — this one is org-wide, so it was worse. */
    async listAll(filter: InstanceListFilter & { page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const built = await instanceConditions(filter)
        if (built === NO_MATCHES) return { data: [], meta: buildMeta(p, 0) }

        const where = built
        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart))
            .limit(p.limit).offset(p.offset)

        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    /**
     * The counts four screens used to derive by fetching every instance and reducing in JS —
     * the compliance board's stat tiles, the dashboard KPI strip's Due/Completed split,
     * CompareDashboard's completion ratio. Each of those was the reason the list endpoints had to
     * stay unbounded; with the numbers coming from the database, the lists can finally paginate.
     *
     * Two round-trips, not six: one conditional aggregate over instances, one over their items.
     */
    async summary(filter: InstanceListFilter) {
        const built = await instanceConditions(filter)
        const empty = { total: 0, completed: 0, pending: 0, due: 0, overdue: 0, totalItems: 0, doneItems: 0, newToday: 0 }
        if (built === NO_MATCHES) return empty

        // 30s, and no explicit invalidation: these counts move whenever anyone ticks a checklist
        // item anywhere, so there is no single "this just changed" moment to hook — and a tile
        // being up to half a minute stale is a fair trade for two aggregate scans per dashboard
        // load rather than per viewer. Deliberately short for the same reason.
        return cached(
            cacheKey("checklist-summary", filter.userId, filter.storeId, filter.assigneeId, filter.assigneeIds?.join(","), filter.definitionId, filter.status, filter.departmentId, filter.recurrence, filter.verificationStatus, filter.from, filter.to),
            30,
            async () => {
                const isComplete = completionCondition("COMPLETED")
                const [counts] = await db.select({
                    total: sql<number>`COUNT(*)`,
                    completed: sql<number>`SUM(CASE WHEN ${isComplete} THEN 1 ELSE 0 END)`,
                    overdue: sql<number>`SUM(CASE WHEN ${completionCondition("OVERDUE")} THEN 1 ELSE 0 END)`,
                    // Added for the sidebar's per-entity badge breakdown (see task/ticket/todo
                    // summary()) — every other consumer of this summary just ignores the extra
                    // field, so this is additive, not a shape change anything else depends on.
                    newToday: sql<number>`SUM(CASE WHEN ${checklistInstances.generatedAt} >= CURDATE() THEN 1 ELSE 0 END)`,
                }).from(checklistInstances).where(built)

                const [items] = await db.select({
                    totalItems: sql<number>`COUNT(*)`,
                    doneItems: sql<number>`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END)`,
                })
                    .from(checklistInstanceItems)
                    .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                    .where(built)

                const total = Number(counts?.total ?? 0)
                const completed = Number(counts?.completed ?? 0)
                const pending = total - completed
                const overdue = Number(counts?.overdue ?? 0)
                return {
                    total,
                    completed,
                    pending,
                    // On-track subset of `pending` — incomplete but not yet past its period end.
                    // No extra query: every incomplete instance is either overdue or due.
                    due: pending - overdue,
                    overdue,
                    totalItems: Number(items?.totalItems ?? 0),
                    doneItems: Number(items?.doneItems ?? 0),
                    newToday: Number(counts?.newToday ?? 0),
                }
            },
        )
    },

    /**
     * Audit history: every submitted audit row (one person's check on one day), newest first, with
     * the ticks, remarks and photos exactly as recorded. ADMIN/PC see every store; a department head
     * (MANAGER/SENIOR) sees only people who sit in their own department, and nothing at all when
     * they have no department. The route is closed to everyone else, an audited person included:
     * what an auditor wrote about someone is for the people who oversee the audit.
     */
    async auditHistory(user: AccessTokenPayload, filter: { from?: string; to?: string; storeId?: string; page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const conditions = [eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr]
        if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
        if (filter.from) conditions.push(gte(checklistInstances.periodStart, new Date(filter.from)))
        if (filter.to) conditions.push(lte(checklistInstances.periodStart, new Date(filter.to)))
        if (user.role !== "ADMIN" && user.role !== "PC") {
            if (!isHod(user) || !user.departmentId) return { data: [], meta: buildMeta(p, 0) }
            conditions.push(eq(users.departmentId, user.departmentId))
        }
        const where = and(...conditions)

        const [countRow] = await db.select({ n: sql<number>`COUNT(*)` })
            .from(checklistInstanceItemSubmissions)
            .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
            .where(where)
        const total = Number(countRow?.n ?? 0)

        const rows = await db.select({
            id: checklistInstanceItemSubmissions.id,
            remarks: checklistInstanceItemSubmissions.remarks,
            isNotApplicable: checklistInstanceItemSubmissions.isNotApplicable,
            completedAt: checklistInstanceItemSubmissions.completedAt,
            itemLabel: checklistInstanceItems.label,
            checklistTitle: checklistInstances.title,
            periodStart: checklistInstances.periodStart,
            storeId: checklistInstances.storeId,
            storeName: stores.name,
            personFirstName: users.firstName,
            personLastName: users.lastName,
        })
            .from(checklistInstanceItemSubmissions)
            .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .where(where)
            .orderBy(desc(checklistInstanceItemSubmissions.completedAt))
            .limit(p.limit).offset(p.offset)
        if (!rows.length) return { data: [], meta: buildMeta(p, total) }

        const submissionIds = rows.map((r) => r.id)
        const accessories = await db.select().from(checklistInstanceItemSubmissionAccessories)
            .where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds))
        const images = await db.select().from(checklistInstanceItemSubmissionImages)
            .where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds))

        const data = rows.map((r) => ({
            ...r,
            accessories: accessories.filter((a) => a.submissionId === r.id).map((a) => ({ name: a.name, checked: a.checked })),
            images: images.filter((img) => img.submissionId === r.id).map((img) => ({
                id: img.id,
                url: img.url,
                originalFilename: img.originalFilename,
                captureMethod: img.captureMethod,
                createdAt: img.createdAt,
            })),
        }))
        return { data, meta: buildMeta(p, total) }
    },

    async getById(id: string, user: AccessTokenPayload) {
        const instance = await getPopulatedInstanceById(id)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        await assertCanView(instance, user)
        return instance
    },

    async setItemDone(itemId: string, isDone: boolean, user: AccessTokenPayload, values: ItemValueInput = {}) {
        const [item] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
        if (!item) throw AppError.notFound("Checklist item not found.")

        // Fetch just enough of the parent instance to authorize + drive the side effects below —
        // no need for the full items/submissions populate setItemDone doesn't use.
        const [instanceRow] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, item.instanceId)).limit(1)
        if (!instanceRow) throw AppError.notFound("Checklist instance not found.")
        const assigneeLinkRows = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, instanceRow.id))
        const assigneeIds = assigneeLinkRows.map((l) => l.userId)
        assertCanAccess({ assigneeIds }, user)
        assertInstanceEditable(instanceRow, user)

        // Once something is done it stays done: only an admin may reopen it. A reviewer sending a
        // run back (verify, REJECT) reopens every item itself, so nobody else needs to undo their
        // own finished work — and a stray tap on a tick can no longer quietly un-complete a step.
        if (!isDone && item.isDone && user.role !== "ADMIN") {
            throw AppError.forbidden("This step is already done. Only an admin can reopen it.")
        }

        // A remark on its own (no answer, no change of done-ness) is just a note. It used to go
        // through the full completion path below: on a done item that re-ran every validator
        // against a request carrying no answer (so a Yes/No or number item failed with "answer
        // required"), and re-stamped completedAt/completedBy as if it were finished again.
        const { remarks: remarkInput, notApplicable, ...answerValues } = values
        const isRemarkOnly = remarkInput !== undefined
            && notApplicable === undefined
            && isDone === item.isDone
            && Object.values(answerValues).every((v) => v === undefined)
        if (isRemarkOnly) {
            const nextRemarks = remarkInput?.trim() ? remarkInput.trim() : null
            if (item.isNotApplicable && !nextRemarks) {
                throw AppError.badRequest("A not-applicable item needs a reason. Edit it instead of clearing it.")
            }
            await db.update(checklistInstanceItems).set({ remarks: nextRemarks, updatedAt: new Date() }).where(eq(checklistInstanceItems.id, itemId))
            const [saved] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
            if (!saved) throw AppError.notFound("Checklist item not found.")
            await auditService.record({
                entityType: "ChecklistInstanceItem",
                entityId: itemId,
                action: "UPDATE",
                actorId: user.sub,
                before: auditItemSnapshot(item),
                after: auditItemSnapshot(saved),
            })
            emitChecklistEvent("checklist-instance:updated", { storeId: instanceRow.storeId }, { instanceId: instanceRow.id })
            return stripSecretItemFields(saved)
        }

        // Not applicable: counts as done, skips the item's own answer/photo rules, but must say why.
        const markingNotApplicable = isDone && notApplicable === true
        if (notApplicable === true && !isDone) {
            throw AppError.badRequest("Send isDone: true with notApplicable.")
        }

        // AUDIT items only complete through checklistInstanceItemSubmission.service.ts's
        // per-person flow (recomputeItemAndVerification flips this once every person has been
        // submitted). Letting this endpoint flip isDone directly would let any assignee mark the
        // audit "done" with nobody ever having been checked. "Not applicable" is the one exception
        // (nothing to audit today), and only while nobody's been recorded yet — otherwise it would
        // throw away checks that were really done.
        if (isDone && item.itemType === "AUDIT") {
            if (!markingNotApplicable) {
                throw AppError.badRequest("Audit items can only be completed by submitting each person's check.")
            }
            const [alreadyChecked] = await db.select({ id: checklistInstanceItemSubmissions.id }).from(checklistInstanceItemSubmissions)
                .where(and(eq(checklistInstanceItemSubmissions.itemId, itemId), eq(checklistInstanceItemSubmissions.isDone, true)))
                .limit(1)
            if (alreadyChecked) {
                throw AppError.badRequest("Some people are already checked on this audit, so it can't be marked not applicable.")
            }
        }

        if (markingNotApplicable) {
            const reason = (remarkInput ?? item.remarks)?.trim()
            if (!reason) throw AppError.badRequest("Say why this step doesn't apply before marking it not applicable.")
        }

        // opensTime gates STARTING work, not un-doing it — reopening an already-completed item
        // (isDone: false) is always allowed regardless of the window, same as it already ignores
        // isLocked/verification state elsewhere. periodStart is a UTC-midnight calendar-day label
        // (see checklistDisplay.ts's formatDate comment), so opensTime is anchored to it in UTC too.
        if (isDone) assertInstanceOpen(instanceRow)

        const patch: Partial<typeof checklistInstanceItems.$inferInsert> = {}
        if (values.numericValue !== undefined) patch.numericValue = values.numericValue
        if (values.booleanAnswer !== undefined) patch.booleanAnswer = values.booleanAnswer
        // Fixed during migration: the source set `item.booleanAnswer` here too (copy-paste typo),
        // which meant a TEXT_BOX/MULTIPLE_CHOICE/DROPDOWN/QR_SCAN answer was never actually
        // persisted — this now correctly writes textValue.
        if (values.textValue !== undefined) patch.textValue = values.textValue
        if (values.dateValue !== undefined) {
            const parsed = new Date(values.dateValue)
            if (Number.isNaN(parsed.getTime())) throw AppError.badRequest("That doesn't look like a valid date.")
            patch.dateValue = parsed
        }
        if (values.gpsLat !== undefined) patch.gpsLat = values.gpsLat
        // Fixed during migration: the source never assigned `item.gpsLng` at all (only gpsLat was
        // ever persisted) — a GPS item's longitude reading was silently dropped.
        if (values.gpsLng !== undefined) patch.gpsLng = values.gpsLng
        if (values.gpsAccuracy !== undefined) patch.gpsAccuracy = values.gpsAccuracy
        if (values.gpsLat !== undefined || values.gpsLng !== undefined) patch.gpsCapturedAt = new Date()
        if (values.signatureValue !== undefined) patch.signatureValue = values.signatureValue
        if (values.secondSignatureValue !== undefined) patch.secondSignatureValue = values.secondSignatureValue
        if (values.conditionalReasonValue !== undefined) patch.conditionalReasonValue = values.conditionalReasonValue
        if (remarkInput !== undefined) patch.remarks = remarkInput?.trim() ? remarkInput.trim() : null
        // Any save that isn't an explicit N/A (a real completion or a reopen) clears the flag, so
        // reopening an N/A item puts it back to a normal, answerable step.
        patch.isNotApplicable = markingNotApplicable

        // Validators need to see the patched values (e.g. a just-submitted conditionalReasonValue)
        // the same way the original code validated against the already-`.save()`d in-memory
        // document — merge here instead of round-tripping through the DB.
        const mergedItem = { ...item, ...patch }

        if (isDone && !markingNotApplicable) {
            await assertPhotosSatisfied(mergedItem)
            VALUE_VALIDATORS_BY_ITEM_TYPE[item.itemType]?.(mergedItem, values)
            await assertConditionalActionsSatisfied(mergedItem, values)
        }

        const completion = deriveInstanceItemCompletion(isDone, isDone ? user.sub : null)
        await db.update(checklistInstanceItems).set({
            ...patch,
            isDone,
            completedAt: completion.completedAt,
            completedBy: completion.completedBy,
            updatedAt: new Date(),
        }).where(eq(checklistInstanceItems.id, itemId))

        let updatedItem = { ...mergedItem, isDone, completedAt: completion.completedAt, completedBy: completion.completedBy }

        if (isDone && !markingNotApplicable) {
            updatedItem = await applyConditionalSideEffects(updatedItem, instanceRow, user, values)
        }

        await syncVerificationStatus(instanceRow.id)

        // Re-select so the response reflects exactly what's in the DB (e.g. if applyConditionalSideEffects's
        // issueId update above landed).
        const [finalItem] = await db.select().from(checklistInstanceItems).where(eq(checklistInstanceItems.id, itemId)).limit(1)
        if (!finalItem) throw AppError.notFound("Checklist item not found.")

        // Answers are overwritten in place, so without this there was no way to tell what a
        // record said before someone changed it. One row per save/reopen, before + after.
        await auditService.record({
            entityType: "ChecklistInstanceItem",
            entityId: itemId,
            action: isDone ? (item.isDone ? "UPDATE" : "COMPLETE") : "REOPEN",
            actorId: user.sub,
            before: auditItemSnapshot(item),
            after: auditItemSnapshot(finalItem),
        })

        emitChecklistEvent("checklist-instance:updated", { storeId: instanceRow.storeId }, { instanceId: instanceRow.id })
        return stripSecretItemFields(finalItem)
    },

    // GET /checklist-instances/pending-verification — PC sees every store's queue, same as ADMIN.
    // MANAGER (HOD) only sees the subset assigned to someone in their own department. Single-stage
    // review: used to also take a `status` picking between two review-stage queues (PENDING for
    // QC, PENDING_APPROVAL for a separate org-wide-only final approval) — collapsed to one queue.
    async listPendingVerification(user: AccessTokenPayload, page?: number, limit?: number) {
        const p = paginate(page, limit)
        // Always excluded, every role including ADMIN/PC — this is an actionable "needs your
        // review" queue, not an audit view (matches getMine's own reasoning, see that method's
        // controller comment). A deleted checklist's leftover PENDING_APPROVAL instance has
        // nothing left to approve it into — its own template is gone — so it doesn't belong in
        // a queue framed around "review this." Audit history stays reachable on the Compliance
        // Board's explicit toggle instead.
        const conditions = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]

        if (user.role !== "ADMIN" && user.role !== "PC") {
            // ADMIN/PC see everything (unchanged). Everyone else is scoped to the union of their
            // MANAGER/HOD department (if any) and whatever they've been explicitly named a reviewer
            // on — the same additive rule as assertCanVerify. This also covers a role with no
            // department-based access at all (e.g. an AGENT named as an explicit reviewer): they used
            // to be blocked from this endpoint entirely by the route's role gate, which is now gone in
            // favor of this per-instance scoping.
            const scopeIds = new Set<string>()

            if (isHod(user) && user.departmentId) {
                const deptUsers = await db.select({ id: users.id }).from(users).where(eq(users.departmentId, user.departmentId))
                if (deptUsers.length) {
                    const links = await db.select({ instanceId: checklistInstanceAssignees.instanceId })
                        .from(checklistInstanceAssignees)
                        .where(inArray(checklistInstanceAssignees.userId, deptUsers.map((u) => u.id)))
                    for (const l of links) scopeIds.add(l.instanceId)
                }
            }

            const reviewerLinks = await db.select({ instanceId: checklistInstanceReviewers.instanceId })
                .from(checklistInstanceReviewers)
                .where(eq(checklistInstanceReviewers.userId, user.sub))
            for (const l of reviewerLinks) scopeIds.add(l.instanceId)

            if (!scopeIds.size) return { data: [], meta: buildMeta(p, 0) }
            conditions.push(inArray(checklistInstances.id, [...scopeIds]))
        }

        const where = and(...conditions)
        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart))
            .limit(p.limit).offset(p.offset)
        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    // Dashboard's "Needs your approval" card (ADMIN/PC only — gated at the route). Excludes a
    // deleted checklist's leftover queue now, same reasoning as listPendingVerification just
    // above — this card is framed as "here's what to go act on," and a deleted checklist has
    // nothing left to act on. Oldest-waiting-first via `updatedAt` directly — no second query
    // needed here, unlike Ticket/Task: there's no generic "edit any field" endpoint for an
    // instance that could drift it, syncVerificationStatus only touches it exactly when the
    // status flips into or out of PENDING_APPROVAL, so it's a trustworthy "entered approval at"
    // timestamp as-is (see that method's own comment near the top of this file).
    async pendingApprovalPreview(limit = 8): Promise<ChecklistPendingApprovalRow[]> {
        const rows = await db.select({
            id: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            updatedAt: checklistInstances.updatedAt,
        })
            .from(checklistInstances)
            .leftJoin(stores, eq(checklistInstances.storeId, stores.id))
            .where(and(eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr))
            .orderBy(asc(checklistInstances.updatedAt))
            .limit(limit)

        return rows.map((r) => ({
            id: r.id,
            title: r.title,
            storeName: r.storeName ?? null,
            waitingSince: r.updatedAt.toISOString(),
        }))
    },

    async verify(id: string, input: VerifyChecklistInstanceInput, user: AccessTokenPayload) {
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
        if (!instance) throw AppError.notFound("Checklist instance not found")

        if (instance.verificationStatus !== "PENDING_APPROVAL") {
            throw AppError.badRequest("This checklist isn't pending approval.")
        }

        // Single-stage verify: one PC/ADMIN/manager/reviewer check decides the whole thing (the
        // old two-stage QC-then-approval split — a separate APPROVAL_MANAGER-only sign-off after
        // QC passed — is gone; approving here is final).
        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
        const assigneeDepartmentIds = await getDepartmentIdsForUserIds(assigneeLinks.map((l) => l.userId))
        const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
        assertCanVerify(assigneeDepartmentIds, reviewerLinks.map((l) => l.userId), user)

        const now = new Date()
        // Built up locally instead of re-selecting the row after the write — this is exactly what
        // the UPDATE below sets, so a second round trip just to read back our own write is wasted.
        let afterRow: typeof instance

        if (input.action === "APPROVE") {
            afterRow = { ...instance, verificationStatus: "APPROVED", verifiedBy: user.sub, verifiedAt: now, verificationNote: input.note ?? null, updatedAt: now }
            await db.update(checklistInstances).set({
                verificationStatus: "APPROVED",
                verifiedBy: user.sub,
                verifiedAt: now,
                verificationNote: input.note ?? null,
                updatedAt: now,
            }).where(eq(checklistInstances.id, id))
        } else {
            // A reject sends the whole checklist back, not just a status label: bump
            // rejectionCount (so a later APPROVE is never counted as "first-attempt" for the
            // quality score below) and reopen every item so the assignee has a genuinely
            // incomplete checklist to fix and resubmit — matches the "re-check everything to
            // resubmit" copy already shown on the instance detail page for REJECTED.
            afterRow = { ...instance, verificationStatus: "REJECTED", verificationNote: input.note ?? null, rejectionCount: instance.rejectionCount + 1, updatedAt: now }
            await db.transaction(async (tx) => {
                await tx.update(checklistInstances).set({
                    verificationStatus: "REJECTED",
                    verificationNote: input.note ?? null,
                    rejectionCount: sql`${checklistInstances.rejectionCount} + 1`,
                    updatedAt: now,
                }).where(eq(checklistInstances.id, id))
                await tx.update(checklistInstanceItems).set({
                    isDone: false,
                    completedAt: null,
                    completedBy: null,
                    updatedAt: now,
                }).where(eq(checklistInstanceItems.instanceId, id))
                // AUDIT items derive isDone from their auditors' submissions — reopening only the
                // item left every submission saying "Submitted" with nothing for the auditor to redo.
                await tx.update(checklistInstanceItemSubmissions).set({ isDone: false, isNotApplicable: false, completedAt: null, updatedAt: now })
                    .where(sql`${checklistInstanceItemSubmissions.itemId} IN (SELECT id FROM ${checklistInstanceItems} WHERE ${checklistInstanceItems.instanceId} = ${id})`)
            })
        }

        notificationService
            .notifyChecklistVerificationResult({ _id: instance.id, title: instance.title, assigneeIds: assigneeLinks.map(l => l.userId) }, input.action, input.note)
            .catch((err) => console.error("Failed to notify checklist verification result:", err))

        // The compliance decision itself — who approved or rejected a store's checklist, when,
        // and with what note. `before` is the pre-decision row so a reject's item reset is visible
        // as a change rather than just a status label flipping.
        await auditService.record({
            entityType: "ChecklistInstance",
            entityId: id,
            action: input.action === "APPROVE" ? "APPROVE" : "REJECT",
            actorId: user.sub,
            before: instance,
            after: afterRow,
        })

        const result = await getPopulatedInstanceById(id)
        emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
        return result!
    },

    // GET /checklist-instances/reports/compliance?groupBy=&storeId=&from=&to= (ADMIN only).
    // Mirrors taskService.complianceReport's shape/pipeline exactly, but buckets by the parent
    // instance's periodStart rather than the item's own createdAt — periodStart is the
    // semantically correct "which operational period does this belong to" field; createdAt is
    // just whenever the cron job happened to stamp the item out (could lag on a backfill run).
    // `includeDeleted` mirrors instanceConditions' own flag (see parentNotDeletedExpr's comment) —
    // off by default so a deleted checklist's history doesn't inflate the org-wide trend/rate
    // cards, same as the board/summary it sits above. Can't reuse parentNotDeletedExpr itself
    // here: that fragment refers to the unaliased `ChecklistInstance` table, but this query
    // aliases it `ci` — MySQL requires the alias once one's assigned in the same statement.
    async complianceReport(groupBy: DateBucket, storeId?: string, from?: string, to?: string, includeDeleted = false) {
        const conditions: ReturnType<typeof sql>[] = [];
        if (!includeDeleted) {
            conditions.push(sql`NOT EXISTS (SELECT 1 FROM ${checklistDefinitions} d WHERE d.id = ci.definitionId AND d.deletedAt IS NOT NULL)`);
        }
        if (storeId) conditions.push(sql`ci.storeId = ${storeId}`);
        if (from) conditions.push(sql`ci.periodStart >= ${new Date(from)}`);
        if (to) conditions.push(sql`ci.periodStart <= ${new Date(to)}`);
        const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        // db.execute() on the mysql2 driver resolves to the raw mysql2 tuple [rows, fields],
        // NOT a plain row array — must destructure element 0 (see task.service.ts#complianceReport).
        //
        // doneItems is naturally dampened by a rejection now: verify()'s REJECT path resets every
        // item on the instance back to isDone=false, so a rejected-and-not-yet-fixed checklist's
        // items simply don't count toward completion until the assignee actually redoes them —
        // no extra WHERE clause needed here for that.
        //
        // submittedInstances/firstAttemptApproved are instance-level counts (COUNT DISTINCT ci.id)
        // computed inside the same item-level GROUP BY — safe because every item of one instance
        // shares that instance's periodStart, so an instance can never straddle two buckets.
        // firstAttemptApproved only counts an APPROVED instance whose rejectionCount is still 0 —
        // one that was ever sent back and later fixed no longer counts as "first attempt," even
        // though it's now approved.
        const [rows] = await db.execute(sql`
            SELECT
                DATE_FORMAT(ci.periodStart, ${DATE_FORMATS[groupBy]}) AS bucket,
                COUNT(*) AS totalItems,
                SUM(cii.isDone) AS doneItems,
                SUM(cii.requiredImageCount > 0) AS itemsRequiringPhotos,
                SUM(
                    CASE WHEN cii.requiredImageCount > 0
                        AND (CASE WHEN cii.requiresLivePhoto THEN COALESCE(img.liveCount, 0) ELSE COALESCE(img.totalCount, 0) END) >= cii.requiredImageCount
                    THEN 1 ELSE 0 END
                ) AS photoCompliantItems,
                SUM(CASE WHEN ${GATED_BOOLEAN_ITEM_EXPR} THEN 1 ELSE 0 END) AS gatedBooleanItems,
                SUM(CASE WHEN ${FLAGGED_BOOLEAN_ANSWER_EXPR} THEN 1 ELSE 0 END) AS flaggedItems,
                COUNT(DISTINCT CASE WHEN ci.verificationStatus IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') OR ci.rejectionCount > 0 THEN ci.id END) AS submittedInstances,
                COUNT(DISTINCT CASE WHEN ci.verificationStatus = 'APPROVED' AND ci.rejectionCount = 0 THEN ci.id END) AS firstAttemptApproved
            FROM ChecklistInstanceItem cii
            JOIN ChecklistInstance ci ON ci.id = cii.instanceId
            LEFT JOIN (
                SELECT checklistInstanceItemId, COUNT(*) AS totalCount, SUM(captureMethod = 'LIVE') AS liveCount
                FROM ChecklistInstanceImage GROUP BY checklistInstanceItemId
            ) img ON img.checklistInstanceItemId = cii.id
            ${whereClause}
            GROUP BY bucket
            ORDER BY bucket ASC
        `);

        return (rows as unknown as any[]).map((r) => ({
            bucket: r.bucket as string,
            totalItems: Number(r.totalItems),
            doneItems: Number(r.doneItems),
            completionRate: Number(r.totalItems) ? Math.round((Number(r.doneItems) / Number(r.totalItems)) * 1000) / 10 : null,
            itemsRequiringPhotos: Number(r.itemsRequiringPhotos),
            qualityRate: Number(r.itemsRequiringPhotos) ? Math.round((Number(r.photoCompliantItems) / Number(r.itemsRequiringPhotos)) * 1000) / 10 : null,
            // Share of gated Yes/No-style items whose answer landed on the flagged branch —
            // higher is worse (pair with `lowerIsBetter` wherever it's shown), null when nothing
            // in this bucket was actually gated with a conditional action.
            gatedBooleanItems: Number(r.gatedBooleanItems),
            issueRate: Number(r.gatedBooleanItems) ? Math.round((Number(r.flaggedItems) / Number(r.gatedBooleanItems)) * 1000) / 10 : null,
            submittedInstances: Number(r.submittedInstances),
            firstAttemptApproved: Number(r.firstAttemptApproved),
            approvalRate: Number(r.submittedInstances) ? Math.round((Number(r.firstAttemptApproved) / Number(r.submittedInstances)) * 1000) / 10 : null,
        }));
    },
}
