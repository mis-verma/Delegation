import { Router } from "express"
import { taskAttachmentController } from "./taskAttachment.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"

export const taskAttachmentRouter = Router()
taskAttachmentRouter.use(authenticate)
taskAttachmentRouter.delete('/:id', taskAttachmentController.remove)
