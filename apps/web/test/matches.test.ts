import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { expireSubmission, recalculateReputation } from "@cod/core";
import * as reg from "@/modules/registration/service";
import * as events from "@/modules/events/service";
import * as wheel from "@/modules/wheel/service";
import * as matches from "@/modules/matches/service";
import * as rep from "@/modules/reputation/service";
import { cleanup, makeEvent, makeHoster, makeStaff, makeUser } from "./setup";

afterAll(cleanup);

const actorOf = (id: string) => ({ userId: id, staffRole: null, isHoster: false });
const shot = { screenshotUrl: "https://i.imgur.com/scoreboard.png" };

/** Live event with one spun round of two 2-man teams and a match between them. */
async function matchFixture() {
  const { user: hoster, actor } = await makeHoster();
  const event = await makeEvent(hoster.id, { playerCap: 4, teamSize: 2, roundCount: 2 });
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = await makeUser();
    const r = await reg.markPaid(actor, (await reg.register(p.id, event.id)).id);
    await events.openCheckIn(actor, event.id).catch(() => {});
    await reg.checkIn(p.id, r.id);
    players.push(p);
  }
  await events.startEvent(actor, event.id);
  const spin = await wheel.commitSpin(actor, event.id);
  await wheel.executeSpin(actor, spin.id);
  const [match] = await matches.createMatchesForRound(actor, spin.roundId);
  const full = await prisma.match.findUniqueOrThrow({
    where: { id: match!.id },
    include: { teamA: { include: { members: true } }, teamB: { include: { members: true } } },
  });
  const teamA = full.teamA.members.map((m) => m.userId);
  const teamB = full.teamB.members.map((m) => m.userId);
  return { hoster, actor, event, players, match: full, teamA, teamB };
}

describe("result submission and verification", () => {
  it("verifies once an opponent confirms, counts stats, and opens ratings for teammates only", async () => {
    const { match, teamA, teamB, hoster } = await matchFixture();
    const outsider = await makeUser();

    await expect(
      matches.submitResult(actorOf(outsider.id), {
        matchId: match.id,
        ...shot,
        scoreA: 6,
        scoreB: 4,
      }),
    ).rejects.toThrow(/Only players/);
    await expect(
      matches.submitResult(actorOf(teamA[0]!), { matchId: match.id, scoreA: 6, scoreB: 4 }),
    ).rejects.toThrow(/screenshot/);
    await expect(
      matches.submitResult(actorOf(teamA[0]!), {
        matchId: match.id,
        ...shot,
        scoreA: 6,
        scoreB: 4,
        stats: [{ playerId: outsider.id, kills: 1, deaths: 1 }],
      }),
    ).rejects.toThrow(/players in this match/);

    const sub = await matches.submitResult(actorOf(teamA[0]!), {
      matchId: match.id,
      ...shot,
      scoreA: 6,
      scoreB: 4,
      stats: [
        { playerId: teamA[0]!, kills: 9, deaths: 5, plants: 2, defuses: 0 },
        { playerId: teamB[0]!, kills: 4, deaths: 8, plants: 0, defuses: 1 },
      ],
    });
    expect(sub.status).toBe("PENDING");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe(
      "RESULT_PENDING",
    );
    await expect(
      matches.submitResult(actorOf(teamB[0]!), {
        matchId: match.id,
        ...shot,
        scoreA: 6,
        scoreB: 4,
      }),
    ).rejects.toThrow(/already in progress/);

    // Submitter cannot confirm their own; a teammate alone is not enough.
    await expect(
      matches.respondToSubmission(actorOf(teamA[0]!), {
        submissionId: sub.id,
        response: "CONFIRM",
      }),
    ).rejects.toThrow(/You submitted/);
    await matches.respondToSubmission(actorOf(teamA[1]!), {
      submissionId: sub.id,
      response: "CONFIRM",
    });
    expect(
      (await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe("PENDING");
    expect((await matches.pendingConfirmationsFor(teamB[0]!)).map((s) => s.id)).toContain(sub.id);

    // An opponent's confirmation verifies it.
    await matches.respondToSubmission(actorOf(teamB[0]!), {
      submissionId: sub.id,
      response: "CONFIRM",
    });
    const verified = await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(verified.status).toBe("VERIFIED");
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(m.status).toBe("VERIFIED");
    expect(m.winningTeamId).toBe(match.teamAId);
    expect(
      (await prisma.playerMatchStat.findMany({ where: { submissionId: sub.id } })).every(
        (s) => s.verified,
      ),
    ).toBe(true);
    await expect(
      matches.respondToSubmission(actorOf(teamB[1]!), {
        submissionId: sub.id,
        response: "CONFIRM",
      }),
    ).rejects.toThrow(/no longer open/);

    // Reputation picks up verified stats.
    await recalculateReputation(teamA[0]!);
    const summary = await prisma.reputationSummary.findUniqueOrThrow({
      where: { userId: teamA[0]! },
    });
    expect(summary.verifiedMatches).toBe(1);
    expect(summary.verifiedWins).toBe(1);
    expect(summary.kills).toBe(9);

    // Ratings: teammates only, once, never yourself, never the hoster.
    await expect(
      rep.rateTeammate(actorOf(teamA[0]!), {
        matchId: match.id,
        ratedId: teamB[0]!,
        wouldPlayAgain: true,
        communication: 5,
        effort: 5,
      }),
    ).rejects.toThrow(/your team/);
    await expect(
      rep.rateTeammate(actorOf(teamA[0]!), {
        matchId: match.id,
        ratedId: teamA[0]!,
        wouldPlayAgain: true,
        communication: 5,
        effort: 5,
      }),
    ).rejects.toThrow(/yourself/);
    await rep.rateTeammate(actorOf(teamA[0]!), {
      matchId: match.id,
      ratedId: teamA[1]!,
      wouldPlayAgain: true,
      communication: 4,
      effort: 5,
    });
    await expect(
      rep.rateTeammate(actorOf(teamA[0]!), {
        matchId: match.id,
        ratedId: teamA[1]!,
        wouldPlayAgain: true,
        communication: 4,
        effort: 5,
      }),
    ).rejects.toThrow(/already rated/);
    expect(
      (await rep.pendingRatingsFor(teamA[0]!)).flatMap((m) => m.teammates.map((t) => t.id)),
    ).not.toContain(teamA[1]);
    await recalculateReputation(teamA[1]!);
    expect(
      (await prisma.reputationSummary.findUniqueOrThrow({ where: { userId: teamA[1]! } }))
        .wouldPlayAgainPct,
    ).toBe(100);
    expect(hoster.id).toBeTruthy();
  });

  it("disputes go to review; the hoster rules unless involved; rejection reopens the match", async () => {
    const { match, teamA, teamB, actor: hosterActor } = await matchFixture();
    const { actor: trial } = await makeStaff("TRIAL_MODERATOR");
    const sub = await matches.submitResult(actorOf(teamA[0]!), {
      matchId: match.id,
      ...shot,
      scoreA: 6,
      scoreB: 2,
    });
    await expect(
      matches.respondToSubmission(actorOf(teamB[0]!), {
        submissionId: sub.id,
        response: "DISPUTE",
      }),
    ).rejects.toThrow(/reason/);
    await matches.respondToSubmission(actorOf(teamB[0]!), {
      submissionId: sub.id,
      response: "DISPUTE",
      disputeReason: "It was 6-4, see my VOD",
    });
    expect(
      (await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe("DISPUTED");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe(
      "DISPUTED",
    );

    // Players cannot rule; hoster and staff can.
    await expect(
      matches.resolveDispute(actorOf(teamB[1]!), {
        submissionId: sub.id,
        outcome: "VERIFIED",
        reason: "I say it stands",
      }),
    ).rejects.toThrow(/hoster or staff/);
    expect((await matches.reviewQueue(hosterActor)).map((s) => s.id)).toContain(sub.id);
    expect((await matches.reviewQueue(trial)).map((s) => s.id)).toContain(sub.id);

    await matches.resolveDispute(hosterActor, {
      submissionId: sub.id,
      outcome: "REJECTED",
      reason: "VOD at 1:02:10 shows 6-4; resubmit with the right score",
    });
    expect(
      (await prisma.resultSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe("REJECTED");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe(
      "REJECTED",
    );
    expect(
      await prisma.disputeResolution.findUnique({ where: { submissionId: sub.id } }),
    ).not.toBeNull();

    // Fresh submission allowed; staff ruling is logged.
    const sub2 = await matches.submitResult(actorOf(teamB[0]!), {
      matchId: match.id,
      ...shot,
      scoreA: 6,
      scoreB: 4,
    });
    await matches.respondToSubmission(actorOf(teamA[1]!), {
      submissionId: sub2.id,
      response: "DISPUTE",
      disputeReason: "score is wrong",
    });
    await matches.resolveDispute(trial, {
      submissionId: sub2.id,
      outcome: "VERIFIED",
      reason: "Screenshot clearly shows 6-4",
    });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe(
      "VERIFIED",
    );
    const log = await prisma.staffActionLog.findFirst({
      where: { targetType: "match", targetId: match.id },
    });
    expect(log?.action).toBe("dispute.verified");
  });

  it("expiry: auto-verifies with enough confirmations, otherwise sends to review", async () => {
    const f1 = await matchFixture();
    const s1 = await matches.submitResult(actorOf(f1.teamA[0]!), {
      matchId: f1.match.id,
      ...shot,
      scoreA: 6,
      scoreB: 1,
    });
    await prisma.resultSubmission.update({
      where: { id: s1.id },
      data: { verificationDeadline: new Date(Date.now() - 1000) },
    });
    expect(await expireSubmission(s1.id)).toBe("review");
    expect((await prisma.resultSubmission.findUniqueOrThrow({ where: { id: s1.id } })).status).toBe(
      "UNDER_REVIEW",
    );

    const f2 = await matchFixture();
    const s2 = await matches.submitResult(actorOf(f2.teamA[0]!), {
      matchId: f2.match.id,
      ...shot,
      scoreA: 6,
      scoreB: 1,
    });
    // Not yet due: no-op.
    expect(await expireSubmission(s2.id)).toBe("noop");
    await prisma.resultSubmission.update({
      where: { id: s2.id },
      data: { verificationDeadline: new Date(Date.now() - 1000) },
    });
    // Opponent confirmed but nobody else: enough.
    await prisma.confirmation.create({
      data: { submissionId: s2.id, playerId: f2.teamB[0]!, response: "CONFIRM" },
    });
    expect(await expireSubmission(s2.id)).toBe("verified");
  });

  it("participants-only hoster reviews after completion", async () => {
    const { event, actor, players } = await matchFixture();
    const outsider = await makeUser();
    await expect(
      rep.reviewHoster(actorOf(players[0]!.id), {
        eventId: event.id,
        organization: 5,
        communication: 5,
        fairness: 5,
      }),
    ).rejects.toThrow(/completed/);
    await events.completeEvent(actor, event.id);
    await expect(
      rep.reviewHoster(actorOf(outsider.id), {
        eventId: event.id,
        organization: 5,
        communication: 5,
        fairness: 5,
      }),
    ).rejects.toThrow(/took part/);
    await rep.reviewHoster(actorOf(players[0]!.id), {
      eventId: event.id,
      organization: 5,
      communication: 4,
      fairness: 5,
      comment: "Smooth spins",
    });
    await expect(
      rep.reviewHoster(actorOf(players[0]!.id), {
        eventId: event.id,
        organization: 1,
        communication: 1,
        fairness: 1,
      }),
    ).rejects.toThrow(/already/);
    expect(await rep.reviewsForHoster(event.hosterId)).toHaveLength(1);
  });
});
