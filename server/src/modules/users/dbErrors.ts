import { AppError } from "../../utils/AppError.js"
import { PHONE_TAKEN_MESSAGE } from "./phone.js"

const driverError = (err: unknown) => {
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null
    return { code: e?.cause?.code ?? e?.code, message: `${e?.cause?.message ?? ""} ${e?.message ?? ""}` }
}

export const isDuplicateEntryError = (err: unknown) => driverError(err).code === "ER_DUP_ENTRY"

export const mapDuplicateUserError = (err: unknown): unknown => {
    if (!isDuplicateEntryError(err)) return err
    return driverError(err).message.includes("User_phone_key")
        ? AppError.conflict(PHONE_TAKEN_MESSAGE)
        : AppError.conflict("Email already registered")
}
