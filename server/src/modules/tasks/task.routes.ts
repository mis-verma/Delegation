import { Router } from "express" // Express's Router lets us group related endpoints (all the /tasks ones) together
import { taskController } from "./task.controller.js" // the functions that actually handle each route
import { authenticate , requireRole } from "../../middleware/auth/auth.js" // middleware that checks the JWT and attaches req.user, or rejects the request
import { taskChecklistController } from "../taskChecklists/taskChecklist.controller.js" // creating a checklist under a specific task
import { taskAttachmentController } from "../taskAttachments/taskAttachment.controller.js" // attaching general files (pdf/csv/image/video) directly to a task
import { taskCommentController } from "../taskComments/taskComment.controller.js" // the task's activity/comment feed
import { taskAttachmentUpload, taskCommentAttachmentUpload, voiceNoteUpload, checklistBulkImportUpload } from "../../config/upload.js"
import { taskAiController } from "./ai/task.ai.controller.js"
import { taskBulkImportController } from "./taskBulkImport.controller.js"

export const taskRouter = Router()

taskRouter.use(authenticate)

taskRouter.get("/", taskController.list)
taskRouter.get("/reports/compliance", taskController.complianceReport)
taskRouter.get("/reports/by-owner", taskController.ownerStats)
taskRouter.get("/:id" , taskController.getOne)
taskRouter.patch("/:id" , taskController.update)
taskRouter.patch("/:id/verify", requireRole("PC", "ADMIN"), taskController.verify)
taskRouter.delete("/:id" , requireRole("ADMIN", "PC"),taskController.remove)

taskRouter.post("/", taskController.create)

// Bulk-create delegations from an uploaded CSV/Excel file — see taskBulkImport.service.ts.
// ADMIN/PC only, matching the equivalent checklist bulk-import router's gate; a plain POST "/"
// create has no such gate, but bulk-creating many delegations at once for other people is a
// distinct, more powerful capability. Reuses the checklist feature's own upload middleware
// (generic CSV/XLSX/PDF file-type + size validation, nothing checklist-specific about it) rather
// than standing up a near-identical second multer instance. Different HTTP method than the
// existing GET "/:id" above, so route-ordering relative to it doesn't matter.
taskRouter.post("/bulk-import/preview", requireRole("ADMIN", "PC"), checklistBulkImportUpload, taskBulkImportController.preview)
taskRouter.post("/bulk-import/publish", requireRole("ADMIN", "PC"), taskBulkImportController.publish)


taskRouter.post("/:taskId/checklists", requireRole("ADMIN", "PC"), taskChecklistController.createForTask) // POST /tasks/:taskId/checklists -> create a checklist under this task
taskRouter.post("/:taskId/checklists/from-template/:templateId", requireRole("ADMIN", "PC"), taskChecklistController.createFromTemplate)

taskRouter.post("/:id/attachments", taskAttachmentUpload, taskAttachmentController.upload) // POST /tasks/:id/attachments -> attach general files (pdf/csv/image/video) to this task

taskRouter.get("/:taskId/comments", taskCommentController.list) // GET /tasks/:taskId/comments -> the task's activity feed
taskRouter.post("/:taskId/comments", taskCommentAttachmentUpload, taskCommentController.create) // POST /tasks/:taskId/comments -> post a comment (text/attachments/location)

taskRouter.post("/ai/parse", taskAiController.parse)
taskRouter.post("/ai/create", taskAiController.create)
taskRouter.post("/ai/transcribe", voiceNoteUpload, taskAiController.transcribe)