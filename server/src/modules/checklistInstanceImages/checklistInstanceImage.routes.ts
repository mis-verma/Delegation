import { Router } from "express"
import { checklistInstanceImageController } from "./checklistInstanceImage.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"

export const checklistInstanceImageRouter = Router()
checklistInstanceImageRouter.use(authenticate)
checklistInstanceImageRouter.delete('/:id', checklistInstanceImageController.remove)
checklistInstanceImageRouter.post('/:id/review', checklistInstanceImageController.review)
