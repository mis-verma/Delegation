import { Router } from "express"
import { todoController } from "./todo.controller.js"
import { authenticate } from "../../middleware/auth/auth.js"
import { checklistBulkImportUpload } from "../../config/upload.js"

export const todoRouter = Router()
todoRouter.use(authenticate)

todoRouter.get("/", todoController.list)
todoRouter.get("/summary", todoController.summary)
todoRouter.post("/", todoController.create)
todoRouter.post("/clear-completed", todoController.clearCompleted)
todoRouter.post("/restore", todoController.restore)
todoRouter.post("/import/preview", checklistBulkImportUpload, todoController.importPreview)
todoRouter.post("/import", todoController.importMany)
todoRouter.patch("/:id", todoController.update)
todoRouter.delete("/:id", todoController.remove)
