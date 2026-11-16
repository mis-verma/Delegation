import { randomBytes } from "node:crypto"
import { z } from "zod"
import { db } from "../../config/db.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { mapLimit } from "../../utils/mapLimit.js"
import { passwordOtpService } from "../../middleware/auth/passwordOtp.service.js"
import { userService } from "./user.service.js"
import { emailSchema } from "./user.validation.js"
import { GENDERS } from "../../db/schema/core.js"
import { IMPORT_ROLES, USER_IMPORT_MAX_ROWS, readUserFile, type OrgLookup, type UserImportPreview } from "./userImport.js"

const PARALLEL = 3

export const importUsersSchema = z.object({
    sendSetupCode: z.boolean().optional(),
    users: z.array(z.object({
        rowIndex: z.number().int().min(1),
        email: emailSchema,
        firstName: z.string().trim().min(1).max(191),
        lastName: z.string().trim().max(191).nullable().optional(),
        role: z.enum(IMPORT_ROLES),
        departmentId: z.string().min(1).max(191).nullable().optional(),
        storeId: z.string().min(1).max(191).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        gender: z.enum(GENDERS).nullable().optional(),
    })).min(1).max(USER_IMPORT_MAX_ROWS),
})

export type ImportUsersInput = z.infer<typeof importUsersSchema>

export type ImportUsersResult = {
    created: number
    setupCodesSent: number
    failed: { rowIndex: number; email: string; reason: string }[]
}

const tempPassword = () => `${randomBytes(9).toString("base64url")}Aa1`

const loadLookup = async (): Promise<OrgLookup> => {
    const [deptRows, storeRows, emailRows] = await Promise.all([
        db.select({ id: departments.id, name: departments.name }).from(departments),
        db.select({ id: stores.id, name: stores.name }).from(stores),
        db.select({ email: users.email }).from(users),
    ])
    return { departments: deptRows, stores: storeRows, existingEmails: new Set(emailRows.map((r) => r.email.toLowerCase())) }
}

export const userImportService = {
    async preview(buffer: Buffer, mimetype: string): Promise<UserImportPreview & { departments: string[]; stores: string[] }> {
        const lookup = await loadLookup()
        const preview = await readUserFile(buffer, mimetype, lookup)
        return { ...preview, departments: lookup.departments.map((d) => d.name), stores: lookup.stores.map((s) => s.name) }
    },

    async importMany(input: ImportUsersInput, actorId: string): Promise<ImportUsersResult> {
        const emails = input.users.map((u) => u.email)
        if (new Set(emails).size !== emails.length) throw AppError.badRequest("Some emails appear more than once. Fix the file and try again.")

        const failed: ImportUsersResult["failed"] = []
        let created = 0
        let setupCodesSent = 0

        await mapLimit(input.users, PARALLEL, async (row) => {
            try {
                const user = await userService.create({
                    email: row.email,
                    password: tempPassword(),
                    firstName: row.firstName,
                    lastName: row.lastName ?? null,
                    role: row.role,
                    departmentId: row.departmentId ?? undefined,
                    storeId: row.storeId ?? undefined,
                    gender: row.gender ?? undefined,
                    phone: row.phone ? row.phone : undefined,
                } as Parameters<typeof userService.create>[0], actorId)
                created++
                if (input.sendSetupCode) {
                    try {
                        await passwordOtpService.sendSetupCode(user.id, actorId)
                        setupCodesSent++
                    } catch (err) {
                        console.error("[users] Setup code failed during import:", err)
                    }
                }
            } catch (err) {
                failed.push({ rowIndex: row.rowIndex, email: row.email, reason: err instanceof Error ? err.message : "Could not add this person" })
            }
        })

        failed.sort((a, b) => a.rowIndex - b.rowIndex)
        return { created, setupCodesSent, failed }
    },
}
