import { authenticate , requireRole } from "../../middleware/auth/auth.js";
import { departmentController } from "./department.controller.js";
import { Router } from "express";

export const departmentRouter = Router()

departmentRouter.use(authenticate)

departmentRouter.get("/", departmentController.list)
departmentRouter.get("/:id" , departmentController.getOne)

departmentRouter.post("/", requireRole("ADMIN", "PC"), departmentController.create)
departmentRouter.patch("/:id", requireRole("ADMIN", "PC"), departmentController.update)
departmentRouter.delete("/:id", requireRole("ADMIN"), departmentController.remove)

