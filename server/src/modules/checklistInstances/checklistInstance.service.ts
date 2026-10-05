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
    checklistDefinitionItems,
    users,
    dressTypes,
    stores,
    departments,
    auditLogs,
    holidays,
    CHECKLIST_RECURRENCES,
    CHECKLIST_VERIFICATION_STATUSES,
} from "../../db/schema/index.js"
import { eq, and, inArray, desc, asc, sql, gte, lte, lt, type SQL } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import { notificationService } from "../notifications/notification.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { missedFromPastDayExpr, missedInstanceIds, assertRunNotMissed } from "./checklistMissedRun.js"
import { auditService } from "../audit/audit.service.js"
import { cached, cacheKey, invalidateQuick } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { VerifyChecklistInstanceInput } from "./checklistInstance.validation.js"
import type { Role } from "../../db/schema/core.js"
import { emitChecklistEvent } from "../../sockets/checklistEvent.js"
import { env } from "../../config/env.js"
import { checklistReportService, type ChecklistReportQuery } from "./checklistReport.service.js"
import type { ChecklistReportScope } from "./checklistReportScope.js"
import { orgLocalDate, addDays, utcSql, asOrgDay } from "./checklistReportRange.js"

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
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, storeId: users.storeId, isActive: users.isActive, gender: users.gender }).from(users).where(inArray(users.id, submissionUserIds))
        : []
    const submissionUserById = new Map(submissionUsers.map((u) => [u.id, u]))

    // Dress types for the audit questions, resolved in two batched reads:
    //  - each submission's OWN type as { id, name } (what it is checked against today, which may
    //    differ from the person's profile), and
    //  - per AUDIT question, the active types the question has a non-empty list for (the picker's
    //    options), read off the live definition question via definitionItemId.
    const auditItems = items.filter((i) => i.itemType === "AUDIT")
    const definitionItemIds = [...new Set(auditItems.map((i) => i.definitionItemId).filter((id): id is string => !!id))]
    const typeListRows = definitionItemIds.length
        ? await db.select({ id: checklistDefinitionItems.id, accessoriesByType: checklistDefinitionItems.accessoriesByType }).from(checklistDefinitionItems).where(inArray(checklistDefinitionItems.id, definitionItemIds))
        : []
    const typeIdsByDefinitionItem = new Map(typeListRows.map((r) => [
        r.id,
        Object.entries(r.accessoriesByType ?? {}).filter(([, list]) => Array.isArray(list) && list.length > 0).map(([typeId]) => typeId),
    ]))
    const wantedTypeIds = [...new Set([
        ...submissions.map((s) => s.dressTypeId).filter((id): id is string => !!id),
        ...[...typeIdsByDefinitionItem.values()].flat(),
    ])]
    const dressTypeRows = wantedTypeIds.length
        ? await db.select({ id: dressTypes.id, name: dressTypes.name, gender: dressTypes.gender, isActive: dressTypes.isActive }).from(dressTypes).where(inArray(dressTypes.id, wantedTypeIds))
        : []
    const dressTypeById = new Map(dressTypeRows.map((t) => [t.id, t]))
    const dressTypeOptionsFor = (definitionItemId: string | null) =>
        (definitionItemId ? typeIdsByDefinitionItem.get(definitionItemId) ?? [] : [])
            .map((typeId) => dressTypeById.get(typeId))
            .filter((t): t is NonNullable<typeof t> => !!t && t.isActive)
            .map((t) => ({ id: t.id, name: t.name, gender: t.gender }))
            .sort((x, y) => x.name.localeCompare(y.name))

    const submissionsByItem = new Map<string, any[]>()
    for (const submission of submissions) {
        const mapped = {
            ...submission,
            // Mirrors the original `.populate({ path: "userId", select: "firstName lastName storeId" })`
            // — same field name, populated in place, only the fields the UI needs.
            userId: submissionUserById.get(submission.userId) ?? null,
            // What this person is checked against today (their own pick, not the profile's).
            dressType: submission.dressTypeId && dressTypeById.has(submission.dressTypeId)
                ? { id: submission.dressTypeId, name: dressTypeById.get(submission.dressTypeId)!.name }
                : null,
            accessories: (accessoriesBySubmission.get(submission.id) ?? []).map((a) => ({ id: a.id, name: a.name, checked: a.checked })),
            images: submissionImagesBySubmission.get(submission.id) ?? [],
        }
        const list = submissionsByItem.get(submission.itemId) ?? []
        list.push(mapped)
        submissionsByItem.set(submission.itemId, list)
    }

    // Who ticked each question and who submitted the run, as names, so a reviewer can see who did what.
    const nameUserIds = [...new Set([
        ...items.map((i) => i.completedBy).filter((id): id is string => !!id),
        ...instanceRows.map((i) => i.submittedBy).filter((id): id is string => !!id),
    ])]
    const nameRows = nameUserIds.length
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, nameUserIds))
        : []
    const nameById = new Map(nameRows.map((u) => [u.id, `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`]))

    const itemsByInstance = new Map<string, any[]>()
    for (const item of items) {
        const mapped = {
            ...stripSecretItemFields(item),
            completedByName: item.completedBy ? (nameById.get(item.completedBy) ?? null) : null,
            images: imagesByItem.get(item.id) ?? [],
            submissions: submissionsByItem.get(item.id) ?? [],
            // AUDIT only: the dress types the auditor may pick between (empty = no picker).
            ...(item.itemType === "AUDIT" ? { dressTypeOptions: dressTypeOptionsFor(item.definitionItemId) } : {}),
        }
        const list = itemsByInstance.get(item.instanceId) ?? []
        list.push(mapped)
        itemsByInstance.set(item.instanceId, list)
    }

    const missedIds = await missedInstanceIds(instanceIds)

    return instanceRows.map((instance) => ({
        ...instance,
        // A run nobody finished before its day ended: counted as missed, no longer fillable.
        isMissed: missedIds.has(instance.id),
        assigneeIds: assigneeIdsByInstance.get(instance.id) ?? [],
        reviewerIds: reviewerIdsByInstance.get(instance.id) ?? [],
        submittedByName: instance.submittedBy ? (nameById.get(instance.submittedBy) ?? null) : null,
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

    // Every branch is fully parenthesised: drizzle's and(...) joins conditions without wrapping each
    // one, so a bare `a OR b` would swallow the AND-ed conditions around it.
    if (status === "COMPLETED") return sql`(${complete})`
    // Deadline is cutoffTime (same-day, or next-day for an overnight window) when set, else
    // periodEnd — same rule the summary's `overdue` count uses, and the client's isInstanceOverdue.
    if (status === "OVERDUE") return sql`((${incomplete}) AND ${deadlineExpr} < ${localNowExpr})`
    if (status === "DUE") return sql`((${incomplete}) AND ${deadlineExpr} >= ${localNowExpr})`
    return sql`(${incomplete})` // "OPEN" — every incomplete instance, overdue or not ("Pending")
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

    // Finishing the last question no longer sends the run for review by itself: the person confirms
    // with Submit (see submit() below), so nothing leaves their hands by accident. This only keeps a
    // submitted run honest: once something on it is reopened (an admin reopen, a live edit adding a
    // question), it is no longer "everything done", so it goes back to not submitted and has to be
    // submitted again. A run that was sent back (REJECTED) stays that way until it is resubmitted.
    if (!allDone && (instance.verificationStatus === "PENDING_APPROVAL" || instance.verificationStatus === "APPROVED")) {
        await db.update(checklistInstances)
            .set({ verificationStatus: "NOT_SUBMITTED", submittedAt: null, submittedBy: null, approvalReminderSentAt: null, approvalEscalatedAt: null, updatedAt: new Date() })
            .where(eq(checklistInstances.id, instanceId))
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

// The decisions feed (checklistInstanceService.decisions): audit actions on a run that a reviewer or
// the person filling it in took. See the audit records in submit/sendBack/verify above.
const DECISION_ACTIONS = ["APPROVE", "REJECT", "SEND_BACK", "SUBMIT"] as const
const DECISIONS_MAX = 200
export type ChecklistDecision = {
    id: string
    instanceId: string
    title: string
    storeName: string | null
    action: (typeof DECISION_ACTIONS)[number]
    at: string
    actorName: string
    note: string | null
    itemCount: number | null
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
    /** Restricts to instances whose periodStart falls in [from, to] — an ISO instant or a plain
     *  YYYY-MM-DD, both read as org-local days (see asOrgDay), inclusive of both days, same
     *  convention as complianceReport's own from/to. Lets the compliance board's
     *  "who's done what" list be scoped to a past period (e.g. last month) instead of always
     *  showing every instance ever generated. */
    from?: string
    to?: string
}

// A checklist instance carries no departmentId of its own (only storeId — see
// checklistInstance.ts's schema comment) — "department" is derived from whichever department(s)
// its assignees actually sit in, same convention as assertCanView/CAN_VERIFY_BY_ROLE's MANAGER
// branch above. Shared by instanceConditions (org-wide list/summary), getMine (my checklists) and
// the pending-approval scope. An EXISTS subquery, not an id list: the list used to be every run the
// department had ever had, pulled into Node and sent back as one giant IN (...).
// (Replaces instanceIdsForDepartment, which older comments in this module still mention.)
const instanceInDepartmentCondition = (departmentId: string): SQL => sql`EXISTS (
    SELECT 1 FROM ${checklistInstanceAssignees} a
    JOIN ${users} u ON u.id = a.userId
    WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${departmentId}
)`

// The "not finished" views (pending / due / overdue) only look at runs that began in the last
// SUMMARY_WINDOW_DAYS org-local days, so a daily run nobody filled a month ago stops counting as
// "overdue" for ever; a ONE_TIME checklist has no next period to move on to, so it is exempt and
// counts until it is done. This ONE expression is used by both the list's status filter
// (instanceConditions) and the summary's counts, so a tile and the list it opens can never disagree.
// total / completed / item counts are not windowed.
const SUMMARY_WINDOW_DAYS = 45
const NOT_FINISHED_STATUSES: readonly InstanceStatusFilter[] = ["OPEN", "DUE", "OVERDUE"]

// periodStart is the org-local day written as UTC midnight, hence the day arithmetic.
const inWindowExpr = (now: Date = new Date()): SQL => {
    const windowStart = new Date(`${addDays(orgLocalDate(now), -SUMMARY_WINDOW_DAYS)}T00:00:00.000Z`)
    return sql`(${checklistInstances.recurrence} = 'ONE_TIME' OR ${checklistInstances.periodStart} >= ${utcSql(windowStart)})`
}

const dayStartUtc = (day: string) => new Date(`${day}T00:00:00.000Z`)

const instanceConditions = (filter: InstanceListFilter): SQL | undefined => {
    // Excluded by default regardless of what else the caller is filtering by — unless the caller
    // is ADMIN/PC auditing history (`includeDeleted`, set only by the controller from the
    // requester's own role, never client-supplied).
    const conditions: SQL[] = filter.includeDeleted ? [] : [parentNotDeletedExpr]
    if (filter.definitionId) conditions.push(eq(checklistInstances.definitionId, filter.definitionId))
    if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
    if (filter.status) conditions.push(completionCondition(filter.status))
    // Same window the summary's pending/due/overdue tiles use, so clicking a tile lists exactly what
    // it counted. An explicit `from` means the caller picked a period: no window then.
    if (filter.status && NOT_FINISHED_STATUSES.includes(filter.status) && !filter.from) conditions.push(inWindowExpr())
    if (filter.recurrence) conditions.push(eq(checklistInstances.recurrence, filter.recurrence))
    if (filter.verificationStatus) conditions.push(eq(checklistInstances.verificationStatus, filter.verificationStatus))
    // from/to are an ISO instant or a plain YYYY-MM-DD. Either way they become org-local DAYS and are
    // compared as dates (periodStart is the org-local day at UTC midnight), so a browser in another
    // time zone cannot shift the first or last day. `to` is inclusive of its whole day.
    if (filter.from) conditions.push(gte(checklistInstances.periodStart, dayStartUtc(asOrgDay(filter.from))))
    if (filter.to) conditions.push(lt(checklistInstances.periodStart, dayStartUtc(addDays(asOrgDay(filter.to), 1))))

    // The assignee lives in the checklistInstanceAssignees junction table, not on the instance, so
    // these are EXISTS subqueries against it. Nothing matching simply yields no rows (and zero
    // counts) — there is no "no filter" fallthrough to guard against.
    const assigneeFilter = filter.assigneeId ?? filter.userId
    if (assigneeFilter) {
        // Assignees only. Someone who's merely on an AUDIT item's "who gets audited" list is the
        // subject of a check, not a participant in it — the assignee works through them — so the run
        // must not turn up in their My Checklists (or their counts and badges), where it used to
        // hand every audited person the auditor's whole checklist.
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            WHERE a.instanceId = ${checklistInstances.id} AND a.userId = ${assigneeFilter}
        )`)
    }

    // Separate condition from assigneeFilter above (not merged into it) so "mine, AND also
    // shared with any of these people" intersects both sets instead of one replacing the other.
    if (filter.assigneeIds?.length) {
        conditions.push(sql`EXISTS (
            SELECT 1 FROM ${checklistInstanceAssignees} a
            WHERE a.instanceId = ${checklistInstances.id}
            AND a.userId IN (${sql.join(filter.assigneeIds.map((id) => sql`${id}`), sql`, `)})
        )`)
    }

    if (filter.departmentId) conditions.push(instanceInDepartmentCondition(filter.departmentId))

    // "Mine" is today's work. An explicit from/to means the caller is looking at a chosen period, so
    // that view keeps the misses.
    if (filter.userId && !filter.from && !filter.to) conditions.push(sql`NOT ${missedFromPastDayExpr}`)

    return conditions.length ? and(...conditions) : undefined
}

// Which "needs approval" runs a caller may see — shared by the paginated Verification queue and the
// dashboard's preview so the two can never disagree. undefined = no restriction (ADMIN/PC, every
// store). Everyone else is scoped to the union of (a) runs with an assignee in their own department,
// when they head one (MANAGER/SENIOR), and (b) runs they are explicitly named a reviewer on. This is
// the same additive rule as assertCanVerify, and it fails closed: a head with no department, and
// no reviewer rows, sees nothing. It also covers a role with no department access at all (e.g. an
// AGENT named as a reviewer), which is why neither route role-gates.
const pendingApprovalScope = (user: AccessTokenPayload): SQL | undefined => {
    if (user.role === "ADMIN" || user.role === "PC") return undefined
    const parts: SQL[] = [sql`EXISTS (
        SELECT 1 FROM ${checklistInstanceReviewers} r
        WHERE r.instanceId = ${checklistInstances.id} AND r.userId = ${user.sub}
    )`]
    if (isHod(user) && user.departmentId) parts.push(instanceInDepartmentCondition(user.departmentId))
    return sql`(${sql.join(parts, sql` OR `)})`
}

// The dashboard's checklist numbers: see SUMMARY_WINDOW_DAYS / inWindowExpr above for the window.
// Short, with explicit invalidation from the paths below. The TTL covers what has no hook (the
// generator creating runs, audit submissions, a deadline passing).
const SUMMARY_TTL_SECONDS = 10
const CHECKLIST_SUMMARY_PREFIX = "checklist-summary"

// Everything cached under a user's id, or under "org" (an admin's org-wide view and a department
// head's department view, neither of which is tied to one userId).
const summaryOwnerKey = (userId: string | undefined) => `u:${userId ?? "org"}`

/**
 * Drops the cached summaries a change to one run can affect: each assignee's own, plus the org-level
 * ones (admin org view, department heads' view). Many assignees (a shared store run) just wipe the
 * lot, which is cheaper than a SCAN per person.
 */
export const dropChecklistSummaries = (assigneeIds: string[]) => {
    const prefixes = assigneeIds.length > 4
        ? [`${CHECKLIST_SUMMARY_PREFIX}:`]
        : [summaryOwnerKey(undefined), ...assigneeIds.map((id) => summaryOwnerKey(id))].map((owner) => `${CHECKLIST_SUMMARY_PREFIX}:${owner}:`)
    return invalidateQuick(...prefixes)
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
        const where = instanceConditions({ userId, status, storeId, recurrence, verificationStatus, departmentId, assigneeIds, includeDeleted, from, to })

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
        const where = instanceConditions(filter)
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
     *
     * pending / due / overdue are windowed (see SUMMARY_WINDOW_DAYS), unless the caller asked for an
     * explicit `from`: someone looking at last quarter on the compliance board wants that period's
     * misses, not zeros. The list's OPEN/DUE/OVERDUE filter uses the same window, so a tile and the
     * list it opens agree; `total` is the unfiltered list's count, and total = completed + pending +
     * olderOpen (unfinished runs older than the window). Completion counts an N/A question as done, exactly like everywhere else
     * (isDone is what N/A sets), so a run with N/A answers can still be complete.
     */
    async summary(filter: InstanceListFilter) {
        // Explicit invalidation from setItemDone / submit / verify / sendBack / reopenApproval
        // (dropChecklistSummaries), and a short TTL for the rest. The key carries every filter that
        // changes the answer: includeDeleted and the from/to window were missing, so an admin
        // toggling "show deleted" or changing the period was handed the other view's cached numbers.
        return cached(
            cacheKey(
                CHECKLIST_SUMMARY_PREFIX, summaryOwnerKey(filter.userId), filter.includeDeleted ? "deleted" : "live",
                filter.storeId, filter.assigneeId, filter.assigneeIds?.join(","), filter.definitionId, filter.status,
                filter.departmentId, filter.recurrence, filter.verificationStatus, filter.from, filter.to,
            ),
            SUMMARY_TTL_SECONDS,
            async () => {
                const built = instanceConditions(filter)
                const now = new Date()
                // The same window the list's OPEN / DUE / OVERDUE filter applies (instanceConditions).
                const inWindow = filter.from ? sql`(1 = 1)` : inWindowExpr(now)

                const isComplete = completionCondition("COMPLETED")
                const [counts] = await db.select({
                    total: sql<number>`COUNT(*)`,
                    completed: sql<number>`SUM(CASE WHEN ${isComplete} THEN 1 ELSE 0 END)`,
                    pending: sql<number>`SUM(CASE WHEN (${completionCondition("OPEN")}) AND ${inWindow} THEN 1 ELSE 0 END)`,
                    overdue: sql<number>`SUM(CASE WHEN (${completionCondition("OVERDUE")}) AND ${inWindow} THEN 1 ELSE 0 END)`,
                    // Unfinished runs older than the window: in `total` (and in the unfiltered list) but not
                    // in pending/overdue, so total = completed + pending + olderOpen always adds up.
                    olderOpen: sql<number>`SUM(CASE WHEN (${completionCondition("OPEN")}) AND NOT ${inWindow} THEN 1 ELSE 0 END)`,
                    // Runs generated since org-local midnight (not CURDATE(), which is the DB
                    // session's zone). For the dashboard and the sidebar badge breakdown.
                    newToday: sql<number>`SUM(CASE WHEN ${checklistInstances.generatedAt} >= ${utcSql(orgDayStartUtc(now))} THEN 1 ELSE 0 END)`,
                }).from(checklistInstances).where(built)

                const [items] = await db.select({
                    totalItems: sql<number>`COUNT(*)`,
                    doneItems: sql<number>`SUM(CASE WHEN ${checklistInstanceItems.isDone} THEN 1 ELSE 0 END)`,
                })
                    .from(checklistInstanceItems)
                    .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                    .where(built)

                const pending = Number(counts?.pending ?? 0)
                const overdue = Number(counts?.overdue ?? 0)
                return {
                    total: Number(counts?.total ?? 0),
                    completed: Number(counts?.completed ?? 0),
                    pending,
                    // On-track subset of `pending` — incomplete but not yet past its deadline.
                    // No extra query: every pending run is either overdue or due.
                    due: pending - overdue,
                    overdue,
                    olderOpen: Number(counts?.olderOpen ?? 0),
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
    async auditHistory(user: AccessTokenPayload, filter: { from?: string; to?: string; storeId?: string; personId?: string; page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        const conditions = [eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr]
        if (filter.personId) conditions.push(eq(checklistInstanceItemSubmissions.userId, filter.personId))
        if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
        // Same day-based from/to reading as the instance list (see instanceConditions).
        if (filter.from) conditions.push(gte(checklistInstances.periodStart, dayStartUtc(asOrgDay(filter.from))))
        if (filter.to) conditions.push(lt(checklistInstances.periodStart, dayStartUtc(addDays(asOrgDay(filter.to), 1))))
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
            personIsActive: users.isActive,
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

    /**
     * Former people: everyone deactivated, with what their checklist history looks like, so it can
     * be found after they have left. Admin / PC only (the route enforces it). `leftAt` is when the
     * account was deactivated (users.deactivatedAt), else the offboarding audit date, else when the
     * account was last touched. The counts leave out runs of soft-deleted checklists, exactly like the
     * Runs and Audits tabs they open (parentNotDeletedExpr), so a tile and its tab agree.
     */
    async formerPeople() {
        const people = await db.select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            departmentName: departments.name,
            storeName: stores.name,
            updatedAt: users.updatedAt,
            deactivatedAt: users.deactivatedAt,
        })
            .from(users)
            .leftJoin(departments, eq(departments.id, users.departmentId))
            .leftJoin(stores, eq(stores.id, users.storeId))
            .where(eq(users.isActive, false))
        if (!people.length) return []
        const ids = people.map((p) => p.id)

        const [worked, assigned, audited, left] = await Promise.all([
            db.select({ userId: checklistInstanceItems.completedBy, n: sql<number>`COUNT(DISTINCT ${checklistInstanceItems.instanceId})` })
                .from(checklistInstanceItems)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                .where(and(inArray(checklistInstanceItems.completedBy, ids), parentNotDeletedExpr))
                .groupBy(checklistInstanceItems.completedBy),
            db.select({ userId: checklistInstanceAssignees.userId, n: sql<number>`COUNT(DISTINCT ${checklistInstanceAssignees.instanceId})` })
                .from(checklistInstanceAssignees)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
                .where(and(inArray(checklistInstanceAssignees.userId, ids), parentNotDeletedExpr))
                .groupBy(checklistInstanceAssignees.userId),
            db.select({ userId: checklistInstanceItemSubmissions.userId, n: sql<number>`COUNT(*)` })
                .from(checklistInstanceItemSubmissions)
                .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
                .where(and(inArray(checklistInstanceItemSubmissions.userId, ids), eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr))
                .groupBy(checklistInstanceItemSubmissions.userId),
            db.select({ userId: auditLogs.entityId, at: sql<Date>`MAX(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt) })
                .from(auditLogs).where(and(eq(auditLogs.entityType, "User"), eq(auditLogs.action, "OFFBOARD"), inArray(auditLogs.entityId, ids)))
                .groupBy(auditLogs.entityId),
        ])
        const count = (rows: { userId: string | null; n: number }[]) => new Map(rows.map((r) => [r.userId, Number(r.n)]))
        const workedBy = count(worked), assignedBy = count(assigned), auditedBy = count(audited)
        const leftBy = new Map(left.map((r) => [r.userId, r.at]))

        return people.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            role: p.role,
            departmentName: p.departmentName,
            storeName: p.storeName,
            leftAt: p.deactivatedAt ?? leftBy.get(p.id) ?? p.updatedAt,
            runsAssigned: assignedBy.get(p.id) ?? 0,
            runsWorked: workedBy.get(p.id) ?? 0,
            auditsOnThem: auditedBy.get(p.id) ?? 0,
        })).sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime())
    },

    /**
     * Just who the former people are (`{ id, firstName, lastName, email }[]`), for resolving "(left)"
     * names on screens that don't need the footprint counts. Same scope as formerPeople (the route is
     * ADMIN/PC): every deactivated account.
     */
    async formerPeopleNames() {
        return db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(eq(users.isActive, false))
            .orderBy(asc(users.firstName), asc(users.lastName))
    },

    /** One former (or current) person's checklist runs: ones they were assigned or that they completed items on. */
    async personRuns(personId: string, filter: { page?: number; limit?: number }) {
        const p = paginate(filter.page, filter.limit)
        // Two `id IN (subquery)` branches (each one an index lookup on the junction/item table) instead of
        // two correlated EXISTS ORed together, which the planner ran as a scan over every instance.
        const mine = sql`(
            ${checklistInstances.id} IN (SELECT a.instanceId FROM ${checklistInstanceAssignees} a WHERE a.userId = ${personId})
            OR ${checklistInstances.id} IN (SELECT i.instanceId FROM ${checklistInstanceItems} i WHERE i.completedBy = ${personId})
        )`
        const where = and(mine, parentNotDeletedExpr)

        const [countRow] = await db.select({ n: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
        const total = Number(countRow?.n ?? 0)

        const rows = await db.select({
            id: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            periodStart: checklistInstances.periodStart,
            verificationStatus: checklistInstances.verificationStatus,
            total: sql<number>`COUNT(${checklistInstanceItems.id})`,
            done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
            theirs: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstanceItems.completedBy} = ${personId} THEN 1 ELSE 0 END), 0)`,
        })
            .from(checklistInstances)
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
            .where(where)
            .groupBy(checklistInstances.id, checklistInstances.title, stores.name, checklistInstances.periodStart, checklistInstances.verificationStatus)
            .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
            .limit(p.limit).offset(p.offset)

        return {
            data: rows.map((r) => ({ ...r, total: Number(r.total), done: Number(r.done), theirs: Number(r.theirs) })),
            meta: buildMeta(p, total),
        }
    },

    /**
     * Weekly fill report: one row per daily checklist per store, one cell per weekday (Mon-Sun).
     * A cell is how a day's run went: done on time, done late, missed (past its cutoff and not
     * filled), still open, a holiday, or no run (day off / not yet). Counts only, no hydration.
     * ADMIN/PC see every store; MANAGER/SENIOR only runs whose assignees sit in their department.
     * The week rate is runs filled on time / runs that were due, so open, off and holiday days
     * never pull it down. `weekStart` is the Monday, as an org-local YYYY-MM-DD.
     */
    async weeklyReport(user: AccessTokenPayload, weekStart: string, storeId?: string) {
        const startMs = Date.parse(`${weekStart}T00:00:00.000Z`)
        const days = Array.from({ length: 7 }, (_, i) => new Date(startMs + i * 86_400_000).toISOString().slice(0, 10))
        const empty = { weekStart, days, holidays: {} as Record<string, string>, rows: [], summary: { due: 0, onTime: 0, late: 0, missed: 0, rate: null as number | null } }

        const conditions = [
            eq(checklistInstances.recurrence, "DAILY"),
            gte(checklistInstances.periodStart, new Date(startMs)),
            lte(checklistInstances.periodStart, new Date(startMs + 6 * 86_400_000)),
            parentNotDeletedExpr,
        ]
        if (storeId) conditions.push(eq(checklistInstances.storeId, storeId))
        if (user.role !== "ADMIN" && user.role !== "PC") {
            if (!isHod(user) || !user.departmentId) return empty
            conditions.push(instanceInDepartmentCondition(user.departmentId))
        }

        const runs = await db.select({
            id: checklistInstances.id,
            definitionId: checklistInstances.definitionId,
            title: checklistInstances.title,
            storeId: checklistInstances.storeId,
            scopeKey: checklistInstances.scopeKey,
            periodStart: checklistInstances.periodStart,
            periodEnd: checklistInstances.periodEnd,
            cutoffTime: checklistInstances.cutoffTime,
            opensTime: checklistInstances.opensTime,
            total: sql<number>`COUNT(${checklistInstanceItems.id})`,
            done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
            lastDoneAt: sql<Date | null>`MAX(${checklistInstanceItems.completedAt})`.mapWith(checklistInstanceItems.completedAt),
        })
            .from(checklistInstances)
            .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
            .where(and(...conditions))
            .groupBy(
                checklistInstances.id, checklistInstances.definitionId, checklistInstances.title, checklistInstances.storeId, checklistInstances.scopeKey,
                checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime,
            )
        if (!runs.length) return empty

        const holidayRows = await db.select({ date: holidays.date, name: holidays.name }).from(holidays).where(inArray(holidays.date, days))
        const holidayByDate = Object.fromEntries(holidayRows.map((h) => [h.date, h.name]))
        const storeIds = [...new Set(runs.map((r) => r.storeId))]
        const storeNames = new Map((await db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds))).map((s) => [s.id, s.name]))

        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const now = Date.now()
        const today = new Date(now + offsetMs).toISOString().slice(0, 10)
        // periodStart is the org-local day written as UTC midnight, so "day + cutoff" minus the org's
        // offset is the real instant it's due. No cutoff = the end of that day. An overnight window
        // (cutoff clock time earlier than opens, e.g. opens 22:00, cutoff 06:00) is due the NEXT day:
        // the same rule as deadlineExpr and the trend SQL, so the run isn't missed/late before it opens.
        const deadlineOf = (r: { periodStart: Date; periodEnd: Date; cutoffTime: string | null; opensTime: string | null }) => {
            if (!r.cutoffTime) return r.periodEnd.getTime() - offsetMs
            const [h, m] = r.cutoffTime.split(":").map(Number)
            const dayRoll = r.opensTime && r.cutoffTime < r.opensTime ? 24 * 60 : 0
            return r.periodStart.getTime() + (h * 60 + m + dayRoll) * 60_000 - offsetMs
        }

        type CellState = "done" | "late" | "missed" | "open" | "holiday" | "off" | "upcoming"
        const grouped = new Map<string, { definitionId: string; scopeKey: string; name: string; storeId: string; byDay: Map<string, typeof runs[number]> }>()
        for (const r of runs) {
            // A per-person / per-department checklist has one row per person / department (its title
            // already says who), a shared one has a single row per store.
            const key = `${r.definitionId}|${r.storeId}|${r.scopeKey}`
            const g = grouped.get(key) ?? { definitionId: r.definitionId, scopeKey: r.scopeKey, name: r.title, storeId: r.storeId, byDay: new Map() }
            g.byDay.set(r.periodStart.toISOString().slice(0, 10), r)
            g.name = r.title
            grouped.set(key, g)
        }

        const totals = { due: 0, onTime: 0, late: 0, missed: 0 }
        const rows = [...grouped.values()].map((g) => {
            let due = 0, onTime = 0
            const cells = days.map((date) => {
                const r = g.byDay.get(date)
                if (!r) {
                    const state: CellState = holidayByDate[date] ? "holiday" : date > today ? "upcoming" : "off"
                    return { date, state, runId: null as string | null, done: 0, total: 0 }
                }
                const total = Number(r.total), done = Number(r.done)
                const complete = total > 0 && done === total
                const deadline = deadlineOf(r)
                let state: CellState
                if (complete) state = r.lastDoneAt && r.lastDoneAt.getTime() > deadline ? "late" : "done"
                else state = now > deadline ? "missed" : "open"
                if (state === "done" || state === "late" || state === "missed") due++
                if (state === "done") onTime++
                if (state === "done") totals.onTime++
                else if (state === "late") totals.late++
                else if (state === "missed") totals.missed++
                return { date, state, runId: r.id, done, total }
            })
            totals.due += due
            return {
                definitionId: g.definitionId,
                scopeKey: g.scopeKey,
                name: g.name,
                storeId: g.storeId,
                storeName: storeNames.get(g.storeId) ?? "Store",
                cells,
                rate: due ? Math.round((onTime / due) * 100) : null,
            }
        }).sort((a, b) => a.name.localeCompare(b.name) || a.storeName.localeCompare(b.storeName))

        return {
            weekStart,
            days,
            holidays: holidayByDate,
            rows,
            summary: { ...totals, rate: totals.due ? Math.round((totals.onTime / totals.due) * 100) : null },
        }
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
        await assertRunNotMissed(instanceRow.id, user)

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
        // Completing a question again answers whatever the reviewer sent it back for.
        if (isDone) patch.sendBackNote = null

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

        await dropChecklistSummaries(assigneeIds)
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
        const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]

        // ADMIN/PC see everything; everyone else is scoped (pendingApprovalScope).
        const scope = pendingApprovalScope(user)
        if (scope) conditions.push(scope)

        const where = and(...conditions)
        const total = await countInstances(where)
        const instanceRows = await db.select().from(checklistInstances)
            .where(where)
            .orderBy(desc(checklistInstances.periodStart))
            .limit(p.limit).offset(p.offset)
        return { data: await hydrateInstances(instanceRows), meta: buildMeta(p, total) }
    },

    // Dashboard's "Needs your approval" card. Same scope as the Verification queue above
    // (pendingApprovalScope): ADMIN/PC every store, MANAGER/SENIOR runs with an assignee in their own
    // department, and anyone named a reviewer on a run. Excludes a deleted checklist's leftover queue
    // now, same reasoning as listPendingVerification just above — this card is framed as "here's
    // what to go act on," and a deleted checklist has nothing left to act on. Oldest-waiting-first
    // via `updatedAt` directly — no second query needed here, unlike Ticket/Task: there's no generic
    // "edit any field" endpoint for an instance that could drift it, syncVerificationStatus only
    // touches it exactly when the status flips into or out of PENDING_APPROVAL, so it's a
    // trustworthy "entered approval at" timestamp as-is (see that method's own comment near the top
    // of this file).
    //
    // `meta.total` is the real number waiting (COUNT over the same scope), because the card shows at
    // most `limit` rows and its badge used to count those rows instead.
    async pendingApprovalPreview(user: AccessTokenPayload, limit = 8): Promise<{ data: ChecklistPendingApprovalRow[]; meta: { total: number } }> {
        const conditions: SQL[] = [eq(checklistInstances.verificationStatus, "PENDING_APPROVAL"), parentNotDeletedExpr]
        const scope = pendingApprovalScope(user)
        if (scope) conditions.push(scope)
        const where = and(...conditions)

        const [total, rows] = await Promise.all([
            countInstances(where),
            db.select({
                id: checklistInstances.id,
                title: checklistInstances.title,
                storeName: stores.name,
                updatedAt: checklistInstances.updatedAt,
            })
                .from(checklistInstances)
                .leftJoin(stores, eq(checklistInstances.storeId, stores.id))
                .where(where)
                .orderBy(asc(checklistInstances.updatedAt))
                .limit(limit),
        ])

        return {
            data: rows.map((r) => ({
                id: r.id,
                title: r.title,
                storeName: r.storeName ?? null,
                waitingSince: r.updatedAt.toISOString(),
            })),
            meta: { total },
        }
    },

    /**
     * Submit a finished checklist for review. The person who filled it in (any assignee, or an
     * ADMIN/PC) presses Submit once every question is done: the run moves to "waiting for approval"
     * and the store's PCs are told. Also how a run that was sent back is resubmitted after the
     * flagged questions are fixed.
     */
    async submit(id: string, user: AccessTokenPayload) {
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
        const assigneeIds = assigneeLinks.map((l) => l.userId)
        assertCanAccess({ assigneeIds }, user)

        await assertRunNotMissed(id, user)
        if (instance.verificationStatus !== "NOT_SUBMITTED" && instance.verificationStatus !== "REJECTED") {
            throw AppError.badRequest(instance.verificationStatus === "APPROVED" ? "This checklist is already approved." : "This checklist has already been submitted.")
        }
        const items = await db.select({ isDone: checklistInstanceItems.isDone }).from(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, id))
        const open = items.filter((i) => !i.isDone).length
        if (!items.length || open > 0) {
            throw AppError.badRequest(open === 1 ? "1 question is still open. Finish it, then submit." : `${open} questions are still open. Finish them, then submit.`)
        }

        const now = new Date()
        await db.update(checklistInstances)
            .set({ verificationStatus: "PENDING_APPROVAL", submittedAt: now, submittedBy: user.sub, approvalReminderSentAt: null, approvalEscalatedAt: null, updatedAt: now })
            .where(eq(checklistInstances.id, id))

        notificationService
            .notifyChecklistPendingVerification({ _id: instance.id, title: instance.title, storeId: instance.storeId, assigneeIds })
            .catch((err) => console.error("Failed to notify PC of pending checklist:", err))
        await auditService.record({
            entityType: "ChecklistInstance", entityId: id, action: "SUBMIT", actorId: user.sub,
            before: { verificationStatus: instance.verificationStatus },
            after: { verificationStatus: "PENDING_APPROVAL", submittedAt: now },
        })
        await dropChecklistSummaries(assigneeIds)
        emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
        return getPopulatedInstanceById(id)
    },

    /**
     * Send back only the questions that weren't done properly, instead of the whole checklist. The
     * reviewer (same people who can approve: ADMIN/PC, the department's MANAGER/SENIOR, a named
     * reviewer) picks the questions and says what to fix. Only those reopen, for whoever fills the
     * checklist in; an audit question reopens all its people. Everything else stays done, the run goes
     * back to "sent back" and returns to review once the reopened questions are completed again
     * (syncVerificationStatus). A reviewer action, so it bypasses the "only an admin can reopen" rule.
     */
    async sendBack(id: string, input: { itemIds: string[]; note: string }, user: AccessTokenPayload) {
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        if (instance.verificationStatus !== "PENDING_APPROVAL") {
            throw AppError.badRequest("Only a checklist that's waiting for approval can have questions sent back.")
        }

        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
        const assigneeDepartmentIds = await getDepartmentIdsForUserIds(assigneeLinks.map((l) => l.userId))
        const reviewerLinks = await db.select({ userId: checklistInstanceReviewers.userId }).from(checklistInstanceReviewers).where(eq(checklistInstanceReviewers.instanceId, id))
        assertCanVerify(assigneeDepartmentIds, reviewerLinks.map((l) => l.userId), user)

        const wanted = [...new Set(input.itemIds)]
        const items = await db.select().from(checklistInstanceItems)
            .where(and(eq(checklistInstanceItems.instanceId, id), inArray(checklistInstanceItems.id, wanted)))
        if (items.length !== wanted.length) throw AppError.badRequest("Some of those questions aren't on this checklist.")

        const now = new Date()
        const note = input.note.trim()
        await db.transaction(async (tx) => {
            // Each send-back is a failed check for compliance (see the compliance report): the count
            // stays even after the question is redone well. `sentBackFrom` remembers who had done it,
            // so the failure lands on them in the person report. Two statements on purpose: the person
            // has to be read before completedBy is cleared, and the order of SET clauses within one
            // statement is not something to rely on.
            await tx.update(checklistInstanceItems).set({
                sendBackCount: sql`${checklistInstanceItems.sendBackCount} + 1`,
                sentBackFrom: sql`COALESCE(${checklistInstanceItems.completedBy}, ${checklistInstanceItems.sentBackFrom})`,
            }).where(inArray(checklistInstanceItems.id, wanted))
            await tx.update(checklistInstanceItems).set({
                isDone: false, isNotApplicable: false, completedAt: null, completedBy: null, sendBackNote: note, updatedAt: now,
            }).where(inArray(checklistInstanceItems.id, wanted))
            const auditItemIds = items.filter((i) => i.itemType === "AUDIT").map((i) => i.id)
            if (auditItemIds.length) {
                await tx.update(checklistInstanceItemSubmissions).set({ isDone: false, isNotApplicable: false, completedAt: null, updatedAt: now })
                    .where(inArray(checklistInstanceItemSubmissions.itemId, auditItemIds))
            }
            await tx.update(checklistInstances).set({
                verificationStatus: "REJECTED",
                verificationNote: note,
                approvalReminderSentAt: null,
                approvalEscalatedAt: null,
                rejectionCount: sql`${checklistInstances.rejectionCount} + 1`,
                updatedAt: now,
            }).where(eq(checklistInstances.id, id))
        })

        const labels = items.map((i) => i.label).join(", ")
        notificationService
            .notifyChecklistVerificationResult({ _id: instance.id, title: instance.title, assigneeIds: assigneeLinks.map((l) => l.userId) }, "REJECT", `${labels}: ${note}`)
            .catch((err) => console.error("Failed to notify checklist send-back:", err))
        await auditService.record({
            entityType: "ChecklistInstance", entityId: id, action: "SEND_BACK", actorId: user.sub,
            before: { verificationStatus: instance.verificationStatus },
            after: { verificationStatus: "REJECTED", sentBackItemIds: wanted, note },
        })
        await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
        emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
        return getPopulatedInstanceById(id)
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
                approvalReminderSentAt: null,
                approvalEscalatedAt: null,
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
                    approvalReminderSentAt: null,
                    approvalEscalatedAt: null,
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

        await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
        const result = await getPopulatedInstanceById(id)
        emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
        return result!
    },

    /**
     * ADMIN only: puts an APPROVED run back in the review queue (PENDING_APPROVAL) and clears who
     * approved it and their note, for the case where an approval was a mistake. Audit-logged.
     */
    async reopenApproval(id: string, user: AccessTokenPayload) {
        if (user.role !== "ADMIN") throw AppError.forbidden("Only an admin can reopen an approval.")
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.id, id)).limit(1)
        if (!instance) throw AppError.notFound("Checklist instance not found")
        if (instance.verificationStatus !== "APPROVED") {
            throw AppError.badRequest("Only an approved checklist can be reopened for approval.")
        }

        const now = new Date()
        await db.update(checklistInstances).set({
            verificationStatus: "PENDING_APPROVAL",
            verifiedBy: null,
            verifiedAt: null,
            verificationNote: null,
            approvalReminderSentAt: null,
            approvalEscalatedAt: null,
            updatedAt: now,
        }).where(and(eq(checklistInstances.id, id), eq(checklistInstances.verificationStatus, "APPROVED")))

        await auditService.record({
            entityType: "ChecklistInstance", entityId: id, action: "REOPEN_APPROVAL", actorId: user.sub,
            before: { verificationStatus: instance.verificationStatus, verifiedBy: instance.verifiedBy, verifiedAt: instance.verifiedAt, verificationNote: instance.verificationNote },
            after: { verificationStatus: "PENDING_APPROVAL" },
        })
        const assigneeLinks = await db.select({ userId: checklistInstanceAssignees.userId }).from(checklistInstanceAssignees).where(eq(checklistInstanceAssignees.instanceId, id))
        await dropChecklistSummaries(assigneeLinks.map((l) => l.userId))
        emitChecklistEvent("checklist-instance:updated", { storeId: instance.storeId }, { instanceId: id })
        return getPopulatedInstanceById(id)
    },

    /**
     * Decisions feed: who submitted, approved, rejected or sent back which run, newest first, read
     * from the audit trail. Default window is today (org-local). ADMIN/PC see every run; MANAGER/
     * SENIOR only runs with an assignee in their own department, and nothing when they have no
     * department. A run that no longer exists (or belongs to a deleted checklist) is skipped.
     */
    async decisions(user: AccessTokenPayload, query: { from?: string; to?: string; limit?: number } = {}): Promise<ChecklistDecision[]> {
        const orgWide = user.role === "ADMIN" || user.role === "PC"
        if (!orgWide && (!isHod(user) || !user.departmentId)) return []

        const limit = Math.min(DECISIONS_MAX, Math.max(1, Math.trunc(query.limit ?? DECISIONS_MAX) || DECISIONS_MAX))
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        // A plain YYYY-MM-DD is an org-local day: it starts at local midnight (minus the offset to get
        // the real instant). `to` as a plain day includes that whole day. An ISO instant is used as is.
        const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
        const dayStart = (v: string) => Date.parse(`${v}T00:00:00.000Z`) - offsetMs
        const fromMs = query.from ? (isDay(query.from) ? dayStart(query.from) : Date.parse(query.from)) : dayStart(orgLocalDate(Date.now()))
        const toMs = query.to ? (isDay(query.to) ? dayStart(query.to) + 86_400_000 : Date.parse(query.to)) : null
        if (Number.isNaN(fromMs) || (toMs !== null && Number.isNaN(toMs))) throw AppError.badRequest("Use an ISO date or datetime.")

        const conditions = [
            eq(auditLogs.entityType, "ChecklistInstance"),
            inArray(auditLogs.action, [...DECISION_ACTIONS]),
            gte(auditLogs.createdAt, new Date(fromMs)),
            parentNotDeletedExpr,
        ]
        if (toMs !== null) conditions.push(lt(auditLogs.createdAt, new Date(toMs)))
        if (!orgWide) {
            // Same rule as instanceIdsForDepartment, as a subquery so a long history is not a giant id list.
            conditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a
                JOIN ${users} u ON u.id = a.userId
                WHERE a.instanceId = ${checklistInstances.id} AND u.departmentId = ${user.departmentId!}
            )`)
        }

        const rows = await db.select({
            id: auditLogs.id,
            instanceId: checklistInstances.id,
            title: checklistInstances.title,
            storeName: stores.name,
            action: auditLogs.action,
            at: auditLogs.createdAt,
            actorName: auditLogs.actorName,
            actorFirstName: users.firstName,
            actorLastName: users.lastName,
            after: auditLogs.after,
        })
            .from(auditLogs)
            .innerJoin(checklistInstances, eq(checklistInstances.id, auditLogs.entityId))
            .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
            .leftJoin(users, eq(users.id, auditLogs.actorId))
            .where(and(...conditions))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)

        return rows.map((r) => {
            let after: unknown = r.after
            if (typeof after === "string") {
                try { after = JSON.parse(after) } catch { after = null }
            }
            const a = (after && typeof after === "object" ? after : {}) as { note?: unknown; verificationNote?: unknown; sentBackItemIds?: unknown }
            const rawNote = r.action === "SEND_BACK" ? a.note : r.action === "SUBMIT" ? null : a.verificationNote
            const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : null
            return {
                id: r.id,
                instanceId: r.instanceId,
                title: r.title,
                storeName: r.storeName ?? null,
                action: r.action as ChecklistDecision["action"],
                at: r.at.toISOString(),
                actorName: r.actorName ?? (r.actorFirstName ? `${r.actorFirstName}${r.actorLastName ? ` ${r.actorLastName}` : ""}` : "Unknown"),
                note,
                itemCount: r.action === "SEND_BACK" && Array.isArray(a.sentBackItemIds) ? a.sentBackItemIds.length : null,
            }
        })
    },

    // GET /checklist-instances/reports/compliance. The SQL, the rules (due runs only, N/A left out,
    // compliance incl. reviewer send-backs) and the zero-filled bucket series live in
    // checklistReport.service.ts, shared with the by-store report. `scope` null = the caller may
    // see nothing (fails closed, see checklistReportScope.ts).
    async complianceReport(scope: ChecklistReportScope | null, query: ChecklistReportQuery) {
        return checklistReportService.complianceReport(scope, query)
    },

}
