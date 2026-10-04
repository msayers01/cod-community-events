import { loadRootEnv } from "@cod/db";
loadRootEnv();
import { initSentry } from "./sentry.js";
initSentry("worker");
import { prisma } from "@cod/db";
import { processOutboxBatch } from "./outbox.js";
import { closeOcr, redis, startTimerWorker, timerQueue } from "./jobs.js";

const OUTBOX_INTERVAL_MS = 1000;

async function main() {
  const connection = redis();
  const queue = timerQueue(connection);
  const worker = startTimerWorker(connection);
  worker.on("failed", (job, err) =>
    console.error(`[timers] ${job?.data.kind} failed: ${err.message}`),
  );

  // Repeatable sweep every 30s (idempotent; BullMQ dedupes by job id).
  await queue.upsertJobScheduler(
    "sweep-check-in",
    { every: 30_000 },
    { name: "sweep", data: { kind: "sweep-check-in" } },
  );

  // Phase 2 sweeps were previously triggered elsewhere; Phase 3 schedules its own here.
  await queue.upsertJobScheduler(
    "sweep-screenshot-readings",
    { every: 15_000 },
    { name: "sweep", data: { kind: "sweep-screenshot-readings" } },
  );
  await queue.upsertJobScheduler(
    "sweep-leaderboards",
    { every: 10 * 60_000 },
    { name: "sweep", data: { kind: "sweep-leaderboards" } },
  );

  console.log("[worker] started");
  let running = true;
  const stop = async () => {
    running = false;
    await worker.close();
    await closeOcr();
    await queue.close();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      const n = await processOutboxBatch();
      if (n === 0) await new Promise((r) => setTimeout(r, OUTBOX_INTERVAL_MS));
    } catch (err) {
      console.error("[outbox] loop error", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
