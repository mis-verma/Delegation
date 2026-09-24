import cluster from "node:cluster";
import os from "node:os";
import http from "node:http";
import type { Server } from "node:http";
import App from "./src/app.js";
import { connectDB, disconnectDB } from "./src/config/db.js";
import { env } from "./src/config/env.js";
import { initSocket } from "./src/sockets/socket.js";
import { createRedisRateLimitStoreFactory, disconnectRedisClients } from "./src/config/redis.js";
import { disconnectQueryCache, warmQueryCache } from "./src/config/queryCache.js";
import { startSlaSweep } from "./src/jobs/slaSweep.job.js";
import { startChecklistInstanceGenerator } from "./src/jobs/checklistInstanceGenerator.job.js";
import { startChecklistOverdueNotifier } from "./src/jobs/checklistOverdueNotifier.job.js";
import { startChecklistDraftReminder } from "./src/jobs/checklistDraftReminder.job.js";
import { startTaskDeadlineReminder } from "./src/jobs/taskDeadlineReminder.job.js";
import { startAuditRetention } from "./src/jobs/auditRetention.job.js";
import { startNotificationRetention } from "./src/jobs/notificationRetention.job.js";
import { startInboundMessageRetention } from "./src/jobs/inboundMessageRetention.job.js";
import { startPendingConversationRetention } from "./src/jobs/pendingConversationRetention.job.js";
import { settingsService } from "./src/modules/settings/settings.service.js";

class ServerBootstrap {
  private appInstance!: App;
  private httpServer?: Server;

  public async start(): Promise<void> {
    await connectDB();
    await settingsService.init()
    // Not awaited — starts the query-cache Redis handshake in the background as early as possible
    // in boot, so it's likely already connected (or already backed off) by the time the first real
    // request needs it, instead of that request paying the full connect cost itself (see
    // queryCache.ts's CONNECT_WAIT_MS comment for the request-time half of this fix).
    warmQueryCache();

    const rateLimitStoreFactory = workerCount > 1 ? await createRedisRateLimitStoreFactory() : undefined;
    this.appInstance = new App(rateLimitStoreFactory);

    this.httpServer = http.createServer(this.appInstance.app);
    await initSocket(this.httpServer, workerCount > 1);

    const isCronOwner = !cluster.isWorker || cluster.worker?.id === 1;
    if (isCronOwner) {
      startSlaSweep();
      startChecklistInstanceGenerator();
      startChecklistOverdueNotifier();
      startChecklistDraftReminder();
      startTaskDeadlineReminder();
      startAuditRetention();
      startNotificationRetention();
      startInboundMessageRetention();
      startPendingConversationRetention();
    }

    this.httpServer.listen(env.PORT, () => {
      const label = cluster.isWorker ? `worker ${cluster.worker?.id}` : "single process";
      console.log(`Server listening on http://localhost:${env.PORT} (${label})`);
    });

    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  private shutdown(): void {
    console.log("Shutting down server...");

    this.httpServer?.close(async () => {
      try {
        await disconnectDB();
        await Promise.all([disconnectRedisClients(), disconnectQueryCache()]);
        console.log("Database and Redis disconnected.");
      } catch (error) {
        console.error("Error while disconnecting:", error);
      } finally {
        process.exit(0);
      }
    });
  }
}

const bootstrap = () => {
  new ServerBootstrap()
    .start()
    .catch((err) => {
      console.error("Failed to start server:", err);
      process.exit(1);
    });
};

const forkWorkerPool = (workerCount: number) => {
  console.log(`Primary ${process.pid} forking ${workerCount} workers...`);
  for (let i = 0; i < workerCount; i++) cluster.fork();

  cluster.on("exit", (worker, code, signal) => {
    console.error(`Worker ${worker.id} died (code ${code}, signal ${signal}) — forking a replacement.`);
    cluster.fork();
  });
};

const workerCount = env.NODE_ENV === "production" ? (env.CLUSTER_WORKERS ?? os.cpus().length) : (env.CLUSTER_WORKERS ?? 1);
const isPrimaryOrchestrator = workerCount > 1 && cluster.isPrimary;

const CLUSTER_ROLE_ACTIONS = new Map<boolean, () => void>([
  [true, () => forkWorkerPool(workerCount)],
  [false, bootstrap],
]);

CLUSTER_ROLE_ACTIONS.get(isPrimaryOrchestrator)!();
