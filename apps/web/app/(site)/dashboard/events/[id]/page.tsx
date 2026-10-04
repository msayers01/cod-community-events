import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@cod/db";
import { canManageEvent } from "@cod/shared";
import { getCurrentUser } from "@/lib/session";
import { env } from "@/lib/env";
import { label } from "@/lib/format";
import { StatusTag } from "@/components/event-card";
import { LocalTime } from "@/components/local-time";
import { ManagePanel } from "./manage-panel";
import { LiveEvent } from "@/components/live-event";

export const dynamic = "force-dynamic";

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrations: {
        where: { status: { notIn: ["WITHDRAWN"] } },
        orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }, { createdAt: "asc" }],
        include: {
          player: {
            select: {
              id: true,
              displayName: true,
              activisionId: true,
              streamUrl: true,
              _count: {
                select: {
                  registrations: { where: { status: "NO_SHOW" } },
                  reportsReceived: { where: { status: { notIn: ["DISMISSED"] } } },
                },
              },
            },
          },
        },
      },
      invites: { include: { invitedUser: { select: { displayName: true } } } },
      payoutConfirmations: {
        include: { winner: { select: { displayName: true } } },
        orderBy: { place: "asc" },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          _count: { select: { matches: true } },
          spin: { select: { id: true, status: true, commitment: true, spunAt: true } },
          teams: { include: { members: { include: { user: { select: { displayName: true } } } } } },
        },
      },
    },
  });
  if (!event) notFound();
  if (!canManageEvent(user.actor, { hosterUserId: event.hosterId })) notFound();

  const openDisputes = await prisma.resultSubmission.count({
    where: {
      status: { in: ["DISPUTED", "UNCONFIRMED", "UNDER_REVIEW"] },
      match: { round: { eventId: id } },
    },
  });
  const paid = event.registrations.filter((r) =>
    ["CONFIRMED", "CHECKED_IN", "IN_POOL", "NO_SHOW"].includes(r.status),
  );
  const waitlist = event.registrations.filter((r) => r.status === "WAITLISTED");
  const removed = event.registrations.filter((r) => r.status === "REMOVED");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            <StatusTag status={event.status} />
            <LiveEvent eventId={event.id} />
          </div>
          <p className="text-sm text-muted">
            <LocalTime date={event.startsAt} /> · {event.teamSize}v{event.teamSize}{" "}
            {label(event.format)} · {paid.filter((r) => r.status !== "NO_SHOW").length}/
            {event.playerCap} paid
          </p>
        </div>
        <Link href={`/events/${event.slug}`} className="btn">
          Public page
        </Link>
      </header>

      <ManagePanel
        event={{
          id: event.id,
          status: event.status,
          joinCode: event.joinCode,
          overlayKey: event.overlayKey,
          appUrl: env.appUrl,
          roundCount: event.roundCount,
          teamSize: event.teamSize,
          poolSize: event.registrations.filter((r) => r.status === "IN_POOL").length,
          payoutPlaces: (event.payoutSplit as { place: number; percent: number }[])
            .filter((p) => p.percent > 0)
            .map((p) => p.place),
          poolPlayers: event.registrations
            .filter((r) => r.status === "IN_POOL")
            .map((r) => ({ id: r.player.id, displayName: r.player.displayName })),
          winners: event.payoutConfirmations.map((p) => ({
            place: p.place,
            displayName: p.winner.displayName,
            response: p.response,
          })),
          winnersRecorded: !!event.winnersRecordedAt,
          slug: event.slug,
          entryType: event.entryType,
          invites: event.invites.map((i) => ({
            displayName: i.invitedUser.displayName,
            status: i.status,
          })),
          openDisputes,
        }}
        rounds={event.rounds.map((r) => ({
          id: r.id,
          roundNumber: r.roundNumber,
          status: r.status,
          spin: r.spin,
          matchCount: r._count.matches,
          teams: r.teams.map((t) => ({
            label: t.label,
            members: t.members.map((m) => m.user.displayName),
          })),
        }))}
        waitlist={waitlist.map(toRow)}
        paid={paid.map(toRow)}
        removed={removed.map(toRow)}
      />
    </div>
  );
}

type Reg = {
  id: string;
  status: string;
  waitlistPosition: number | null;
  source: string;
  blacklistFlagged: boolean;
  checkedInAt: Date | null;
  player: {
    displayName: string;
    activisionId: string | null;
    streamUrl: string | null;
    _count: { registrations: number; reportsReceived: number };
  };
};

function toRow(r: Reg) {
  return {
    id: r.id,
    status: r.status,
    waitlistPosition: r.waitlistPosition,
    source: r.source,
    flagged: r.blacklistFlagged,
    checkedIn: !!r.checkedInAt,
    displayName: r.player.displayName,
    activisionId: r.player.activisionId,
    streamUrl: r.player.streamUrl,
    noShows: r.player._count.registrations,
    openReports: r.player._count.reportsReceived,
  };
}
