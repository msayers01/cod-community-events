import { loadRootEnv, prisma } from "@cod/db";
import { createRealtimeServer } from "./server.js";

loadRootEnv();

const port = Number(process.env.REALTIME_PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const corsOrigins = (
  process.env.REALTIME_CORS_ORIGINS ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const server = createRealtimeServer({
  redisUrl,
  corsOrigins,
  overlayKeyExists: async (key) =>
    !!(await prisma.event.findUnique({ where: { overlayKey: key }, select: { id: true } })),
});

server.http.listen(port, () =>
  console.log(`[realtime] listening on :${port} (origins: ${corsOrigins.join(", ")})`),
);

const stop = async () => {
  await server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
