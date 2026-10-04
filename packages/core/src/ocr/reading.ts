import { prisma, emit, type Prisma } from "@cod/db";
import {
  compareToSubmitted,
  matchRows,
  parseScoreboard,
  planFill,
  type MatchedRow,
  type PlayerCandidate,
  type ReadStats,
} from "./scoreboard.js";

/** A text-recognition engine. Tesseract today; swap in Cloud Vision or Textract behind this. */
export interface OcrEngine {
  readonly name: string;
  recognize(image: Buffer): Promise<{ text: string; confidence: number }>;
}

/** Fetches the screenshot bytes for a submission, or null when it can't be read automatically. */
export type ScreenshotLoader = (source: {
  screenshotKey: string | null;
  screenshotUrl: string | null;
}) => Promise<Buffer | null>;

export const MAX_READING_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 10;

/** Ask for a reading of this submission's screenshot. Idempotent. Call inside the submit transaction. */
export async function queueScreenshotReading(
  tx: Prisma.TransactionClient,
  submissionId: string,
): Promise<void> {
  await tx.screenshotReading.upsert({
    where: { submissionId },
    update: {},
    create: { submissionId },
  });
}

/** Claim readings for this worker. Safe to run from several workers at once. */
export async function claimPendingReadings(limit = 5): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "screenshot_reading"
    SET status = 'PROCESSING', "startedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "screenshot_reading"
      WHERE status = 'PENDING'
         OR (status = 'PROCESSING' AND "startedAt" < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES}))
      ORDER BY "createdAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows.map((r) => r.id);
}

const activisionName = (id: string | null) => (id ? id.replace(/#\d+$/, "") : null);

/**
 * Read one claimed screenshot. The reading is advisory: it never verifies a result.
 * It (1) records what the screenshot says, (2) highlights fields where it disagrees with
 * the submitted stats, and (3) pre-fills stats the submitter left blank, as unverified
 * rows that the confirmers see and can dispute.
 */
export async function processReading(
  readingId: string,
  deps: { engine: OcrEngine; load: ScreenshotLoader },
): Promise<"completed" | "skipped" | "retry" | "failed" | "noop"> {
  const reading = await prisma.screenshotReading.findUnique({
    where: { id: readingId },
    include: {
      submission: {
        include: {
          stats: true,
          match: {
            include: {
              teamA: { include: { members: { include: { user: true } } } },
              teamB: { include: { members: { include: { user: true } } } },
              round: { select: { eventId: true } },
            },
          },
        },
      },
    },
  });
  if (!reading || reading.status !== "PROCESSING") return "noop";
  const { submission } = reading;

  try {
    const image = await deps.load({
      screenshotKey: submission.screenshotKey,
      screenshotUrl: submission.screenshotUrl,
    });
    if (!image) {
      await prisma.screenshotReading.update({
        where: { id: readingId },
        data: {
          status: "SKIPPED",
          error: "Screenshot is not stored in a place the reader can access",
          completedAt: new Date(),
        },
      });
      return "skipped";
    }

    const { text, confidence } = await deps.engine.recognize(image);
    const members = [...submission.match.teamA.members, ...submission.match.teamB.members];
    const candidates: PlayerCandidate[] = members.map((m) => ({
      playerId: m.userId,
      names: [m.user.displayName, activisionName(m.user.activisionId)].filter(
        (n): n is string => !!n,
      ),
    }));
    const matched: MatchedRow[] = matchRows(parseScoreboard(text).rows, candidates);

    const manual = submission.stats.filter((s) => s.source === "MANUAL");
    const discrepancies = compareToSubmitted(
      matched,
      manual.map((s) => ({
        playerId: s.playerId,
        kills: s.kills,
        deaths: s.deaths,
        ...(s.plants !== null && { plants: s.plants }),
        ...(s.defuses !== null && { defuses: s.defuses }),
        ...(s.hillTimeSeconds !== null && { hillTimeSeconds: s.hillTimeSeconds }),
      })),
    );
    const fill: ({ playerId: string } & ReadStats)[] =
      manual.length === 0
        ? planFill({ rows: matched, participants: members.length, confidence })
        : [];

    await prisma.$transaction(async (tx) => {
      // Only fill while the result is still open for confirmation; never change verified data.
      const fresh = await tx.resultSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        select: { status: true },
      });
      const filled = fill.length > 0 && fresh.status === "PENDING";
      if (filled) {
        await tx.playerMatchStat.createMany({
          data: fill.map((f) => ({
            matchId: submission.matchId,
            submissionId: submission.id,
            playerId: f.playerId,
            kills: f.kills ?? 0,
            deaths: f.deaths ?? 0,
            plants: f.plants,
            defuses: f.defuses,
            hillTimeSeconds: f.hillTimeSeconds,
            source: "OCR" as const,
          })),
          skipDuplicates: true,
        });
      }
      await tx.screenshotReading.update({
        where: { id: readingId },
        data: {
          status: "COMPLETED",
          provider: deps.engine.name,
          rawText: text,
          confidence,
          rows: matched as unknown as Prisma.InputJsonValue,
          discrepancies: discrepancies as unknown as Prisma.InputJsonValue,
          filledStats: filled,
          error: null,
          completedAt: new Date(),
        },
      });
      await emit(tx, {
        type: "ScreenshotRead",
        submissionId: submission.id,
        matchId: submission.matchId,
        eventId: submission.match.round.eventId,
      });
    });
    return "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = reading.attempts >= MAX_READING_ATTEMPTS;
    await prisma.screenshotReading.update({
      where: { id: readingId },
      data: {
        status: giveUp ? "FAILED" : "PENDING",
        error: message.slice(0, 500),
        completedAt: giveUp ? new Date() : null,
      },
    });
    return giveUp ? "failed" : "retry";
  }
}

/** Claim and process a batch. Returns how many readings were attempted. */
export async function processPendingReadings(
  deps: { engine: OcrEngine; load: ScreenshotLoader },
  limit = 3,
): Promise<number> {
  const ids = await claimPendingReadings(limit);
  for (const id of ids) await processReading(id, deps);
  return ids.length;
}
