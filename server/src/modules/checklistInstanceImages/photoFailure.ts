import { sql } from "drizzle-orm"
import { failingFlagsOf } from "../../utils/imageQuality.js"
import { AppError } from "../../utils/AppError.js"

export const PHOTO_REVIEW_REASONS = ["BLURRY", "TEXT_UNREADABLE", "CROPPED", "OTHER"] as const
export type PhotoReviewReason = (typeof PHOTO_REVIEW_REASONS)[number]

export const MAX_PASSING_PHOTOS = 25
export const MAX_FAILED_PHOTOS = 25

export const FAILED_PHOTO_DELETE_MESSAGE =
    "This photo did not pass the check, so it stays on record. Take a new, clear photo to replace it."

type PhotoState = { qualityFlags?: string | null; reviewStatus?: string | null }

export const isFailedPhoto = (image: PhotoState): boolean => {
    if (image.reviewStatus === "REJECTED") return true
    if (image.reviewStatus === "ACCEPTED") return false
    return failingFlagsOf(image.qualityFlags).length > 0
}

export const FAILED_PHOTO_SQL = (alias: string) => sql.raw(
    `(${alias}.reviewStatus = 'REJECTED' OR (${alias}.reviewStatus <> 'ACCEPTED' AND ${alias}.qualityFlags REGEXP 'BLURRY|TEXT_UNREADABLE|CROPPED'))`,
)

export const passingPhotos = <T extends PhotoState>(images: readonly T[]): T[] => images.filter((image) => !isFailedPhoto(image))

export const EARLIER_PHOTO_DELETE_MESSAGE =
    "This photo was there before the checklist was sent back, so it stays on record. Add a new photo alongside it."

type RoundItem = { sendBackNote?: string | null }
type RoundRun = { sentBackAt?: Date | null }

export const correctionRoundStart = (item: RoundItem, run: RoundRun): Date | null =>
    item.sendBackNote && run.sentBackAt ? run.sentBackAt : null

export const isEarlierRoundPhoto = (image: { createdAt: Date }, roundStart: Date | null): boolean =>
    !!roundStart && image.createdAt.getTime() <= roundStart.getTime()

export const photosInRound = <T extends { createdAt: Date }>(images: readonly T[], roundStart: Date | null): T[] =>
    roundStart ? images.filter((image) => !isEarlierRoundPhoto(image, roundStart)) : [...images]

export const photoRoomError = (existing: readonly PhotoState[], incoming: number, itemMax: number | null | undefined): string | null => {
    if (existing.filter(isFailedPhoto).length >= MAX_FAILED_PHOTOS) {
        return "Too many photos on this item did not pass the check. Ask your department head for help."
    }
    const passing = passingPhotos(existing).length
    const limit = itemMax != null ? Math.min(itemMax, MAX_PASSING_PHOTOS) : MAX_PASSING_PHOTOS
    if (passing + incoming <= limit) return null
    const remaining = Math.max(limit - passing, 0)
    return remaining > 0
        ? `This item allows at most ${limit} clear photo(s). Only ${remaining} more can be uploaded.`
        : `This item already has the maximum of ${limit} clear photo(s).`
}

export const assertPhotoRoom = (existing: readonly PhotoState[], incoming: number, itemMax: number | null | undefined) => {
    const message = photoRoomError(existing, incoming, itemMax)
    if (message) throw AppError.badRequest(message)
}
