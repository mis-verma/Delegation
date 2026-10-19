import type { Request, Response } from "express"
import { smartTaskConversationService } from "./smartTaskConversation.service.js"
import { createSmartTaskConversationSchema, patchSmartTaskConversationSchema } from "./smartTaskConversation.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const smartTaskConversationController = {
    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createSmartTaskConversationSchema.parse(req.body);
        const conversation = await smartTaskConversationService.create(req.user!.sub, input);
        res.status(201).json({ success: true, data: conversation });
    }),

    patch: asyncHandler(async (req: Request, res: Response) => {
        const input = patchSmartTaskConversationSchema.parse(req.body);
        const conversation = await smartTaskConversationService.patch(req.params.id, req.user!.sub, input);
        res.json({ success: true, data: conversation });
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
        const conversations = await smartTaskConversationService.listForUser(req.user!.sub);
        res.json({ success: true, data: conversations });
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const conversation = await smartTaskConversationService.getOne(req.params.id, req.user!.sub);
        res.json({ success: true, data: conversation });
    }),

    deleteAll: asyncHandler(async (req: Request, res: Response) => {
        const result = await smartTaskConversationService.deleteAllForUser(req.user!.sub);
        res.json({ success: true, data: result });
    }),
};
