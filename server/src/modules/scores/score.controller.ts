import { type Request, type Response } from "express"
import { z } from "zod"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { AppError } from "../../utils/AppError.js"
import { scoreService } from "./score.service.js"
import { assertScoreConsistency } from "./scoreConsistency.js"
import { EXPLORER_MODULES, EXPLORER_VIEWS } from "./scoreExplorer.js"
import { scoreExplorerService } from "./scoreExplorer.service.js"

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-01")
const querySchema = z
    .object({
        scope: z.enum(["person", "department", "store", "org"]).default("person"),
        // Left out for a person, it means the caller's own scores.
        id: z.string().min(1).max(191).optional(),
        from: DATE,
        to: DATE,
    })
    .refine((q) => q.from <= q.to, "From must be on or before To")
    .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, "Pick at most one year")
    .refine((q) => q.scope === "person" || q.scope === "org" || !!q.id, "Pick a department or store")

const reportSchema = z
    // stores: "1" adds every store to the departments and people, "only" returns the stores alone.
    .object({ from: DATE, to: DATE, stores: z.enum(["1", "0", "only"]).optional() })
    .refine((q) => q.from <= q.to, "From must be on or before To")
    .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, "Pick at most one year")

const trendSchema = z
    .object({
        scope: z.enum(["person", "department", "store", "org"]).default("person"),
        id: z.string().min(1).max(191).optional(),
        period: z.enum(["day", "week", "month", "quarter", "year"]),
        from: DATE,
        to: DATE,
    })
    .refine((q) => q.from <= q.to, "From must be on or before To")
    .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, "Pick at most one year")
    .refine((q) => q.scope === "person" || q.scope === "org" || !!q.id, "Pick a department or store")

const dayRange = <T extends { from: string; to: string }>(q: T) => q.from <= q.to && Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000

// Empty strings from a cleared filter mean "no filter".
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v)
const optionalId = z.preprocess(blankToUndefined, z.string().min(1).max(191).optional())

const explorerSchema = z
    .object({
        from: DATE,
        to: DATE,
        view: z.preprocess(blankToUndefined, z.enum(EXPLORER_VIEWS).default("department")),
        storeId: optionalId,
        departmentId: optionalId,
        module: z.preprocess(blankToUndefined, z.enum(EXPLORER_MODULES).optional()),
        // ONCE is the one-time checklist. "all" (or nothing) means every kind.
        recurrence: z.preprocess(blankToUndefined, z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "ONCE", "all"]).default("all")),
        parentId: optionalId,
    })
    .refine(dayRange, "Pick at most one year, and From must be on or before To")

const dataCheckSchema = z.object({ from: DATE, to: DATE }).refine(dayRange, "Pick at most one year, and From must be on or before To")

export const scoreController = {
    // GET /scores/explorer: one call for every way of cutting the scores. See scoreExplorer.service.ts.
    explorer: asyncHandler(async (req: Request, res: Response) => {
        const q = explorerSchema.parse(req.query)
        const recurrence = q.recurrence === "all" ? undefined : q.recurrence === "ONCE" ? "ONE_TIME" : q.recurrence
        const data = await scoreExplorerService.explorer(req.user!, { from: q.from, to: q.to, view: q.view, storeId: q.storeId, departmentId: q.departmentId, module: q.module, recurrence, parentId: q.parentId })
        res.json({ success: true, data })
    }),
    // GET /scores/data-check: ADMIN/PC only. Proves the cuts of the same numbers add up.
    dataCheck: asyncHandler(async (req: Request, res: Response) => {
        if (req.user!.role !== "ADMIN" && req.user!.role !== "PC") throw AppError.forbidden()
        const { from, to } = dataCheckSchema.parse(req.query)
        res.json({ success: true, data: await assertScoreConsistency(from, to) })
    }),
    trend: asyncHandler(async (req: Request, res: Response) => {
        const { scope, id, period, from, to } = trendSchema.parse(req.query)
        res.json({ success: true, data: await scoreService.trend(req.user!, scope, id ?? req.user!.sub, period, from, to) })
    }),
    orgCounts: asyncHandler(async (req: Request, res: Response) => {
        res.json({ success: true, data: await scoreService.orgCounts(req.user!) })
    }),
    report: asyncHandler(async (req: Request, res: Response) => {
        const { from, to, stores } = reportSchema.parse(req.query)
        const parts = { people: stores !== "only", stores: stores === "1" || stores === "only" }
        res.json({ success: true, data: await scoreService.report(req.user!, from, to, parts) })
    }),
    scores: asyncHandler(async (req: Request, res: Response) => {
        const { scope, id, from, to } = querySchema.parse(req.query)
        const data = await scoreService.forScope(req.user!, scope, id ?? req.user!.sub, from, to)
        res.json({ success: true, data })
    }),
}
