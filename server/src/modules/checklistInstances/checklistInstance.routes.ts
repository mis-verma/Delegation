import { Router } from "express"
import { checklistInstanceController } from "./checklistInstance.controller.js"
import { checklistInstanceImageController } from "../checklistInstanceImages/checklistInstanceImage.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { checklistInstanceImageUpload } from "../../config/upload.js"

// Mounted at /checklist-instances in app.ts. Instances are cron-generated only — no create/delete
// endpoints here. "/mine", "/my-audits", "/pending-verification" and "/summary" must be registered
// before "/:id" so Express doesn't treat any of them as an id.
export const checklistInstanceRouter = Router()
checklistInstanceRouter.use(authenticate)
checklistInstanceRouter.get("/mine", checklistInstanceController.getMine)
checklistInstanceRouter.get("/my-audits", checklistInstanceController.myAudits)
// No role gate — an explicitly named reviewer (checklistDefinitionReviewers) can be any role at
// all, so listPendingVerification/verify scope access themselves, per-instance, instead of at the
// router (same "No role gate on setItemDone" convention as the item router below).
checklistInstanceRouter.get("/pending-verification", checklistInstanceController.listPendingVerification)
// Dashboard's "Needs your approval" card — a lightweight preview (title/store/waiting-since only,
// no full hydrateInstances) distinct from the paginated queue above, gated ADMIN/PC to match it.
checklistInstanceRouter.get("/pending-approval-preview", requireRole("ADMIN", "PC"), checklistInstanceController.pendingApprovalPreview)
checklistInstanceRouter.get("/", requireRole("ADMIN", "PC"), checklistInstanceController.list)
checklistInstanceRouter.get("/summary", checklistInstanceController.summary)
checklistInstanceRouter.get("/reports/compliance", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.complianceReport)
checklistInstanceRouter.get("/:id", checklistInstanceController.getOne)
checklistInstanceRouter.patch("/:id/verify", checklistInstanceController.verify)

// Mounted at /checklist-instance-items in app.ts. No role gate on setItemDone/images — the
// service authorizes based on whether the requester is ADMIN or one of the parent instance's
// assignees (see checklistInstance.service.ts / checklistInstanceImage.service.ts).
export const checklistInstanceItemRouter = Router()
checklistInstanceItemRouter.use(authenticate)
checklistInstanceItemRouter.patch("/:id", checklistInstanceController.setItemDone)
checklistInstanceItemRouter.post("/:id/images", checklistInstanceImageUpload, checklistInstanceImageController.upload)
