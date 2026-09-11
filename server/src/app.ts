import express, { type Application, type Request, type Response } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import path from "node:path"
import { env } from "./config/env.js"
import { createAuthRouter } from "./middleware/auth/auth.routes.js"
import { userRouter } from "./modules/users/user.routes.js"
import { errorHandler } from "./middleware/errorHandler/errorHandler.js"
import { StoreRouter } from "./modules/stores/store.routes.js"
import { departmentRouter } from "./modules/departments/department.routes.js"
import { categoryRouter } from "./modules/categories/category.routes.js"
import { taskRouter } from "./modules/tasks/task.routes.js"
import { tagRouter } from "./modules/tags/tag.routes.js"
import { projectRouter } from "./modules/projects/project.routes.js"
import { auditRouter } from "./modules/audit/audit.routes.js"
import { ticketRouter } from "./modules/tickets/ticket.routes.js"
import { checklistRouter, checklistItemRouter } from "./modules/checklists/checklist.routes.js"
import { taskChecklistRouter, taskChecklistItemRouter } from "./modules/taskChecklists/taskChecklist.routes.js"
import { taskImageRouter } from "./modules/taskImages/taskImage.routes.js"
import { taskAttachmentRouter } from "./modules/taskAttachments/taskAttachment.routes.js"
import { checklistImageRouter } from "./modules/checklistImages/checklistImage.routes.js"
import { ticketAttachmentRouter } from "./modules/ticketAttachments/ticketAttachment.routes.js"
import { checklistTemplateRouter, checklistTemplateItemRouter } from "./modules/checklistTemplates/checklistTemplate.routes.js"
import { checklistDefinitionRouter } from "./modules/checklistDefinitions/checklistDefinition.routes.js"
import { checklistInstanceRouter, checklistInstanceItemRouter } from "./modules/checklistInstances/checklistInstance.routes.js"
import { checklistInstanceImageRouter } from "./modules/checklistInstanceImages/checklistInstanceImage.routes.js"
import { checklistInstanceItemSubmissionRouter } from "./modules/checklistInstanceItemSubmissions/checklistInstanceItemSubmission.routes.js"
import { checklistInstanceItemSubmissionImageRouter } from "./modules/checklistInstanceItemSubmissionImages/checklistInstanceItemSubmissionImage.routes.js"
import { notificationRouter } from "./modules/notifications/notification.routes.js"
import { settingsRouter } from "./modules/settings/settings.routes.js"
import { reportRouter } from "./modules/reports/report.routes.js"
import { eventRouter } from "./modules/events/event.routes.js"
import { smartTaskConversationRouter } from "./modules/smartTaskConversations/smartTaskConversation.routes.js"
import { todoRouter } from "./modules/todos/todo.routes.js"
import { createApiLimiter, createAiLimiter , createWebhookLimiter } from "./middleware/rateLimiter/rateLimiter.js"
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes.js"
import { doubletickRouter } from "./modules/doubletick/doubletick.routes.js"
import helmet from "helmet"
import compression from "compression"
import type { Store } from "express-rate-limit"


class App {
    public app: Application;

    constructor(rateLimitStore? : Store) {
        this.app = express()
        this.initMiddlewares(rateLimitStore)
        this.initRoutes(rateLimitStore)
        this.initErrorHandling()
    }

    private initMiddlewares(rateLimitStore?:Store): void {
        this.app.set("trust proxy", 1);
        this.app.use(helmet({
            crossOriginResourcePolicy : { policy : "cross-origin"} 
        }))
        this.app.use(compression())
        this.app.use(cors({ origin: env.CLIENT_URL, credentials: true }))
        this.app.use(express.json({
            verify: (req, _res, buf) => { (req as any).rawBody = buf; },
        }))

        this.app.use(cookieParser())
        this.app.set("etag", false)
        if (env.NODE_ENV != 'test') this.app.use(morgan('dev'))
        this.app.use(createApiLimiter(rateLimitStore))
        this.app.use('/uploads', express.static(path.resolve('uploads')))
    }

    private initRoutes(rateLimitStore?: Store): void {
        this.app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
        this.app.use('/auth', createAuthRouter(rateLimitStore));
        this.app.use('/users', userRouter);
        this.app.use('/stores', StoreRouter);
        this.app.use('/departments', departmentRouter);
        this.app.use('/categories', categoryRouter);

        this.app.use('/tasks/ai', createAiLimiter(rateLimitStore));
        this.app.use('/tasks', taskRouter);
        this.app.use('/tags', tagRouter);
        this.app.use('/projects', projectRouter)

        this.app.use('/tickets', ticketRouter);
        this.app.use('/ticket-attachments', ticketAttachmentRouter);
        this.app.use('/checklists', checklistRouter);
        this.app.use('/checklist-items', checklistItemRouter);
        this.app.use('/checklist-images', checklistImageRouter);
        this.app.use('/checklist-templates', checklistTemplateRouter);
        this.app.use('/checklist-template-items', checklistTemplateItemRouter);
        this.app.use('/checklist-definitions', checklistDefinitionRouter);
        this.app.use('/checklist-instances', checklistInstanceRouter);
        this.app.use('/checklist-instance-items', checklistInstanceItemRouter);
        this.app.use('/checklist-instance-images', checklistInstanceImageRouter);
        this.app.use('/checklist-instance-item-submissions', checklistInstanceItemSubmissionRouter);
        this.app.use('/checklist-instance-item-submission-images', checklistInstanceItemSubmissionImageRouter);

        this.app.use('/task-checklists', taskChecklistRouter);
        this.app.use('/task-checklist-items', taskChecklistItemRouter);
        this.app.use('/task-images', taskImageRouter);
        this.app.use('/task-attachments', taskAttachmentRouter);

        this.app.use("/audit-logs", auditRouter)

        this.app.use("/settings" , settingsRouter)

        this.app.use('/whatsapp/webhook', createWebhookLimiter(rateLimitStore));
        this.app.use('/whatsapp', whatsappRouter);
        this.app.use('/doubletick/webhook', createWebhookLimiter(rateLimitStore));
        this.app.use('/doubletick', doubletickRouter);


        this.app.use("/notifications", notificationRouter)
        this.app.use("/reports", reportRouter)
        this.app.use("/events", eventRouter)
        this.app.use("/smart-task-conversations", smartTaskConversationRouter)
        this.app.use("/todos", todoRouter)
        this.app.use((_req: Request, res: Response) => res.status(404).json({ success: false, message: 'Not found' }))
    }

    private initErrorHandling(): void {
        this.app.use(errorHandler)
    }
}

export default App;
