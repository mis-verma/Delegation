import { Router } from "express"
import { authenticate, requireRole } from "../../middleware/auth/auth.js";
import { categoryController } from "./category.controller.js";
import { checklistBulkImportUpload } from "../../config/upload.js";

export const categoryRouter = Router()

categoryRouter.use(authenticate)

categoryRouter.get("/", categoryController.list)
categoryRouter.get("/tat-report", requireRole("ADMIN", "PC"), categoryController.tatReport)
categoryRouter.post("/history-import/preview", requireRole("ADMIN", "PC"), checklistBulkImportUpload, categoryController.historyPreview)
categoryRouter.get("/:id", categoryController.getOne)

categoryRouter.post("/", requireRole("ADMIN", "PC"), categoryController.create)
categoryRouter.patch("/:id", requireRole("ADMIN", "PC"), categoryController.update)
categoryRouter.post("/:id/subcategories", requireRole("ADMIN", "PC"), categoryController.createSubcategory)
categoryRouter.patch("/:id/subcategories/:subId", requireRole("ADMIN", "PC"), categoryController.updateSubcategory)
categoryRouter.delete("/:id/subcategories/:subId", requireRole("ADMIN", "PC"), categoryController.removeSubcategory)
categoryRouter.delete("/:id", requireRole("ADMIN"), categoryController.remove)