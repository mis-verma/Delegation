import express, { type Application, type Request, type Response } from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import path from "node:path"
import { env } from "./config/env.js"
import { pingDB } from "./config/db.js"
import { queryCacheStatus } from "./config/queryCache.js"
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

const DEV_ORIGIN_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;

// DoubleTick has no signature-header handshake (see doubletick.routes.ts) — the webhook's own auth
// secret has to live in its URL path instead, which morgan's default `:url` token would otherwise
// print verbatim to the access log on every single request (including failed 401s from someone
// probing the URL). Overriding the token here masks that one path shape everywhere morgan is used,
// with no effect on any other route's logged URL.
morgan.token<Request, Response>('url', (req) => (req.originalUrl ?? req.url ?? '').replace(/^(\/doubletick\/webhook\/)[^/?]+/, '$1[redacted]'));

class App {
    public app: Application;

    // Takes the store *factory*, not a single Store — six different limiters below each need
    // their own Store instance (express-rate-limit rejects two limiters sharing one), so every
    // call site below invokes this with its own unique prefix. See config/redis.ts's own comment.
    constructor(rateLimitStoreFactory? : (prefix: string) => Store) {
        this.app = express()
        this.initMiddlewares(rateLimitStoreFactory)
        this.initRoutes(rateLimitStoreFactory)
        this.initErrorHandling()
    }

    private initMiddlewares(rateLimitStoreFactory?: (prefix: string) => Store): void {
        this.app.set("trust proxy", 1);
        this.app.use(helmet({
            crossOriginResourcePolicy : { policy : "cross-origin"} 
        }))
        this.app.use(compression())
        this.app.use(cors({
            origin: (origin, callback) => {
                // No Origin header: same-origin requests, curl, and native mobile clients
                // (React Native's fetch doesn't send/enforce Origin — CORS is a browser thing).
                if (!origin || origin === env.CLIENT_URL) return callback(null, true);
                // Outside production, also allow any localhost/LAN-IP origin regardless of port,
                // so the web-client Vite port and the mobile app's Expo web-preview port (and a
                // physical device reaching this machine's LAN IP) all work without env changes.
                if (env.NODE_ENV !== 'production' && DEV_ORIGIN_PATTERN.test(origin)) return callback(null, true);
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
        }))
        this.app.use(express.json({
            verify: (req, _res, buf) => { (req as any).rawBody = buf; },
        }))

        this.app.use(cookieParser())
        this.app.set("etag", false)
        if (env.NODE_ENV != 'test') this.app.use(morgan('dev'))
        this.app.use(createApiLimiter(rateLimitStoreFactory?.('api')))
        this.app.use('/uploads', express.static(path.resolve('uploads')))
    }

    private initRoutes(rateLimitStoreFactory?: (prefix: string) => Store): void {
        // Liveness only — "is the process up and responding at all." Deliberately does no I/O
        // (no DB/Redis round-trip) so a process manager polling this frequently never itself adds
        // load or turns a slow-but-fine DB query into a false "unhealthy, restart me" signal.
        this.app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

        // Readiness — "can this instance actually serve requests right now." Unlike /health above,
        // this does real I/O on purpose: a load balancer/orchestrator uses this one to decide
        // whether to route traffic here, which is exactly the question a DB check answers and a
        // liveness check doesn't. DB failing means real 503 (nothing works without it); Redis
        // failing is reported but never fails the check — every Redis-backed feature in this app
        // (query cache, rate limiting) is already built to degrade gracefully without it, so a
        // readiness probe that failed on a down cache would restart/de-route a perfectly capable
        // instance over something that isn't actually broken.
        this.app.get('/health/ready', async (_req: Request, res: Response) => {
            const db = await pingDB();
            const redis = queryCacheStatus();
            const status = db.ok ? 'ok' : 'degraded';
            res.status(db.ok ? 200 : 503).json({
                status,
                checks: {
                    database: db.ok ? { status: 'ok', latencyMs: db.latencyMs } : { status: 'down', error: db.error },
                    redis: { status: redis },
                },
            });
        });
        this.app.use('/auth', createAuthRouter(rateLimitStoreFactory));
        this.app.use('/users', userRouter);
        this.app.use('/stores', StoreRouter);
        this.app.use('/departments', departmentRouter);
        this.app.use('/categories', categoryRouter);

        this.app.use('/tasks/ai', createAiLimiter(rateLimitStoreFactory?.('ai')));
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

        this.app.use('/whatsapp/webhook', createWebhookLimiter(rateLimitStoreFactory?.('webhook-whatsapp')));
        this.app.use('/whatsapp', whatsappRouter);
        this.app.use('/doubletick/webhook', createWebhookLimiter(rateLimitStoreFactory?.('webhook-doubletick')));
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
