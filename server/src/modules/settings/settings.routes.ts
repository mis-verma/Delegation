import { Router } from "express"
import { settingsController } from "./settings.controller.js"
import { authenticate , requireRole } from "../../middleware/auth/auth.js"
import { logoUpload } from "../../config/upload.js"

export const settingsRouter = Router()

settingsRouter.get("/status", settingsController.status)

settingsRouter.use(authenticate)

settingsRouter.get("/", requireRole("ADMIN", "PC"), settingsController.get)
settingsRouter.patch("/", requireRole("ADMIN", "PC"), settingsController.update)
settingsRouter.post("/logo", requireRole("ADMIN", "PC"), logoUpload, settingsController.uploadLogo)
settingsRouter.delete("/logo", requireRole("ADMIN", "PC"), settingsController.removeLogo)