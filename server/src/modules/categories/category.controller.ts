import { type Request, type Response } from "express";
import { categoryService } from "./category.service.js";
import { createCategorySchema , updateCategorySchema, createSubcategorySchema, updateSubcategorySchema } from "./category.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isOwnScopeRole } from "../../utils/roles.js";
import { routeParam } from "../../utils/routeParam.js"
import { categoryTatService, TAT_WINDOW_DAYS } from "./categoryTat.service.js"
import { categoryHistoryImportService } from "./categoryHistoryImport.js"
import { AppError } from "../../utils/AppError.js"
import { z } from "zod"
import { streamCsv } from "../../utils/csv.js"
import { streamXlsx } from "../../utils/xlsx.js"
import { CATEGORY_FILE_COLUMNS, categoryFileRows } from "./categoryExport.js"

const tatQuerySchema = z.object({
    days: z.coerce.number().int().refine((value) => (TAT_WINDOW_DAYS as readonly number[]).includes(value), "Pick 30, 90, 180, 365 or 0 for all time").default(90),
    tagId: z.string().min(1).optional(),
})

const hideAssigneeEmails = <T extends { assignees: { email: string }[] }>(category: T, role: string): T =>
    isOwnScopeRole(role) ? { ...category, assignees: category.assignees.map((assignee) => ({ ...assignee, email: "" })) } : category;

const exportQuerySchema = z.object({ format: z.enum(["csv", "xlsx"]).default("xlsx") })

export const categoryController = {
    export : asyncHandler(async (req : Request, res : Response) => {
        const { format } = exportQuerySchema.parse(req.query)
        const rows = categoryFileRows(await categoryService.list())
        const datePart = new Date().toISOString().slice(0, 10)
        res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res.setHeader("Content-Disposition", `attachment; filename="categories-${datePart}.${format}"`)
        if (format === "csv") return streamCsv(res, rows, CATEGORY_FILE_COLUMNS)
        return streamXlsx(res, rows, CATEGORY_FILE_COLUMNS, "Categories")
    }),

    historyPreview : asyncHandler(async (req : Request, res : Response) => {
        if (!req.file) throw AppError.badRequest("A file is required.")
        const column = typeof req.body?.nameColumn === "string" && req.body.nameColumn ? req.body.nameColumn : undefined
        const data = await categoryHistoryImportService.preview(req.file.buffer, req.file.mimetype, column, req.user!)
        res.json({ success : true, data })
    }),

    list : asyncHandler(async (req : Request , res : Response) => {
        const categories = await categoryService.list()
        res.json({ success : true, data : categories.map((category) => hideAssigneeEmails(category, req.user!.role))})
    }), 

    tatReport : asyncHandler(async (req : Request, res : Response) => {
        const { days, tagId } = tatQuerySchema.parse(req.query)
        res.json({ success : true, data : await categoryTatService.report(days, tagId) })
    }),

    getOne : asyncHandler(async(req : Request, res : Response) => {
        const category = await categoryService.getById(routeParam(req, "id"))
        res.json({ success : true , data : hideAssigneeEmails(category, req.user!.role)})
    }),

    create : asyncHandler(async(req : Request, res : Response) => {
        const input = createCategorySchema.parse(req.body)
        const category = await categoryService.create(input, req.user!.sub)
        res.status(201).json({ success : true , data : category})
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateCategorySchema.parse(req.body)
        const category = await categoryService.update(routeParam(req, "id"), input, req.user!.sub)
        res.json({ success : true , data : category})
    }),

    createSubcategory : asyncHandler(async (req : Request, res : Response) => {
        const input = createSubcategorySchema.parse(req.body)
        const sub = await categoryService.createSubcategory(routeParam(req, "id"), input, req.user!.sub)
        res.status(201).json({ success : true, data : sub })
    }),

    updateSubcategory : asyncHandler(async (req : Request, res : Response) => {
        const input = updateSubcategorySchema.parse(req.body)
        const sub = await categoryService.updateSubcategory(routeParam(req, "id"), routeParam(req, "subId"), input, req.user!.sub)
        res.json({ success : true, data : sub })
    }),

    removeSubcategory : asyncHandler(async (req : Request, res : Response) => {
        await categoryService.removeSubcategory(routeParam(req, "id"), routeParam(req, "subId"), req.user!.sub)
        res.json({ success : true, data : { deleted : true } })
    }),

    remove : asyncHandler(async (req : Request , res : Response) => {
        await categoryService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success : true, data : { deleted : true}})
    })

}