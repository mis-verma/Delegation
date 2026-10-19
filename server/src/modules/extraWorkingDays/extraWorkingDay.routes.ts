import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { extraWorkingDayController } from "./extraWorkingDay.controller.js"

export const extraWorkingDayRouter = Router()
extraWorkingDayRouter.use(authenticate)
extraWorkingDayRouter.get("/mine", extraWorkingDayController.mine)
extraWorkingDayRouter.use(requireRole("ADMIN", "PC"))
extraWorkingDayRouter.get("/", extraWorkingDayController.list)
extraWorkingDayRouter.post("/", extraWorkingDayController.create)
extraWorkingDayRouter.delete("/:id", extraWorkingDayController.remove)
