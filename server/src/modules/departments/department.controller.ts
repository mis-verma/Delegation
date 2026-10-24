import { type Request , type Response } from "express";
import { departmentService } from "./department.service.js";
import { createDepartmentSchema , updateDepartmentSchema, listDepartmentsQuerySchema } from "./department.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { routeParam } from "../../utils/routeParam.js"

export const departmentController = {

    list : asyncHandler( async (req : Request , res : Response) => {
        const { page, limit } = listDepartmentsQuerySchema.parse(req.query)
        const result = await departmentService.list(page, limit)
        res.json({ success : true , ...result})
    }),

    getOne : asyncHandler(async ( req : Request , res : Response) => {
        const department = await departmentService.getById(routeParam(req, "id"))
        res.json({ success : true, data : department})
    }),

    create : asyncHandler(async ( req : Request , res : Response) => {
        const input = createDepartmentSchema.parse(req.body)
        const department = await departmentService.create(input, req.user!.sub)
        res.status(201).json({ success : true , data : department})
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateDepartmentSchema.parse(req.body)
        const department = await departmentService.update(routeParam(req, "id"), input, req.user!.sub)
        res.json({success : true, data : department})

    }),

    remove : asyncHandler(async (req : Request, res : Response) => {
        await departmentService.remove(routeParam(req, "id"), req.user!.sub)
        res.json({ success : true, data : { deleted : true}})
    }),

}