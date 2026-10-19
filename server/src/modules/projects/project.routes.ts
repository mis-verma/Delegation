import { Router } from "express"
import { projectController } from "./project.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"

export const projectRouter = Router()

projectRouter.use(authenticate)

projectRouter.get("/", projectController.list)
projectRouter.get("/:id" , projectController.getOne)
projectRouter.post("/" , projectController.create)
projectRouter.patch("/:id" , projectController.update);
projectRouter.delete("/:id" , projectController.remove)