import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceImages, checklistInstanceItems } from "../../db/schema/index.js"
import type { CHECKLIST_ITEM_TYPES } from "../../db/schema/checklistDefinition.js"
import { AppError } from "../../utils/AppError.js"
import { passingPhotos } from "../checklistInstanceImages/photoFailure.js"
import { conditionalPhotoPurposeFor } from "./booleanAnswerRules.js"

type PhotoRule = { requiredImageCount: number; requiresLivePhoto: boolean }
type PhotoRecord = { captureMethod?: string | null; reviewStatus?: string | null; qualityFlags?: string | null }

/**
 * How many more clear photos a question still owes. Zero means it is satisfied.
 *
 * Failed photos do not count, and a question that asks for live photos does not accept one from
 * the gallery. One rule, read both by the submit check and by the per-item check.
 */
export const photosStillOwed = (item: PhotoRule, images: readonly PhotoRecord[]): number => {
    if (item.requiredImageCount <= 0) return 0
    const clear = passingPhotos(images)
    const qualifying = item.requiresLivePhoto ? clear.filter((img) => img.captureMethod === "LIVE") : clear
    return Math.max(item.requiredImageCount - qualifying.length, 0)
}

/**
 * The questions on a run that still owe a mandatory photo.
 *
 * A photo no longer has to arrive with the answer, so someone can walk the floor saying yes and
 * come back to the camera afterwards. The requirement has not gone away, it is checked once at
 * submit instead, and this is what that check reads.
 *
 * Two queries and one pass over the images, so it stays linear in the size of the run.
 */
export const missingPhotoQuestions = async (instanceId: string): Promise<string[]> => {
    const items = await db
        .select({
            id: checklistInstanceItems.id,
            label: checklistInstanceItems.label,
            order: checklistInstanceItems.order,
            requiredImageCount: checklistInstanceItems.requiredImageCount,
            requiresLivePhoto: checklistInstanceItems.requiresLivePhoto,
        })
        .from(checklistInstanceItems)
        .where(and(
            eq(checklistInstanceItems.instanceId, instanceId),
            gt(checklistInstanceItems.requiredImageCount, 0),
            eq(checklistInstanceItems.isNotApplicable, false),
            isNull(checklistInstanceItems.waivedAt),
            ne(checklistInstanceItems.itemType, "AUDIT"),
        ))
    if (items.length === 0) return []

    const images = await db
        .select()
        .from(checklistInstanceImages)
        .where(and(
            inArray(checklistInstanceImages.checklistInstanceItemId, items.map((i) => i.id)),
            eq(checklistInstanceImages.purpose, "GENERAL"),
        ))

    const byItem = new Map<string, typeof images>()
    for (const image of images) {
        const itemId = image.checklistInstanceItemId
        if (!itemId) continue
        const list = byItem.get(itemId)
        if (list) list.push(image)
        else byItem.set(itemId, [image])
    }

    return items
        .filter((item) => photosStillOwed(item, byItem.get(item.id) ?? []) > 0)
        .sort((a, b) => a.order - b.order)
        .map((item) => item.label)
}

type ConditionalPhotoRule = { booleanAnswer: "YES" | "NO" | null; yesActions: string[] | null; noActions: string[] | null; requiresLivePhoto: boolean }

/**
 * Whether a Yes/No answer still owes the photo its own rule required.
 *
 * A photo rule on No also binds Yes, so a person can't dodge it by picking the answer nobody
 * configured a rule for. Mirrors photosStillOwed's shape: one pure check, read by both the
 * per-item save and the submit check.
 */
export const conditionalPhotoOwed = (item: ConditionalPhotoRule, images: readonly PhotoRecord[]): boolean => {
    const answer = item.booleanAnswer
    if (answer !== "YES" && answer !== "NO") return false
    const actions = answer === "YES" ? item.yesActions ?? [] : item.noActions ?? []
    const photoRequiredAnyway = answer === "YES" && (item.noActions ?? []).includes("REQUIRE_PHOTO")
    if (!actions.includes("REQUIRE_PHOTO") && !photoRequiredAnyway) return false
    const clear = passingPhotos(images)
    const qualifying = item.requiresLivePhoto ? clear.filter((img) => img.captureMethod === "LIVE") : clear
    return qualifying.length < 1
}

/**
 * The Yes/No questions on a run that still owe the photo their answer required.
 *
 * Same deferred-to-submit shape as missingPhotoQuestions: the photo doesn't have to arrive with
 * the tap, only before the run goes in.
 */
export const missingConditionalPhotoQuestions = async (instanceId: string): Promise<string[]> => {
    const items = await db
        .select({
            id: checklistInstanceItems.id,
            label: checklistInstanceItems.label,
            order: checklistInstanceItems.order,
            booleanAnswer: checklistInstanceItems.booleanAnswer,
            yesActions: checklistInstanceItems.yesActions,
            noActions: checklistInstanceItems.noActions,
            requiresLivePhoto: checklistInstanceItems.requiresLivePhoto,
        })
        .from(checklistInstanceItems)
        .where(and(
            eq(checklistInstanceItems.instanceId, instanceId),
            inArray(checklistInstanceItems.itemType, ["YES_NO", "PASS_FAIL"]),
            eq(checklistInstanceItems.isDone, true),
            eq(checklistInstanceItems.isNotApplicable, false),
            isNull(checklistInstanceItems.waivedAt),
        ))
    if (items.length === 0) return []

    const images = await db
        .select()
        .from(checklistInstanceImages)
        .where(inArray(checklistInstanceImages.checklistInstanceItemId, items.map((i) => i.id)))

    const byItem = new Map<string, typeof images>()
    for (const image of images) {
        const itemId = image.checklistInstanceItemId
        if (!itemId) continue
        const list = byItem.get(itemId)
        if (list) list.push(image)
        else byItem.set(itemId, [image])
    }

    return items
        .filter((item) => {
            const purpose = conditionalPhotoPurposeFor(item.booleanAnswer as "YES" | "NO")
            const relevant = (byItem.get(item.id) ?? []).filter((img) => img.purpose === purpose)
            return conditionalPhotoOwed(item, relevant)
        })
        .sort((a, b) => a.order - b.order)
        .map((item) => item.label)
}

export const assertPhotosSatisfied = async (item: ChecklistItem) => {
    if (item.requiredImageCount <= 0) return
    const images = await db.select().from(checklistInstanceImages).where(and(eq(checklistInstanceImages.checklistInstanceItemId, item.id), eq(checklistInstanceImages.purpose, "GENERAL")))
    const missing = photosStillOwed(item, images)
    if (missing > 0) {
        const kind = item.requiresLivePhoto ? "live photo(s)" : "photo(s)"
        throw AppError.badRequest(`Upload ${missing} more ${kind} before this item can be marked complete`)
    }
}

export const assertNumberEntrySatisfied = (item: ChecklistItem, numericValue: number | undefined) => {
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

export const assertRatingSatisfied = (item: ChecklistItem, numericValue: number | undefined) => {
    const scale = item.ratingScale ?? 5
    if (numericValue == null || Number.isNaN(numericValue) || !Number.isInteger(numericValue)) {
        throw AppError.badRequest("Pick a rating before this item can be marked complete")
    }
    if (numericValue < 1 || numericValue > scale) {
        throw AppError.badRequest(`Rating must be between 1 and ${scale}`)
    }
}

export const assertBooleanAnswerSatisfied = (booleanAnswer: "YES" | "NO" | undefined) => {
    if (booleanAnswer !== "YES" && booleanAnswer !== "NO") {
        throw AppError.badRequest("Choose an answer before this item can be marked complete")
    }
}

export const assertOptionSatisfied = (item: ChecklistItem, textValue: string | undefined) => {
    if (!textValue || !(item.options ?? []).includes(textValue)) {
        throw AppError.badRequest("Choose one of the listed options before this item can be marked complete")
    }
}

export const assertTextSatisfied = (textValue: string | undefined) => {
    if (!textValue?.trim()) {
        throw AppError.badRequest("Enter an answer before this item can be marked complete")
    }
}

export const assertDateSatisfied = (dateValue: string | undefined) => {
    if (!dateValue || Number.isNaN(new Date(dateValue).getTime())) {
        throw AppError.badRequest("Pick a date before this item can be marked complete")
    }
}

export const EARTH_RADIUS_METERS = 6371000
export const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export const assertGpsSatisfied = (item: ChecklistItem, lat: number | undefined, lng: number | undefined) => {
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

export const assertQrSatisfied = (item: ChecklistItem, textValue: string | undefined) => {
    if (!textValue?.trim()) {
        throw AppError.badRequest("Scan a code before this item can be marked complete")
    }
    if (item.qrExpectedValue && textValue.trim() !== item.qrExpectedValue) {
        throw AppError.badRequest("Scanned code doesn't match the expected code")
    }
}

export const assertSignatureSatisfied = (signatureValue: string | undefined) => {
    if (!signatureValue) {
        throw AppError.badRequest("Add a signature before this item can be marked complete")
    }
}

export const assertDualSignatureSatisfied = (signatureValue: string | undefined, secondSignatureValue: string | undefined) => {
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
    remarks?: string | null
    notApplicable?: boolean
}

export type ChecklistItem = typeof checklistInstanceItems.$inferSelect

export type ItemValueValidator = (item: ChecklistItem, values: ItemValueInput) => void

export const VALUE_VALIDATORS_BY_ITEM_TYPE: Record<(typeof CHECKLIST_ITEM_TYPES)[number], ItemValueValidator | null> = {
    STANDARD: null,
    AUDIT: null,
    VIDEO_UPLOAD: null,
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
        if (item.cashExpectedAmount != null && v.numericValue !== item.cashExpectedAmount && !v.conditionalReasonValue?.trim()) {
            const diff = (v.numericValue ?? 0) - item.cashExpectedAmount
            throw AppError.badRequest(`Count is ${diff < 0 ? "short" : "over"} by ${Math.abs(diff)}. Add a reason before saving`)
        }
    },
    SIGNATURE: (_item, v) => assertSignatureSatisfied(v.signatureValue),
    DUAL_SIGNATURE: (_item, v) => assertDualSignatureSatisfied(v.signatureValue, v.secondSignatureValue),
}
