import { and, asc, eq, isNull } from "drizzle-orm"
import { db } from "../../config/db.js"
import { settings, users } from "../../db/schema/core.js"
import { isDuplicateEntryError } from "../../utils/dbErrors.js"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/

export const normalizePrefix = (prefix: string | null | undefined): string => {
    const clean = (prefix ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    return clean || "EMP"
}

export const formatEmployeeId = (prefix: string | null | undefined, n: number): string =>
    `${normalizePrefix(prefix)}-${String(Math.max(1, Math.trunc(n))).padStart(4, "0")}`

const takeNextId = async (tx: Tx): Promise<string> => {
    const [row] = await tx.select({ id: settings.id, prefix: settings.employeeIdPrefix, next: settings.employeeIdNext })
        .from(settings).for("update").limit(1)
    if (!row) throw new Error("Settings row missing, cannot number employees")
    let n = Math.max(1, row.next)
    for (let guard = 0; guard < 1000; guard += 1) {
        const candidate = formatEmployeeId(row.prefix, n)
        const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeId, candidate)).limit(1)
        n += 1
        if (!taken) {
            await tx.update(settings).set({ employeeIdNext: n }).where(eq(settings.id, row.id))
            return candidate
        }
    }
    throw new Error("Could not find a free employee ID")
}

export const assignEmployeeId = async (userId: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await db.transaction(async (tx) => {
                const [user] = await tx.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, userId)).for("update").limit(1)
                if (!user) return null
                if (user.employeeId) return user.employeeId
                const next = await takeNextId(tx)
                await tx.update(users).set({ employeeId: next }).where(and(eq(users.id, userId), isNull(users.employeeId)))
                return next
            })
        } catch (err) {
            if (!isDuplicateEntryError(err) || attempt === 2) throw err
        }
    }
    return null
}

export const backfillEmployeeIds = async (): Promise<number> => {
    const missing = await db.select({ id: users.id }).from(users).where(isNull(users.employeeId)).orderBy(asc(users.createdAt), asc(users.id))
    let assigned = 0
    for (const { id } of missing) {
        if (await assignEmployeeId(id)) assigned += 1
    }
    if (assigned) console.log(`Employee IDs: numbered ${assigned} people`)
    return assigned
}
