import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth/auth.js";
import { reportController } from "./report.controller.js";

export const reportRouter = Router();

reportRouter.use(authenticate);
reportRouter.use(requireRole("ADMIN", "PC"));

reportRouter.get("/approval-tat", reportController.approvalTat);
reportRouter.get("/tickets/export", reportController.exportTickets);
reportRouter.get("/tasks/export", reportController.exportTasks);
reportRouter.get("/checklists/export", reportController.exportChecklists);
