import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { dressTypeController } from "./dressType.controller.js"

// Mounted at /dress-types in app.ts. Admin lookup, same ADMIN/PC gate as holidays.
export const dressTypeRouter = Router()
dressTypeRouter.use(authenticate, requireRole("ADMIN", "PC"))
dressTypeRouter.get("/", dressTypeController.list)
dressTypeRouter.post("/", dressTypeController.create)
dressTypeRouter.patch("/:id", dressTypeController.update)
dressTypeRouter.delete("/:id", dressTypeController.remove)
