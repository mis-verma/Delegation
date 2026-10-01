import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { holidayController } from "./holiday.controller.js"

// Mounted at /holidays in app.ts. Managing days off is an admin job (ADMIN/PC, same gate as the other
// admin lookups). "/bulk" is registered before "/:id" so Express doesn't read it as an id.
export const holidayRouter = Router()
holidayRouter.use(authenticate, requireRole("ADMIN", "PC"))
holidayRouter.get("/", holidayController.list)
holidayRouter.post("/bulk", holidayController.createMany)
holidayRouter.post("/", holidayController.create)
holidayRouter.delete("/:id", holidayController.remove)
