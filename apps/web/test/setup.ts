import { loadRootEnv, prisma } from "@cod/db";
import type { Actor } from "@cod/shared";
import { randomBytes } from "node:crypto";

loadRootEnv();

export const uid = () => randomBytes(6).toString("hex");

export async function makeUser(prefix = "u") {
  const n = `${prefix}_${uid()}`;
  return prisma.user.create({
    data: { name: n, email: `${n}@test.local`, displayName: n, activisionId: `${n}#1234567` },
  });
}

export async function makeStaff(role: "TRIAL_MODERATOR" | "MODERATOR" | "ADMIN") {
  const user = await makeUser("s");
  await prisma.staffRole.create({ data: { userId: user.id, role } });
  const actor: Actor = { userId: user.id, staffRole: role, isHoster: false };
  return { user, actor };
}

export async function makeHoster() {
  const user = await makeUser("h");
  await prisma.hosterProfile.create({ data: { userId: user.id } });
  const actor: Actor = { userId: user.id, staffRole: null, isHoster: true };
  return { user, actor };
}

export async function makeEvent(
  hosterId: string,
  overrides: Partial<{
    playerCap: number;
    teamSize: number;
    roundCount: number;
    status: "DRAFT" | "OPEN" | "CHECK_IN" | "LIVE";
  }> = {},
) {
  const startsAt = new Date(Date.now() + 3600_000);
  return prisma.event.create({
    data: {
      hosterId,
      title: "Test event",
      slug: `test-${uid()}`,
      mode: "SND",
      format: "SWITCHEROO",
      teamSize: overrides.teamSize ?? 2,
      roundCount: overrides.roundCount ?? 2,
      playerCap: overrides.playerCap ?? 4,
      payoutSplit: [{ place: 1, percent: 100 }],
      region: "EU",
      platform: "CROSSPLAY",
      rules: {},
      startsAt,
      checkInOpensAt: new Date(startsAt.getTime() - 1800_000),
      checkInClosesAt: new Date(startsAt.getTime() - 300_000),
      status: overrides.status ?? "OPEN",
      joinCode: uid().toUpperCase().slice(0, 7),
      overlayKey: uid(),
    },
  });
}

export async function cleanup() {
  // Tests create isolated users/events; remove anything with the test email domain.
  // Users who appear in the append-only staff action log cannot be deleted (by design), so they stay.
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@test.local" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({
    where: { OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }] },
  });
  await prisma.sanction.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { issuedById: { in: ids } }] },
  });
  await prisma.event.deleteMany({ where: { hosterId: { in: ids } } });
  await prisma.outboxEvent.deleteMany({});
  const logged = await prisma.staffActionLog.findMany({
    where: { staffUserId: { in: ids } },
    select: { staffUserId: true },
    distinct: ["staffUserId"],
  });
  const keep = new Set(logged.map((l) => l.staffUserId));
  await prisma.user.deleteMany({ where: { id: { in: ids.filter((id) => !keep.has(id)) } } });
}
