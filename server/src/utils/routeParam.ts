import type { Request } from "express"
import { AppError } from "./AppError.js"

export const routeParam = (req: Request, name: string): string => {
    const raw = req.params[name]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (!value) throw AppError.badRequest(`The ${name} is missing from the address.`)
    return value
}
