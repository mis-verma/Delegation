import { type Request, type Response } from "express";
import { categoryService } from "./category.service.js";
import { createCategorySchema , updateCategorySchema } from "./category.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isOwnScopeRole } from "../../utils/roles.js";
import { routeParam } from "../../utils/routeParam.js"
import { categoryTatService, TAT_WINDOW_DAYS } from "./categoryTat.service.js"
import { z } from "zod"

const tatQuerySchema = z.object({
    days: z.coerce.number().int().refine((value) => (TAT_WINDOW_DAYS as readonly number[]).includes(value), "Pick 30, 90, 180, 365 or 0 for all time").default(90),
    tagId: z.string().min(1).optional(),
})

const hideAssigneeEmails = <T extends { assignees: { email: string }[] }>(category: T, role: string): T =>
    isOwnScopeRole(role) ? { ...category, assignees: category.assignees.map((assignee) => ({ ...assignee, email: "" })) } : category;

export const categoryController = {
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

    remove : asyncHandler(async (req : Request , res : Response) => {
        await categoryService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success : true, data : { deleted : true}})
    })

}