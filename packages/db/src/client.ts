import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

declare global {
  // eslint-disable-next-line no-var
  var __codPrisma: PrismaClient | undefined;
}

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalThis.__codPrisma) globalThis.__codPrisma = createPrismaClient();
  return globalThis.__codPrisma;
}

/**
 * Process-wide lazy singleton. Nothing connects until the first query, so
 * importing this module at build time (e.g. Next.js page-data collection)
 * does not require DATABASE_URL. Safe across Next.js hot reloads.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
