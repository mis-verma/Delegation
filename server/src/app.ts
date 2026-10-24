import express, { type Application, type Request, type Response } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import path from "node:path"
import { env } from "./config/env.js"
import { pingDB } from "./config/db.js"
import { isDraining } from "./config/lifecycle.js"
import { discardUploadsOnFailure } from "./middleware/uploadCleanup.js"
import { dropScoresOnWrite } from "./modules/scores/scoreCache.js"
import { queryCacheStatus } from "./config/queryCache.js"
import { createAuthRouter } from "./middleware/auth/auth.routes.js"
import { userRouter } from "./modules/users/user.routes.js"
import { viewAsRouter } from "./modules/viewAs/viewAs.routes.js"
import { errorHandler } from "./middleware/errorHandler/errorHandler.js"
import { StoreRouter } from "./modules/stores/store.routes.js"
import { departmentRouter } from "./modules/departments/department.routes.js"
import { holidayRouter } from "./modules/holidays/holiday.routes.js"
import { extraWorkingDayRouter } from "./modules/extraWorkingDays/extraWorkingDay.routes.js"
import { dressTypeRouter } from "./modules/dressTypes/dressType.routes.js"
import { systemHealthRouter } from "./modules/health/health.routes.js"
import { requestTimer } from "./modules/health/requestStats.js"
import { categoryRouter } from "./modules/categories/category.routes.js"
import { taskRouter } from "./modules/tasks/task.routes.js"
import { tagRouter } from "./modules/tags/tag.routes.js"
import { projectRouter } from "./modules/projects/project.routes.js"
import { auditRouter } from "./modules/audit/audit.routes.js"
import { ticketRouter } from "./modules/tickets/ticket.routes.js"
import { exceptionRouter } from "./modules/exceptions/exception.routes.js"
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
import { checklistReportRouter } from "./modules/checklistReports/checklistReport.routes.js"
import { scoreRouter } from "./modules/scores/score.routes.js"
import { activityRouter } from "./modules/activity/activity.routes.js"
import { eventRouter } from "./modules/events/event.routes.js"
import { smartTaskConversationRouter } from "./modules/smartTaskConversations/smartTaskConversation.routes.js"
import { todoRouter } from "./modules/todos/todo.routes.js"
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js"
import { draftRouter } from "./modules/drafts/draft.routes.js"
import { createApiLimiter, createAiLimiter , createWebhookLimiter } from "./middleware/rateLimiter/rateLimiter.js"
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes.js"
import { doubletickRouter } from "./modules/doubletick/doubletick.routes.js"
import helmet from "helmet"
import compression from "compression"
import type { Store } from "express-rate-limit"
import { verifyUploadSignature, signUploadPathsDeep } from "./utils/signedUpload.js"

const DEV_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;

morgan.token<Request, Response>('url', (req) => (req.originalUrl ?? req.url ?? '').replace(/\?.*$/, '').replace(/^(\/doubletick\/webhook\/)[^/]+/, '$1[redacted]'));

class App {
    public app: Application;

    constructor(rateLimitStoreFactory? : (prefix: string) => Store) {
        this.app = express()
        this.initMiddlewares(rateLimitStoreFactory)
        this.initRoutes(rateLimitStoreFactory)
        this.initErrorHandling()
    }

    private initMiddlewares(rateLimitStoreFactory?: (prefix: string) => Store): void {
        this.app.set("trust proxy", env.TRUST_PROXY_HOPS);
        this.app.use(helmet({
            crossOriginResourcePolicy : { policy : "cross-origin"} 
        }))
        this.app.use(requestTimer)
        this.app.use(compression())
        this.app.use(cors({
            origin: (origin, callback) => {
                if (!origin || origin === env.CLIENT_URL) return callback(null, true);
                if (env.NODE_ENV !== 'production' && DEV_ORIGIN_PATTERN.test(origin)) return callback(null, true);
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
        }))
        this.app.use(express.json({
            limit: '1mb',
            verify: (req, _res, buf) => { (req as Request).rawBody = buf; },
        }))

        this.app.use(cookieParser())
        this.app.use(discardUploadsOnFailure)
        this.app.set("etag", false)
        if (env.NODE_ENV != 'test') this.app.use(morgan('dev'))
        this.app.use(createApiLimiter(rateLimitStoreFactory?.('api')))

        this.app.use('/uploads', (req: Request, res: Response, next) => {
            const fullPath = `/uploads${req.path}`
            if (!verifyUploadSignature(fullPath, req.query.exp, req.query.sig)) {
                res.status(403).json({ success: false, message: 'This link has expired. Reopen the page to get a fresh one.' })
                return
            }
            next()
        }, express.static(path.resolve('uploads')))

        this.app.use((_req: Request, res: Response, next) => {
            const originalJson = res.json.bind(res)
            res.json = ((body?: unknown) => originalJson(signUploadPathsDeep(body))) as typeof res.json
            next()
        })
    }

    private initRoutes(rateLimitStoreFactory?: (prefix: string) => Store): void {
        this.app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

        this.app.get('/health/ready', async (_req: Request, res: Response) => {
            const db = await pingDB();
            const redis = queryCacheStatus();
            const draining = isDraining();
            const status = draining ? 'draining' : db.ok ? 'ok' : 'degraded';
            res.status(db.ok && !draining ? 200 : 503).json({
                status,
                checks: {
                    database: db.ok ? { status: 'ok', latencyMs: db.latencyMs } : { status: 'down' },
                    redis: { status: redis },
                },
            });
        });
        this.app.use('/auth', createAuthRouter(rateLimitStoreFactory));
        this.app.use('/users', dropScoresOnWrite, userRouter);
        this.app.use('/view-as', viewAsRouter);
        this.app.use('/stores', dropScoresOnWrite, StoreRouter);
        this.app.use('/departments', dropScoresOnWrite, departmentRouter);
        this.app.use('/holidays', dropScoresOnWrite, holidayRouter);
        this.app.use('/extra-working-days', dropScoresOnWrite, extraWorkingDayRouter);
        this.app.use('/dress-types', dressTypeRouter);
        this.app.use('/system-health', systemHealthRouter);
        this.app.use('/categories', categoryRouter);

        this.app.use('/tasks/ai', createAiLimiter(rateLimitStoreFactory?.('ai')));
        this.app.use('/tasks', dropScoresOnWrite, taskRouter);
        this.app.use('/tags', tagRouter);
        this.app.use('/projects', projectRouter)

        this.app.use('/tickets', dropScoresOnWrite, ticketRouter);
        this.app.use('/exceptions', exceptionRouter);
        this.app.use('/ticket-attachments', ticketAttachmentRouter);
        this.app.use('/checklists', dropScoresOnWrite, checklistRouter);
        this.app.use('/checklist-items', dropScoresOnWrite, checklistItemRouter);
        this.app.use('/checklist-images', checklistImageRouter);
        this.app.use('/checklist-templates', checklistTemplateRouter);
        this.app.use('/checklist-template-items', checklistTemplateItemRouter);
        this.app.use('/checklist-definitions', dropScoresOnWrite, checklistDefinitionRouter);
        this.app.use('/checklist-instances', dropScoresOnWrite, checklistInstanceRouter);
        this.app.use('/checklist-instance-items', dropScoresOnWrite, checklistInstanceItemRouter);
        this.app.use('/checklist-instance-images', checklistInstanceImageRouter);
        this.app.use('/checklist-instance-item-submissions', dropScoresOnWrite, checklistInstanceItemSubmissionRouter);
        this.app.use('/checklist-instance-item-submission-images', checklistInstanceItemSubmissionImageRouter);

        this.app.use('/task-checklists', dropScoresOnWrite, taskChecklistRouter);
        this.app.use('/task-checklist-items', dropScoresOnWrite, taskChecklistItemRouter);
        this.app.use('/task-images', taskImageRouter);
        this.app.use('/task-attachments', taskAttachmentRouter);

        this.app.use("/audit-logs", auditRouter)

        this.app.use("/settings" , settingsRouter)

        this.app.use('/whatsapp/webhook', createWebhookLimiter(rateLimitStoreFactory?.('webhook-whatsapp')));
        this.app.use('/whatsapp', whatsappRouter);
        this.app.use('/doubletick/webhook', createWebhookLimiter(rateLimitStoreFactory?.('webhook-doubletick')));
        this.app.use('/doubletick', doubletickRouter);

        this.app.use("/notifications", notificationRouter)
        this.app.use("/reports", reportRouter)
        this.app.use("/checklist-reports", checklistReportRouter)
        this.app.use("/scores", scoreRouter)
        this.app.use("/activity", activityRouter)
        this.app.use("/events", eventRouter)
        this.app.use("/smart-task-conversations", smartTaskConversationRouter)
        this.app.use("/todos", todoRouter)
        this.app.use("/dashboard", dashboardRouter)
        this.app.use("/drafts", draftRouter)
        this.app.use((_req: Request, res: Response) => res.status(404).json({ success: false, message: 'Not found' }))
    }

    private initErrorHandling(): void {
        this.app.use(errorHandler)
    }
}

export default App;
