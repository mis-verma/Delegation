import { Router } from "express"
import { todoController } from "./todo.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"

export const todoRouter = Router()
todoRouter.use(authenticate) // personal to-dos — just needs to be logged in, no role restriction

todoRouter.get("/", todoController.list)
todoRouter.get("/summary", todoController.summary)
todoRouter.post("/", todoController.create)
todoRouter.patch("/:id", todoController.update)
todoRouter.delete("/:id", todoController.remove)
