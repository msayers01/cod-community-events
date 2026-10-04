import { Redis } from "ioredis";
import { REDIS_CHANNEL, type Envelope } from "./protocol.js";

export interface Publisher {
  publish(envelope: Envelope): Promise<void>;
  close(): Promise<void>;
}

/**
 * Fire-and-forget publisher. Real-time updates are best-effort: the database
 * is the source of truth and clients re-fetch on reconnect, so a failed
 * publish is logged, never thrown into the calling transaction.
 */
export function createPublisher(
  redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379",
): Publisher {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redis.on("error", (err) => console.warn(`[realtime] redis: ${err.message}`));
  let connecting: Promise<void> | null = null;
  const ensure = () => {
    if (redis.status === "ready") return Promise.resolve();
    connecting ??= redis
      .connect()
      .catch(() => undefined)
      .finally(() => (connecting = null));
    return connecting;
  };
  return {
    async publish(envelope) {
      try {
        await ensure();
        await redis.publish(REDIS_CHANNEL, JSON.stringify(envelope));
      } catch (err) {
        console.warn(
          `[realtime] publish failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    async close() {
      await redis.quit().catch(() => undefined);
    },
  };
}
