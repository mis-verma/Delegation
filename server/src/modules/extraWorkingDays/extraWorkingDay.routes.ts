import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { extraWorkingDayController } from "./extraWorkingDay.controller.js"

// Mounted at /extra-working-days in app.ts. Same gate as Holidays: an admin job (ADMIN/PC).
export const extraWorkingDayRouter = Router()
extraWorkingDayRouter.use(authenticate, requireRole("ADMIN", "PC"))
extraWorkingDayRouter.get("/", extraWorkingDayController.list)
extraWorkingDayRouter.post("/", extraWorkingDayController.create)
extraWorkingDayRouter.delete("/:id", extraWorkingDayController.remove)
