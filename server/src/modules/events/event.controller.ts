import { type Request, type Response } from "express";
import { eventService } from "./event.service.js";
import { createEventSchema, updateEventSchema, listUpcomingEventsQuerySchema } from "./event.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const eventController = {
    list: asyncHandler(async (_req: Request, res: Response) => {
        const events = await eventService.list()
        res.json({ success: true, data: events })
    }),

    listUpcoming: asyncHandler(async (req: Request, res: Response) => {
        const { limit } = listUpcomingEventsQuerySchema.parse(req.query)
        const events = await eventService.listUpcoming(limit)
        res.json({ success: true, data: events })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const event = await eventService.getById(req.params.id)
        res.json({ success: true, data: event })
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createEventSchema.parse(req.body)
        const event = await eventService.create(input, req.user!.sub)
        res.status(201).json({ success: true, data: event })
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
        const input = updateEventSchema.parse(req.body)
        const event = await eventService.update(req.params.id, input, req.user!.sub)
        res.json({ success: true, data: event })
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
        await eventService.remove(req.params.id, req.user!.sub)
        res.json({ success: true, data: { deleted: true } })
    }),
}
