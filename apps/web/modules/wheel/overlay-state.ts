import { prisma } from "@cod/db";
import type { SpinResult } from "@cod/shared";
import type { OverlayState } from "@cod/realtime";

/** Public overlay payload. Never includes an unrevealed secret. */
export async function overlayState(overlayKey: string): Promise<OverlayState | null> {
  const event = await prisma.event.findUnique({
    where: { overlayKey },
    select: {
      id: true,
      title: true,
      status: true,
      teamSize: true,
      registrations: {
        where: { status: "IN_POOL" },
        select: { player: { select: { id: true, displayName: true } } },
      },
      rounds: { orderBy: { roundNumber: "desc" }, take: 1, include: { spin: true } },
    },
  });
  if (!event) return null;
  const names = new Map(event.registrations.map((r) => [r.player.id, r.player.displayName]));
  const round = event.rounds[0] ?? null;
  const spin = round?.spin ?? null;
  const result = spin?.result as unknown as SpinResult | null;
  return {
    eventId: event.id,
    title: event.title,
    status: event.status,
    teamSize: event.teamSize,
    pool: [...names.values()].sort(),
    round: round ? { number: round.roundNumber, status: round.status } : null,
    spin: spin
      ? {
          id: spin.id,
          status: spin.status,
          commitment: spin.commitment,
          poolHash: spin.poolHash,
          revealedSecret: spin.revealedSecret,
          spunAt: spin.spunAt?.toISOString() ?? null,
          teams: result?.teams.map((t) => t.map((id) => names.get(id) ?? id)) ?? null,
        }
      : null,
  };
}
