import { AppError } from "../../utils/AppError.js"

export const NO_EMAIL = "Email is not set up on the server, so sign-in codes cannot be sent. Add the mail settings first."
export const NO_PROOF = "Send yourself a test code and enter it before turning this on."

type Change = { requireAdminLoginCode?: boolean; loginCodeProof?: string }

export const turningLoginCodeOn = (change: Change, current: { requireAdminLoginCode: boolean }): boolean =>
    change.requireAdminLoginCode === true && !current.requireAdminLoginCode

export const assertLoginCodeChangeAllowed = (change: Change, current: { requireAdminLoginCode: boolean }, emailConfigured: boolean): void => {
    if (!turningLoginCodeOn(change, current)) return
    if (!emailConfigured) throw AppError.badRequest(NO_EMAIL)
    if (!change.loginCodeProof) throw AppError.badRequest(NO_PROOF)
}
