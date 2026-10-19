import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js";
import { categoryController } from "./category.controller.js";

export const categoryRouter = Router()

categoryRouter.use(authenticate)

categoryRouter.get("/", categoryController.list)
categoryRouter.get("/:id", categoryController.getOne)

categoryRouter.post("/", requireRole("ADMIN", "PC"), categoryController.create)
categoryRouter.patch("/:id", requireRole("ADMIN", "PC"), categoryController.update)
categoryRouter.delete("/:id", requireRole("ADMIN", "PC"), categoryController.remove)