import { prisma, emit } from "@cod/db";

/** Expire active blacklist entries past their expiry date. Idempotent. */
export async function expireBlacklistEntries(): Promise<number> {
  const due = await prisma.blacklistEntry.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    select: { id: true, userId: true },
  });
  for (const e of due) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.blacklistEntry.findUnique({ where: { id: e.id } });
      if (!fresh || fresh.status !== "ACTIVE") return;
      await tx.blacklistEntry.update({ where: { id: e.id }, data: { status: "EXPIRED" } });
      await emit(tx, { type: "ReputationChanged", userId: e.userId });
    });
  }
  return due.length;
}
