import { AppError } from "../../utils/AppError.js"
import { PHONE_TAKEN_MESSAGE } from "./phone.js"

// Drizzle wraps the driver's error: the MySQL code and message sit on `.cause`.
const driverError = (err: unknown) => {
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null
    return { code: e?.cause?.code ?? e?.code, message: `${e?.cause?.message ?? ""} ${e?.message ?? ""}` }
}

export const isDuplicateEntryError = (err: unknown) => driverError(err).code === "ER_DUP_ENTRY"

// A unique-index race that slipped past the friendly pre-checks: turn it into the same clean 409
// instead of a masked 500. Anything else is returned untouched for the caller to rethrow.
export const mapDuplicateUserError = (err: unknown): unknown => {
    if (!isDuplicateEntryError(err)) return err
    return driverError(err).message.includes("User_phone_key")
        ? AppError.conflict(PHONE_TAKEN_MESSAGE)
        : AppError.conflict("Email already registered")
}
