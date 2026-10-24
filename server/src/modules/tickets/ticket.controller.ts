import { type Request , type Response } from "express"
import { ticketService } from "./ticket.service.js"
import { createTicketSchema , paginatioinSchema, updateTicketSchema , tatReportQuerySchema, ownerStatsQuerySchema, verifyTicketSchema, statusUpdateSchema, ticketSummaryQuerySchema, declineTicketSchema } from "./ticket.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveReportScope } from "../../utils/reportScope.js"
import { routeParam } from "../../utils/routeParam.js"

export const ticketController = {
    list : asyncHandler( async ( req : Request , res : Response) => {
        const result = await ticketService.list(req.user!, paginatioinSchema.parse(req.query))
        res.json({ success : true , ...result})
    }),

    getOne : asyncHandler(async (req : Request , res : Response) => {
        const ticket = await ticketService.getById(routeParam(req, "id") , req.user!);
        res.json({ success : true , data : ticket})
    }),

    summary : asyncHandler(async (req : Request , res : Response) => {
        const { scope } = ticketSummaryQuerySchema.parse(req.query);
        const data = await ticketService.summary(req.user!, scope);
        res.json({ success : true , data })
    }),

    pendingApproval : asyncHandler(async (req : Request , res : Response) => {
        const { data, meta } = await ticketService.pendingApproval(req.user!);
        res.json({ success : true , data, meta })
    }),

    create : asyncHandler( async (req : Request , res : Response) => {
        const input = createTicketSchema.parse(req.body);
        const ticket = await ticketService.create(input , req.user!)
        res.status(201).json({ success : true , data : ticket})
    }),

    update : asyncHandler ( async (req : Request , res : Response) => {
        const input = updateTicketSchema.parse(req.body);
        const ticket = await ticketService.update(routeParam(req, "id") , input , req.user!)
        res.json({ success : true , data : ticket})
    }),

   
    addStatusUpdate : asyncHandler ( async (req : Request , res : Response) => {
        const input = statusUpdateSchema.parse(req.body);
        const files = (req.files as Express.Multer.File[]) ?? [];
        const ticket = await ticketService.addStatusUpdate(routeParam(req, "id") , input , files , req.user!)
        res.json({ success : true , data : ticket})
    }),

    approveAssignment : asyncHandler(async (req : Request , res : Response) => {
        const ticket = await ticketService.approveAssignment(routeParam(req, "id"), req.user!)
        res.json({ success : true , data : ticket })
    }),

    reopenDeclined : asyncHandler(async (req : Request , res : Response) => {
        const ticket = await ticketService.reopenDeclined(routeParam(req, "id"), req.user!)
        res.json({ success : true , data : ticket })
    }),

    decline : asyncHandler(async (req : Request , res : Response) => {
        const input = declineTicketSchema.parse(req.body);
        const ticket = await ticketService.decline(routeParam(req, "id"), input.reason, req.user!)
        res.json({ success : true , data : ticket })
    }),

    verify : asyncHandler ( async (req : Request , res : Response) => {
        const input = verifyTicketSchema.parse(req.body);
        const ticket = await ticketService.verify(routeParam(req, "id") , input , req.user!)
        res.json({ success : true , data : ticket})
    }),

    remove : asyncHandler ( async ( req : Request, res : Response) => {
        await ticketService.remove(routeParam(req, "id") , req.user!)
        res.json({ success : true , data : { deleted : true}})
    }),

    tatReport : asyncHandler(async (req : Request , res : Response) => {
        const { groupBy, from , to, departmentId, storeId } = tatReportQuerySchema.parse(req.query);
        const scope = resolveReportScope(req.user!, { departmentId, storeId });
        const data = await ticketService.tatReport(groupBy, from, to, scope.departmentId, scope.storeId);
        res.json({ success : true, data})
    }),

    ownerStats : asyncHandler(async (req : Request , res : Response) => {
        const { scope: dimension, from , to, departmentId, storeId } = ownerStatsQuerySchema.parse(req.query);
        const scope = resolveReportScope(req.user!, { departmentId, storeId });
        const data = await ticketService.ownerStats(dimension, from, to, scope.departmentId, scope.storeId);
        res.json({ success : true, data})
    })
}