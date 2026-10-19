import { Router } from "express"
import { taskChecklistController } from "./taskChecklist.controller.js"
import { authenticate, requireRole} from "../../middleware/auth/auth.js"
import { taskImageController } from "../taskImages/taskImage.controller.js"
import { taskImageUpload } from "../../config/upload.js"

export const taskChecklistRouter = Router()
taskChecklistRouter.use(authenticate)
taskChecklistRouter.delete('/:id', requireRole("ADMIN", "PC"), taskChecklistController.removeChecklist)

export const taskChecklistItemRouter = Router()
taskChecklistItemRouter.use(authenticate)
taskChecklistItemRouter.patch('/:id', taskChecklistController.updateItem)
taskChecklistItemRouter.patch('/:id/remarks', taskChecklistController.updateRemarks)
taskChecklistItemRouter.post('/:id/complete', taskChecklistController.completeItem)
taskChecklistItemRouter.delete('/:id', requireRole("ADMIN", "PC"),taskChecklistController.removeItem)
taskChecklistItemRouter.post('/:id/images', taskImageUpload, taskImageController.upload)

