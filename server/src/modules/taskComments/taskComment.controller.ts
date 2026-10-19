import type { Request, Response } from "express"
import { taskCommentService } from "./taskComment.service.js"
import { createTaskCommentSchema } from "./taskComment.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

export const taskCommentController = {
    list: asyncHandler(async (req: Request, res: Response) => {
        const comments = await taskCommentService.list(req.params.taskId, req.user!);
        res.json({ success: true, data: comments });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
        const input = createTaskCommentSchema.parse({
            body: req.body.body,
            location: req.body.location ? JSON.parse(req.body.location) : undefined,
        });
        const files = (req.files as Express.Multer.File[]) ?? [];
        const comment = await taskCommentService.create(req.params.taskId, input, files, req.user!);
        res.status(201).json({ success: true, data: comment });
    }),
};
