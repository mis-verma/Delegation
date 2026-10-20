import cluster from "node:cluster";
import os from "node:os";
import http from "node:http";
import type { Server } from "node:http";
import { setupMaster, setupWorker } from "@socket.io/sticky";
import App from "./src/app.js";
import { connectDB, disconnectDB } from "./src/config/db.js";
import { env } from "./src/config/env.js";
import { initSocket } from "./src/sockets/socket.js";
import { createRedisRateLimitStoreFactory, disconnectRedisClients } from "./src/config/redis.js";
import { disconnectQueryCache, warmQueryCache } from "./src/config/queryCache.js";
import { startSlaSweep } from "./src/jobs/slaSweep.job.js";
import { startChecklistInstanceGenerator } from "./src/jobs/checklistInstanceGenerator.job.js";
import { startChecklistOverdueNotifier } from "./src/jobs/checklistOverdueNotifier.job.js";
import { startChecklistDraftReminder, startChecklistApprovalReminder } from "./src/jobs/checklistDraftReminder.job.js";
import { startTaskDeadlineReminder } from "./src/jobs/taskDeadlineReminder.job.js";
import { startAuditRetention } from "./src/jobs/auditRetention.job.js";
import { startDataBackup } from "./src/jobs/dataBackup.job.js";
import { startAuthTokenPurge } from "./src/jobs/authTokenPurge.job.js";
import { startScoreDataCheck } from "./src/jobs/scoreDataCheck.job.js";
import { presenceService } from "./src/modules/presence/presence.service.js";
import { startNotificationRetention } from "./src/jobs/notificationRetention.job.js";
import { startOverdueSnapshot } from "./src/jobs/overdueSnapshot.job.js";
import { startNotificationDigest } from "./src/jobs/notificationDigest.job.js";
import { startInboundMessageRetention } from "./src/jobs/inboundMessageRetention.job.js";
import { startPendingConversationRetention } from "./src/jobs/pendingConversationRetention.job.js";
import { settingsService } from "./src/modules/settings/settings.service.js";

class ServerBootstrap {
  private appInstance!: App;
  private httpServer?: Server;

  public async start(): Promise<void> {
    await connectDB();
    await settingsService.init()
    warmQueryCache();

    const rateLimitStoreFactory = workerCount > 1 ? await createRedisRateLimitStoreFactory() : undefined;
    this.appInstance = new App(rateLimitStoreFactory);

    this.httpServer = http.createServer(this.appInstance.app);
    this.httpServer.requestTimeout = 30_000;
    this.httpServer.headersTimeout = 35_000;
    const io = await initSocket(this.httpServer, workerCount > 1);

    const isCronOwner = !cluster.isWorker || cluster.worker?.id === 1;
    if (isCronOwner) {
      startSlaSweep();
      startChecklistInstanceGenerator();
      startChecklistOverdueNotifier();
      startChecklistDraftReminder();
      startChecklistApprovalReminder();
      startTaskDeadlineReminder();
      startAuditRetention();
      startDataBackup();
      startAuthTokenPurge();
      startScoreDataCheck();
      void presenceService.clearStale();
      startNotificationRetention();
      startOverdueSnapshot();
      startNotificationDigest();
      startInboundMessageRetention();
      startPendingConversationRetention();
    }

    if (cluster.isWorker) {
      setupWorker(io);
      console.log(`Server ready (worker ${cluster.worker?.id})`);
    } else {
      this.httpServer.listen(env.PORT, () => {
        console.log(`Server listening on http://localhost:${env.PORT} (single process)`);
      });
    }

    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  private shutdown(): void {
    console.log("Shutting down server...");

    setTimeout(() => process.exit(1), 15_000).unref();

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

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

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

  const httpServer = http.createServer();
  setupMaster(httpServer, { loadBalancingMethod: "round-robin" });
  cluster.setupPrimary({ serialization: "advanced" });
  httpServer.listen(env.PORT, () => {
    console.log(`Sticky primary listening on http://localhost:${env.PORT}`);
  });

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
