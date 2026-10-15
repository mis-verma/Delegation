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
import { holidayRouter } from "./modules/holidays/holiday.routes.js"
import { extraWorkingDayRouter } from "./modules/extraWorkingDays/extraWorkingDay.routes.js"
import { dressTypeRouter } from "./modules/dressTypes/dressType.routes.js"
import { systemHealthRouter } from "./modules/health/health.routes.js"
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
import { createApiLimiter, createAiLimiter , createWebhookLimiter } from "./middleware/rateLimiter/rateLimiter.js"
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes.js"
import { doubletickRouter } from "./modules/doubletick/doubletick.routes.js"
import helmet from "helmet"
import compression from "compression"
import type { Store } from "express-rate-limit"
import { verifyUploadSignature, signUploadPathsDeep } from "./utils/signedUpload.js"

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
        this.app.set("trust proxy", env.TRUST_PROXY_HOPS);
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

        // Every `/uploads/...` path this API ever hands out in a JSON response gets a
        // short-lived signature appended (signUploadPathsDeep, utils/signedUpload.ts) before it
        // reaches the browser — this is what actually checks that signature before serving the
        // file. A request with no signature, a wrong one, or an expired one never reaches
        // express.static at all, so a photo/attachment link that leaked out (forwarded
        // screenshot, browser history) stops working once it expires instead of staying open
        // forever. `req.path` here is already relative to the '/uploads' mount, so it's
        // prefixed back to match exactly what signUploadPath signed.
        this.app.use('/uploads', (req: Request, res: Response, next) => {
            const fullPath = `/uploads${req.path}`
            if (!verifyUploadSignature(fullPath, req.query.exp, req.query.sig)) {
                return res.status(403).json({ success: false, message: 'This link has expired. Reopen the page to get a fresh one.' })
            }
            next()
        }, express.static(path.resolve('uploads')))

        // Signs every embedded `/uploads/...` path in every JSON response, org-wide, so none of
        // the ~12 modules that write one of these paths (avatars, logos, checklist/ticket/task
        // photos and attachments, ...) need to remember to sign it themselves — see
        // signUploadPathsDeep's own comment for why a response-shape-agnostic deep walk was
        // chosen over touching each module. Registered before initRoutes() below so every route
        // handler's res.json is already wrapped by the time it runs.
        this.app.use((_req: Request, res: Response, next) => {
            const originalJson = res.json.bind(res)
            // `any` here matches Express's own `Response.json(body?: any)` signature — there's no
            // narrower type to give a function meant to sign whatever shape any route returns.
            res.json = ((body?: any) => originalJson(signUploadPathsDeep(body))) as typeof res.json
            next()
        })
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
        this.app.use('/holidays', holidayRouter);
        this.app.use('/extra-working-days', extraWorkingDayRouter);
        this.app.use('/dress-types', dressTypeRouter);
        this.app.use('/system-health', systemHealthRouter);
        this.app.use('/categories', categoryRouter);

        this.app.use('/tasks/ai', createAiLimiter(rateLimitStoreFactory?.('ai')));
        this.app.use('/tasks', taskRouter);
        this.app.use('/tags', tagRouter);
        this.app.use('/projects', projectRouter)

        this.app.use('/tickets', ticketRouter);
        this.app.use('/exceptions', exceptionRouter);
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
        this.app.use("/checklist-reports", checklistReportRouter)
        this.app.use("/scores", scoreRouter)
        this.app.use("/activity", activityRouter)
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
