import { Router } from "express"
import { checklistDefinitionController } from "./checklistDefinition.controller.js"
import { checklistBulkImportController } from "./checklistBulkImport.controller.js"
import { checklistBulkImportUpload, checklistReferenceUpload } from "../../config/upload.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"

export const checklistDefinitionRouter = Router()
checklistDefinitionRouter.use(authenticate)
checklistDefinitionRouter.use(requireRole("ADMIN", "PC"))
checklistDefinitionRouter.post("/reference-image", checklistReferenceUpload, checklistDefinitionController.uploadReferenceImage)
checklistDefinitionRouter.get("/", checklistDefinitionController.list)
checklistDefinitionRouter.get("/scoring-gaps", checklistDefinitionController.scoringGaps)
checklistDefinitionRouter.get("/:id", checklistDefinitionController.getOne)
checklistDefinitionRouter.post("/", checklistDefinitionController.create)
checklistDefinitionRouter.put("/:id", checklistDefinitionController.update)
checklistDefinitionRouter.patch("/:id/active", checklistDefinitionController.setActive)
checklistDefinitionRouter.delete("/:id", checklistDefinitionController.remove)
checklistDefinitionRouter.post("/:id/restore", checklistDefinitionController.restore)

checklistDefinitionRouter.post("/bulk-import/preview", checklistBulkImportUpload, checklistBulkImportController.preview)
checklistDefinitionRouter.post("/bulk-import/publish", checklistBulkImportController.publish)
