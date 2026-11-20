import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { customRoleController } from "./customRole.controller.js"
import { Router } from "express"

export const customRoleRouter = Router()

customRoleRouter.use(authenticate)

customRoleRouter.get("/", customRoleController.list)
customRoleRouter.get("/:id", customRoleController.getOne)

customRoleRouter.post("/", requireRole("ADMIN"), customRoleController.create)
customRoleRouter.patch("/:id", requireRole("ADMIN"), customRoleController.update)
customRoleRouter.delete("/:id", requireRole("ADMIN"), customRoleController.remove)
