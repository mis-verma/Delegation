import { Router } from "express"
import { checklistInstanceItemSubmissionController } from "./checklistInstanceItemSubmission.controller.js"
import { checklistInstanceItemSubmissionImageController } from "../checklistInstanceItemSubmissionImages/checklistInstanceItemSubmissionImage.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"
import { checklistInstanceItemSubmissionImageUpload } from "../../config/upload.js"

export const checklistInstanceItemSubmissionRouter = Router()
checklistInstanceItemSubmissionRouter.use(authenticate)
checklistInstanceItemSubmissionRouter.patch("/:id", checklistInstanceItemSubmissionController.setDone)
checklistInstanceItemSubmissionRouter.patch("/:id/accessories", checklistInstanceItemSubmissionController.updateAccessories)
checklistInstanceItemSubmissionRouter.patch("/:id/dress-type", checklistInstanceItemSubmissionController.setDressType)
checklistInstanceItemSubmissionRouter.patch("/:id/remarks", checklistInstanceItemSubmissionController.updateRemarks)
checklistInstanceItemSubmissionRouter.post("/:id/images", checklistInstanceItemSubmissionImageUpload, checklistInstanceItemSubmissionImageController.upload)
