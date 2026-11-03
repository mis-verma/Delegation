import { sql } from "drizzle-orm"
import { failingFlagsOf } from "../../utils/imageQuality.js"

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
