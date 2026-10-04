import { prisma, emit, type Prisma } from "@cod/db";
import { matchMachine, submissionMachine } from "@cod/shared";

type Tx = Prisma.TransactionClient;

/**
 * Verification rule: no disputes, and at least one confirmation from each
 * team. The submitter's own submission counts as their team's confirmation,
 * so in practice an opponent must confirm, which is the point: opponents have
 * no reason to inflate the other side's stats.
 */
export function isVerifiedByConfirmations(input: {
  submitterId: string;
  teamA: readonly string[];
  teamB: readonly string[];
  confirmations: readonly { playerId: string; response: "CONFIRM" | "DISPUTE" }[];
}): boolean {
  if (input.confirmations.some((c) => c.response === "DISPUTE")) return false;
  const confirmed = new Set([
    input.submitterId,
    ...input.confirmations.filter((c) => c.response === "CONFIRM").map((c) => c.playerId),
  ]);
  return input.teamA.some((p) => confirmed.has(p)) && input.teamB.some((p) => confirmed.has(p));
}

export async function loadMatchForVerification(tx: Tx, matchId: string) {
  return tx.match.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      round: {
        include: { event: { select: { id: true, hosterId: true, mode: true, status: true } } },
      },
      teamA: { include: { members: true } },
      teamB: { include: { members: true } },
    },
  });
}

/** Mark a submission verified: stats count, match gets its winner, MatchVerified fires. */
export async function verifySubmissionInTx(
  tx: Tx,
  submissionId: string,
  matchId: string,
  eventId: string,
  winningTeamId: string,
) {
  const sub = await tx.resultSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  submissionMachine.assertTransition(sub.status, "VERIFIED");
  await tx.resultSubmission.update({
    where: { id: submissionId },
    data: { status: "VERIFIED", resolvedAt: new Date() },
  });
  await tx.playerMatchStat.updateMany({ where: { submissionId }, data: { verified: true } });
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  matchMachine.assertTransition(match.status, "VERIFIED");
  await tx.match.update({ where: { id: matchId }, data: { status: "VERIFIED", winningTeamId } });
  await emit(tx, { type: "MatchVerified", matchId, submissionId, eventId });
}

/**
 * When the verification window closes: auto-verify if confirmations suffice,
 * otherwise the submission is Unconfirmed and goes to review. Idempotent.
 */
export async function expireSubmission(
  submissionId: string,
): Promise<"verified" | "review" | "noop"> {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.resultSubmission.findUnique({
      where: { id: submissionId },
      include: { confirmations: true },
    });
    if (
      !submission ||
      submission.status !== "PENDING" ||
      submission.verificationDeadline > new Date()
    )
      return "noop";
    const match = await loadMatchForVerification(tx, submission.matchId);
    const ok = isVerifiedByConfirmations({
      submitterId: submission.submittedById,
      teamA: match.teamA.members.map((m) => m.userId),
      teamB: match.teamB.members.map((m) => m.userId),
      confirmations: submission.confirmations,
    });
    if (ok) {
      await verifySubmissionInTx(
        tx,
        submission.id,
        match.id,
        match.round.event.id,
        submission.winningTeamId,
      );
      return "verified";
    }
    submissionMachine.assertTransition("PENDING", "UNCONFIRMED");
    submissionMachine.assertTransition("UNCONFIRMED", "UNDER_REVIEW");
    await tx.resultSubmission.update({
      where: { id: submission.id },
      data: { status: "UNDER_REVIEW" },
    });
    matchMachine.assertTransition(match.status, "UNDER_REVIEW");
    await tx.match.update({ where: { id: match.id }, data: { status: "UNDER_REVIEW" } });
    return "review";
  });
}

export async function sweepVerificationWindows(): Promise<number> {
  const due = await prisma.resultSubmission.findMany({
    where: { status: "PENDING", verificationDeadline: { lte: new Date() } },
    select: { id: true },
  });
  for (const s of due) await expireSubmission(s.id);
  return due.length;
}
