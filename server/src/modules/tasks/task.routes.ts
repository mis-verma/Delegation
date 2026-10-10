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
// Registered before "/:id" — same reason /reports/* below has to be, or Express would treat
// "summary" as an :id value and route this into getOne instead. Open to every authenticated role
// (no requireRole gate): it's always "mine", so there's no elevated-scope data to protect here the
// way the /reports/* routes below need to.
taskRouter.get("/summary", taskController.summary)
// Dashboard's "Needs your approval" card — org-wide, gated to the roles that can actually verify
// a delegation (matches CAN_VERIFY_BY_ROLE's own ADMIN/PC check inside the service).
taskRouter.get("/pending-approval", requireRole("ADMIN", "PC"), taskController.pendingApproval)
// Matches the equivalent ticket/checklist-instance report routes' gate — by-owner in particular
// had no role check at all, and its scope resolver (resolveReportScope) returns an *unfiltered*
// scope for any role it doesn't recognize, so an AGENT/USER hitting this directly (outside the
// UI, which never requests it for those roles) got real org-wide delegation totals back instead
// of being scoped down or refused.
taskRouter.get("/reports/compliance", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), taskController.complianceReport)
taskRouter.get("/reports/by-owner", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), taskController.ownerStats)
taskRouter.get("/:id" , taskController.getOne)
taskRouter.patch("/:id" , taskController.update)
// No role gate here anymore — a named reviewer (task.service.ts's taskReviewers, additive on top
// of the role-based rule) can be any role at all, so who's actually allowed to verify THIS task
// has to be checked in the service against the specific row, not generically at the router. See
// task.service.ts's assertCanVerify, and the identical decision already made for checklist
// instances (checklistInstance.routes.ts).
taskRouter.patch("/:id/verify", taskController.verify)
// No role gate at the router: ADMIN/PC may archive any delegation they can see, and anyone else may
// discard only their own unpublished draft. Both rules need the row, so remove() checks them.
taskRouter.delete("/:id" , taskController.remove)
// Restore from the Archived Delegations view. ADMIN/PC only: a creator who discarded their own
// draft meant to throw it away (route above).
taskRouter.patch("/:id/restore", requireRole("ADMIN", "PC"), taskController.restore)

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

// Smart Task is offered to ADMIN/PC only in the web app, so the HTTP routes match. The WhatsApp and
// DoubleTick bots don't come through here: they call extractTaskFromText/createFromSmartInput
// directly from their own webhook controllers, so their senders are unaffected by this gate.
taskRouter.post("/ai/parse", requireRole("ADMIN", "PC"), taskAiController.parse)
taskRouter.post("/ai/create", requireRole("ADMIN", "PC"), taskAiController.create)
taskRouter.post("/ai/transcribe", requireRole("ADMIN", "PC"), voiceNoteUpload, taskAiController.transcribe)