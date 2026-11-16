import { readTable } from "../../utils/readTable.js"
import { AppError } from "../../utils/AppError.js"
import { GENDERS } from "../../db/schema/core.js"
import { normalizePhone } from "./phone.js"

export const USER_IMPORT_MAX_ROWS = 300

export const IMPORT_ROLES = ["USER", "AGENT", "MANAGER", "SENIOR", "APPROVAL_MANAGER"] as const
export type ImportRole = (typeof IMPORT_ROLES)[number]
type Gender = (typeof GENDERS)[number]

type Field = "email" | "firstName" | "lastName" | "name" | "role" | "department" | "store" | "phone" | "gender"

const HEADER_ALIASES: Record<string, Field> = {
    "email": "email",
    "e-mail": "email",
    "email id": "email",
    "email address": "email",
    "first name": "firstName",
    "firstname": "firstName",
    "given name": "firstName",
    "last name": "lastName",
    "lastname": "lastName",
    "surname": "lastName",
    "family name": "lastName",
    "name": "name",
    "full name": "name",
    "employee name": "name",
    "role": "role",
    "designation": "role",
    "department": "department",
    "dept": "department",
    "team": "department",
    "store": "store",
    "branch": "store",
    "location": "store",
    "phone": "phone",
    "mobile": "phone",
    "mobile number": "phone",
    "phone number": "phone",
    "contact": "phone",
    "gender": "gender",
    "sex": "gender",
}

const ROLE_WORDS: Record<string, ImportRole> = {
    "user": "USER",
    "staff": "USER",
    "employee": "USER",
    "agent": "AGENT",
    "manager": "MANAGER",
    "hod": "MANAGER",
    "head": "MANAGER",
    "department head": "MANAGER",
    "senior": "SENIOR",
    "senior manager": "SENIOR",
    "approval manager": "APPROVAL_MANAGER",
    "approval_manager": "APPROVAL_MANAGER",
}

const GENDER_WORDS: Record<string, Gender> = { f: "FEMALE", female: "FEMALE", woman: "FEMALE", m: "MALE", male: "MALE", man: "MALE" }

export type UserImportRow = {
    rowIndex: number
    email: string
    firstName: string
    lastName: string | null
    role: ImportRole
    roleText: string | null
    roleMatched: boolean
    departmentText: string | null
    departmentId: string | null
    storeText: string | null
    storeId: string | null
    phone: string | null
    phoneInvalid: boolean
    phoneText: string | null
    gender: Gender | null
    emailInvalid: boolean
    duplicateInFile: boolean
    alreadyExists: boolean
}

export type UserImportPreview = {
    rows: UserImportRow[]
    skippedEmpty: number
    truncated: boolean
    unknownColumns: string[]
}

export type OrgLookup = {
    departments: { id: string; name: string }[]
    stores: { id: string; name: string }[]
    existingEmails: Set<string>
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ")

const byName = (list: { id: string; name: string }[]) => new Map(list.map((x) => [norm(x.name), x.id]))

const pickFields = (record: Record<string, string>): Partial<Record<Field, string>> => {
    const out: Partial<Record<Field, string>> = {}
    for (const [key, value] of Object.entries(record)) {
        const field = HEADER_ALIASES[norm(key)]
        const v = String(value ?? "").trim()
        if (field && v && out[field] === undefined) out[field] = v
    }
    return out
}

const splitName = (full: string): { firstName: string; lastName: string | null } => {
    const parts = full.trim().split(/\s+/)
    return { firstName: parts[0] ?? "", lastName: parts.length > 1 ? parts.slice(1).join(" ") : null }
}

const phoneOf = (raw: string | undefined): { phone: string | null; invalid: boolean } => {
    if (!raw) return { phone: null, invalid: false }
    try {
        return { phone: normalizePhone(raw), invalid: false }
    } catch {
        return { phone: null, invalid: true }
    }
}

export const unknownColumnsOf = (records: Record<string, string>[]): string[] => {
    const seen = new Set<string>()
    for (const record of records.slice(0, 50)) for (const key of Object.keys(record)) if (!HEADER_ALIASES[norm(key)]) seen.add(key)
    return [...seen]
}

export const userRowsFromRecords = (records: Record<string, string>[], lookup: OrgLookup): UserImportPreview => {
    const departmentIds = byName(lookup.departments)
    const storeIds = byName(lookup.stores)
    const seenEmails = new Set<string>()
    const rows: UserImportRow[] = []
    let skippedEmpty = 0

    records.forEach((record, i) => {
        const f = pickFields(record)
        const split = f.name && !f.firstName ? splitName(f.name) : null
        const firstName = (f.firstName ?? split?.firstName ?? "").slice(0, 191)
        if (!f.email && !firstName) {
            skippedEmpty++
            return
        }
        const email = (f.email ?? "").trim().toLowerCase()
        const roleHit = f.role ? ROLE_WORDS[norm(f.role)] : undefined
        const { phone, invalid } = phoneOf(f.phone)
        const emailInvalid = !EMAIL_PATTERN.test(email) || email.length > 191
        rows.push({
            rowIndex: i + 2,
            email,
            firstName,
            lastName: (f.lastName ?? split?.lastName ?? null)?.slice(0, 191) ?? null,
            role: roleHit ?? "USER",
            roleText: f.role ?? null,
            roleMatched: !f.role || !!roleHit,
            departmentText: f.department ?? null,
            departmentId: f.department ? departmentIds.get(norm(f.department)) ?? null : null,
            storeText: f.store ?? null,
            storeId: f.store ? storeIds.get(norm(f.store)) ?? null : null,
            phone,
            phoneInvalid: invalid,
            phoneText: f.phone ?? null,
            gender: f.gender ? GENDER_WORDS[norm(f.gender)] ?? null : null,
            emailInvalid,
            duplicateInFile: !emailInvalid && seenEmails.has(email),
            alreadyExists: !emailInvalid && lookup.existingEmails.has(email),
        })
        if (!emailInvalid) seenEmails.add(email)
    })

    return {
        rows: rows.slice(0, USER_IMPORT_MAX_ROWS),
        skippedEmpty,
        truncated: rows.length > USER_IMPORT_MAX_ROWS,
        unknownColumns: unknownColumnsOf(records),
    }
}

export const rowProblem = (row: UserImportRow): string | null => {
    if (!row.firstName) return "Name is missing"
    if (!row.email) return "Email is missing"
    if (row.emailInvalid) return "Email is not valid"
    if (row.alreadyExists) return "Email already has an account"
    if (row.duplicateInFile) return "Email appears twice in the file"
    if (row.phoneInvalid) return "Phone number is not valid"
    if (row.departmentText && !row.departmentId) return `No department called "${row.departmentText}"`
    if (row.storeText && !row.storeId) return `No store called "${row.storeText}"`
    if (!row.roleMatched) return `Role "${row.roleText}" is not recognised`
    return null
}

export const readUserFile = async (buffer: Buffer, mimetype: string, lookup: OrgLookup): Promise<UserImportPreview> => {
    const records = await readTable(buffer, mimetype)
    const preview = userRowsFromRecords(records, lookup)
    if (!preview.rows.length) {
        throw AppError.unprocessable("No people found. Put each person on their own row, with columns called Email and Name.")
    }
    return preview
}

export const USER_IMPORT_TEMPLATE = "Name,Email,Role,Department,Store,Phone,Gender\nAsha Verma,asha@example.com,USER,Sales,Solan,9876543210,Female\n"
