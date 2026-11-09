import { AppError } from "../../utils/AppError.js"
import { driverError, isDuplicateEntryError } from "../../utils/dbErrors.js"
import { PHONE_TAKEN_MESSAGE } from "./phone.js"

export const mapDuplicateUserError = (err: unknown): unknown => {
    if (!isDuplicateEntryError(err)) return err
    const message = driverError(err).message
    if (message.includes("User_phone_key")) return AppError.conflict(PHONE_TAKEN_MESSAGE)
    if (message.includes("User_employeeId_key")) return AppError.conflict("That employee ID is already used by someone else.")
    return AppError.conflict("Email already registered")
}
