import { Router } from "express"
import { checklistDefinitionController } from "./checklistDefinition.controller.js"
import { checklistBulkImportController } from "./checklistBulkImport.controller.js"
import { checklistBulkImportUpload } from "../../config/upload.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"

// Mounted at /checklist-definitions in app.ts. Unlike checklist-templates, every route here is
// ADMIN/PC-only — PC has the same org-wide access as ADMIN throughout this app (see
// ticket.service.ts's visibilityFilter/assertCanMutate for the same pattern), so it's
// intentionally not store-scoped here either. Every other role interacts with this feature only
// through the generated instances (see modules/checklistInstances), never the definitions directly.
export const checklistDefinitionRouter = Router()
checklistDefinitionRouter.use(authenticate)
checklistDefinitionRouter.use(requireRole("ADMIN", "PC"))
checklistDefinitionRouter.get("/", checklistDefinitionController.list)
checklistDefinitionRouter.get("/:id", checklistDefinitionController.getOne)
checklistDefinitionRouter.post("/", checklistDefinitionController.create)
checklistDefinitionRouter.put("/:id", checklistDefinitionController.update)
checklistDefinitionRouter.patch("/:id/active", checklistDefinitionController.setActive)
checklistDefinitionRouter.delete("/:id", checklistDefinitionController.remove)

// Bulk-assign an existing checklist to many stores/people at once via an uploaded file — see
// checklistBulkImport.service.ts. No route-ordering concern here: ":id" only ever matches a
// single path segment, never the two-segment "/bulk-import/preview"/"/bulk-import/publish".
checklistDefinitionRouter.post("/bulk-import/preview", checklistBulkImportUpload, checklistBulkImportController.preview)
checklistDefinitionRouter.post("/bulk-import/publish", checklistBulkImportController.publish)
