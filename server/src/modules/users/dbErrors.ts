import { AppError } from "../../utils/AppError.js"
import { driverError, isDuplicateEntryError } from "../../utils/dbErrors.js"
import { PHONE_TAKEN_MESSAGE } from "./phone.js"

export const mapDuplicateUserError = (err: unknown): unknown => {
    if (!isDuplicateEntryError(err)) return err
    return driverError(err).message.includes("User_phone_key")
        ? AppError.conflict(PHONE_TAKEN_MESSAGE)
        : AppError.conflict("Email already registered")
}
