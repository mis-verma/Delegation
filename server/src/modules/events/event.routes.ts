import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js";
import { eventController } from "./event.controller.js";

export const eventRouter = Router()

eventRouter.use(authenticate)

eventRouter.get("/", eventController.list)
eventRouter.get("/upcoming", eventController.listUpcoming)
eventRouter.get("/:id", eventController.getOne)

eventRouter.post("/", requireRole("ADMIN", "PC"), eventController.create)
eventRouter.patch("/:id", requireRole("ADMIN", "PC"), eventController.update)
eventRouter.delete("/:id", requireRole("ADMIN", "PC"), eventController.remove)
