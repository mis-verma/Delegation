import { Router } from "express"
import { checklistInstanceController } from "./checklistInstance.controller.js"
import { checklistInstanceImageController } from "../checklistInstanceImages/checklistInstanceImage.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { checklistInstanceImageUpload } from "../../config/upload.js"

// Mounted at /checklist-instances in app.ts. Instances are cron-generated only — no create/delete
// endpoints here. "/mine", "/audit-history", "/pending-verification" and "/summary" must be registered
// before "/:id" so Express doesn't treat any of them as an id.
export const checklistInstanceRouter = Router()
checklistInstanceRouter.use(authenticate)
checklistInstanceRouter.get("/mine", checklistInstanceController.getMine)
// History is for the people who oversee checklists: ADMIN/PC see every store, MANAGER/SENIOR their
// own department only (scoped in the service). Everyone else, an audited person included, is out.
checklistInstanceRouter.get("/audit-history", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.auditHistory)
// No role gate — an explicitly named reviewer (checklistDefinitionReviewers) can be any role at
// all, so listPendingVerification/verify scope access themselves, per-instance, instead of at the
// router (same "No role gate on setItemDone" convention as the item router below).
checklistInstanceRouter.get("/pending-verification", checklistInstanceController.listPendingVerification)
// Dashboard's "Needs your approval" card — a lightweight preview (title/store/waiting-since only,
// no full hydrateInstances) distinct from the paginated queue above. No role gate for the same
// reason as that queue: the service scopes it (ADMIN/PC all, MANAGER/SENIOR their department, a
// named reviewer their runs), and anyone else simply gets an empty list.
checklistInstanceRouter.get("/pending-approval-preview", checklistInstanceController.pendingApprovalPreview)
// Verification queue's "Decisions" feed; scoped per role in the service. Before "/:id".
checklistInstanceRouter.get("/decisions", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.decisions)
checklistInstanceRouter.get("/former-people",requireRole("ADMIN", "PC"), checklistInstanceController.formerPeople)
checklistInstanceRouter.get("/former-people/names", requireRole("ADMIN", "PC"), checklistInstanceController.formerPeopleNames)
checklistInstanceRouter.get("/former-people/:userId/runs", requireRole("ADMIN", "PC"), checklistInstanceController.personRuns)
checklistInstanceRouter.get("/", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.list)
checklistInstanceRouter.get("/summary", checklistInstanceController.summary)
checklistInstanceRouter.get("/reports/period", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.periodReport)
checklistInstanceRouter.get("/reports/weekly", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.weeklyReport)
checklistInstanceRouter.get("/reports/compliance", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.complianceReport)
checklistInstanceRouter.get("/reports/by-store", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.byStoreReport)
checklistInstanceRouter.get("/reports/store-daily", requireRole("ADMIN", "PC", "MANAGER", "SENIOR"), checklistInstanceController.storeDailyReport)
checklistInstanceRouter.get("/:id/item-history", checklistInstanceController.itemHistory)
checklistInstanceRouter.get("/:id", checklistInstanceController.getOne)
checklistInstanceRouter.patch("/:id/submit", checklistInstanceController.submit)
checklistInstanceRouter.patch("/:id/verify", checklistInstanceController.verify)
checklistInstanceRouter.patch("/:id/send-back", checklistInstanceController.sendBack)
// Excuse one failing question (or take the waiver back). The service allows only department heads, PC and Admin.
checklistInstanceRouter.patch("/:id/items/:itemId/waive", checklistInstanceController.waiveItem)
checklistInstanceRouter.delete("/:id/items/:itemId/waive", checklistInstanceController.unwaiveItem)
checklistInstanceRouter.patch("/:id/reopen-approval", requireRole("ADMIN"), checklistInstanceController.reopenApproval)

// Mounted at /checklist-instance-items in app.ts. No role gate on setItemDone/images — the
// service authorizes based on whether the requester is ADMIN or one of the parent instance's
// assignees (see checklistInstance.service.ts / checklistInstanceImage.service.ts).
export const checklistInstanceItemRouter = Router()
checklistInstanceItemRouter.use(authenticate)
checklistInstanceItemRouter.patch("/:id", checklistInstanceController.setItemDone)
checklistInstanceItemRouter.post("/:id/images", checklistInstanceImageUpload, checklistInstanceImageController.upload)
