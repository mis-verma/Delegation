import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { holidayController } from "./holiday.controller.js"

export const holidayRouter = Router()
holidayRouter.use(authenticate, requireRole("ADMIN", "PC"))
holidayRouter.get("/", holidayController.list)
holidayRouter.get("/preview", holidayController.preview)
holidayRouter.post("/bulk", holidayController.createMany)
holidayRouter.post("/", holidayController.create)
holidayRouter.delete("/:id", holidayController.remove)
