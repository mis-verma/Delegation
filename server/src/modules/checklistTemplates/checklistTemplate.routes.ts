import { Router } from "express"
import { checklistTemplateController } from "./checklistTemplate.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"

export const checklistTemplateRouter = Router()
checklistTemplateRouter.use(authenticate)
checklistTemplateRouter.get("/", checklistTemplateController.list)
checklistTemplateRouter.get("/:id", checklistTemplateController.getOne)
checklistTemplateRouter.post("/", requireRole("ADMIN", "PC"), checklistTemplateController.create)
checklistTemplateRouter.patch("/:id", requireRole("ADMIN", "PC"), checklistTemplateController.update)
checklistTemplateRouter.delete("/:id", requireRole("ADMIN", "PC"), checklistTemplateController.remove)
checklistTemplateRouter.post("/:templateId/items", requireRole("ADMIN", "PC"), checklistTemplateController.addItem)

export const checklistTemplateItemRouter = Router()
checklistTemplateItemRouter.use(authenticate)
checklistTemplateItemRouter.patch("/:id", requireRole("ADMIN", "PC"), checklistTemplateController.updateItem)
checklistTemplateItemRouter.delete("/:id", requireRole("ADMIN", "PC"), checklistTemplateController.removeItem)