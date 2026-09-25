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
    const io = await initSocket(this.httpServer, workerCount > 1);

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

    if (cluster.isWorker) {
      // The primary owns PORT and sticky-routes each connection to a worker over IPC (see
      // forkWorkerPool) — this process must not bind PORT itself, only accept what's forwarded.
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

  // Socket.io's polling transport needs every request from one client to land on the same
  // worker — Node's cluster module round-robins raw connections across workers with no such
  // affinity, which is what produced "Session ID unknown" 400s in the browser once this ran
  // with more than one worker. The Redis adapter (see socket.ts) only fans *events* out across
  // workers; it doesn't make polling sticky. @socket.io/sticky fixes the actual routing: the
  // primary itself binds PORT, reads each connection's `sid` off the wire, and forwards it over
  // IPC to the worker that already owns that session (falling back to least-connection for a
  // brand-new session) — nginx and CloudPanel are untouched, they still just proxy to PORT.
  const httpServer = http.createServer();
  setupMaster(httpServer, { loadBalancingMethod: "least-connection" });
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
