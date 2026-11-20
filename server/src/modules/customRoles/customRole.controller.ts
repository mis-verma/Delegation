import { type Request, type Response } from "express"
import { customRoleService } from "./customRole.service.js"
import { createCustomRoleSchema, updateCustomRoleSchema } from "./customRole.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { routeParam } from "../../utils/routeParam.js"

export const customRoleController = {
    list: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await customRoleService.list() })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const role = await customRoleService.getById(routeParam(req, "id"))
        res.json({ success: true, data: role })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createCustomRoleSchema.parse(req.body)
        const role = await customRoleService.create(input, req.user!.sub)
        res.status(201).json({ success: true, data: role })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateCustomRoleSchema.parse(req.body)
        const role = await customRoleService.update(routeParam(req, "id"), input, req.user!.sub)
        res.json({ success: true, data: role })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await customRoleService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),
}
