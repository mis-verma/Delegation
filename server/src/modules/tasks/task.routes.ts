import { Router } from "express"
import { taskController } from "./task.controller.js"
import { authenticate , requireRole } from "../../middleware/auth/auth.js"
import { taskChecklistController } from "../taskChecklists/taskChecklist.controller.js"
import { taskAttachmentController } from "../taskAttachments/taskAttachment.controller.js"
import { taskCommentController } from "../taskComments/taskComment.controller.js"
import { taskAttachmentUpload, taskCommentAttachmentUpload, voiceNoteUpload, checklistBulkImportUpload } from "../../config/upload.js"
import { taskAiController } from "./ai/task.ai.controller.js"
import { taskBulkImportController } from "./taskBulkImport.controller.js"

export const taskRouter = Router()

taskRouter.use(authenticate)

taskRouter.get("/", taskController.list)
taskRouter.get("/summary", taskController.summary)
taskRouter.get("/pending-approval", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), taskController.pendingApproval)
taskRouter.get("/reports/compliance", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), taskController.complianceReport)
taskRouter.get("/reports/by-owner", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), taskController.ownerStats)
taskRouter.get("/:id" , taskController.getOne)
taskRouter.patch("/:id" , taskController.update)
taskRouter.patch("/:id/verify", taskController.verify)
taskRouter.post("/:id/approve-assignment", taskController.approveAssignment)
taskRouter.post("/:id/decline", taskController.decline)
taskRouter.post("/:id/reopen-declined", taskController.reopenDeclined)
taskRouter.delete("/:id" , taskController.remove)
taskRouter.patch("/:id/restore", requireRole("ADMIN", "PC"), taskController.restore)

taskRouter.post("/", taskController.create)

taskRouter.post("/bulk-import/preview", requireRole("ADMIN", "PC"), checklistBulkImportUpload, taskBulkImportController.preview)
taskRouter.post("/bulk-import/publish", requireRole("ADMIN", "PC"), taskBulkImportController.publish)

taskRouter.post("/:taskId/checklists", requireRole("ADMIN", "PC"), taskChecklistController.createForTask)
taskRouter.post("/:taskId/checklists/from-template/:templateId", requireRole("ADMIN", "PC"), taskChecklistController.createFromTemplate)

taskRouter.post("/:id/attachments", taskAttachmentUpload, taskAttachmentController.upload)

taskRouter.get("/:taskId/comments", taskCommentController.list)
taskRouter.post("/:taskId/comments", taskCommentAttachmentUpload, taskCommentController.create)

taskRouter.post("/ai/parse", requireRole("ADMIN", "PC"), taskAiController.parse)
taskRouter.post("/ai/create", requireRole("ADMIN", "PC"), taskAiController.create)
taskRouter.post("/ai/transcribe", requireRole("ADMIN", "PC"), voiceNoteUpload, taskAiController.transcribe)